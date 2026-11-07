//! Mic + system audio (WASAPI loopback) → mono 24 kHz PCM16 → energy VAD gate.
//!
//! The gate only forwards speech (with 300 ms pre-roll) and emits a Commit at the end of each
//! utterance. That halves upload + transcription cost and lets us decide turn boundaries locally,
//! which keeps latency predictable.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, SampleFormat, SizedSample, Stream, StreamConfig};
use std::borrow::Cow;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc as std_mpsc, Arc};
use std::time::{Duration, Instant};
use tokio::sync::mpsc::UnboundedSender;

pub const RATE: u32 = 24_000;
const FRAME: usize = 480; // 20 ms
const CHUNK_FRAMES: usize = 5; // upload in 100 ms chunks
const PREROLL_FRAMES: usize = 15; // 300 ms before speech onset
const ONSET_FRAMES: usize = 3; // 60 ms above threshold = speech
const MAX_UTTERANCE_FRAMES: usize = 750; // force a commit every 15 s of continuous speech

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Src {
    You = 0,
    Them = 1,
}

impl Src {
    pub fn name(self) -> &'static str {
        match self {
            Src::You => "you",
            Src::Them => "them",
        }
    }
}

pub enum AudioEvent {
    Audio(Src, Vec<i16>),
    Commit(Src),
    Level(Src, f32),
    Warning(Src, String),
}

pub struct AudioOpts {
    pub mic: bool,
    pub system: bool,
    pub mic_device: Option<String>,
    /// Output device to loopback-capture. None = Windows default (calls often use a headset instead).
    pub system_device: Option<String>,
}

/// Stops capture when dropped.
pub struct AudioHandle {
    stop: Arc<AtomicBool>,
}

impl Drop for AudioHandle {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
    }
}

pub fn list_mics() -> Vec<String> {
    cpal::default_host()
        .input_devices()
        .map(|it| it.map(|d| d.to_string()).collect())
        .unwrap_or_default()
}

pub fn list_outputs() -> Vec<String> {
    cpal::default_host()
        .output_devices()
        .map(|it| it.map(|d| d.to_string()).collect())
        .unwrap_or_default()
}

/// Start capture on a dedicated thread (cpal streams must stay on the thread that built them).
/// Returns the handle plus non-fatal warnings (e.g. mic missing but system audio OK).
pub fn start(opts: AudioOpts, tx: UnboundedSender<AudioEvent>) -> Result<(AudioHandle, Vec<String>), String> {
    let stop = Arc::new(AtomicBool::new(false));
    let stop_thread = stop.clone();
    let (ready_tx, ready_rx) = std_mpsc::channel::<Result<Vec<String>, String>>();

    std::thread::Builder::new()
        .name("glint-audio".into())
        .spawn(move || {
            let host = cpal::default_host();
            let mut streams: Vec<Stream> = Vec::new();
            let mut warnings = Vec::new();
            if opts.mic {
                match open_mic(&host, opts.mic_device.as_deref(), tx.clone()) {
                    Ok(s) => streams.push(s),
                    Err(e) => warnings.push(format!("Microphone unavailable: {e}")),
                }
            }
            if opts.system {
                match open_loopback(&host, opts.system_device.as_deref(), tx.clone()) {
                    Ok(s) => streams.push(s),
                    Err(e) => warnings.push(format!("System audio unavailable: {e}")),
                }
            }
            for s in &streams {
                if let Err(e) = s.play() {
                    warnings.push(e.to_string());
                }
            }
            if streams.is_empty() {
                let msg = if warnings.is_empty() { "Turn on the mic or system audio in Settings.".into() } else { warnings.join(" · ") };
                let _ = ready_tx.send(Err(msg));
                return;
            }
            let _ = ready_tx.send(Ok(warnings));
            while !stop_thread.load(Ordering::SeqCst) {
                std::thread::sleep(Duration::from_millis(100));
            }
            drop(streams);
        })
        .map_err(|e| e.to_string())?;

    let warnings = ready_rx
        .recv_timeout(Duration::from_secs(6))
        .map_err(|_| "Audio devices did not respond.".to_string())??;
    Ok((AudioHandle { stop }, warnings))
}

fn open_mic(host: &cpal::Host, name: Option<&str>, tx: UnboundedSender<AudioEvent>) -> Result<Stream, String> {
    let chosen = match name.filter(|n| !n.is_empty()) {
        Some(n) => host.input_devices().ok().and_then(|mut it| it.find(|d| d.to_string() == n)),
        None => None,
    };
    let device = chosen.or_else(|| host.default_input_device()).ok_or("no microphone found")?;
    let supported = device.default_input_config().map_err(|e| e.to_string())?;
    build(&device, supported.sample_format(), supported.config(), Src::You, tx)
}

/// WASAPI turns an input stream on an output device into a loopback capture of what it plays.
fn open_loopback(host: &cpal::Host, name: Option<&str>, tx: UnboundedSender<AudioEvent>) -> Result<Stream, String> {
    let chosen = match name.filter(|n| !n.is_empty()) {
        Some(n) => host.output_devices().ok().and_then(|mut it| it.find(|d| d.to_string() == n)),
        None => None,
    };
    let device = chosen
        .or_else(|| host.default_output_device())
        .ok_or("no speakers or headphones found")?;
    let supported = device.default_output_config().map_err(|e| e.to_string())?;
    build(&device, supported.sample_format(), supported.config(), Src::Them, tx)
}

fn build(
    device: &cpal::Device,
    format: SampleFormat,
    config: StreamConfig,
    src: Src,
    tx: UnboundedSender<AudioEvent>,
) -> Result<Stream, String> {
    match format {
        SampleFormat::F32 => build_typed::<f32>(device, config, src, tx),
        SampleFormat::I16 => build_typed::<i16>(device, config, src, tx),
        SampleFormat::I32 => build_typed::<i32>(device, config, src, tx),
        SampleFormat::U16 => build_typed::<u16>(device, config, src, tx),
        SampleFormat::U8 => build_typed::<u8>(device, config, src, tx),
        SampleFormat::F64 => build_typed::<f64>(device, config, src, tx),
        other => Err(format!("unsupported sample format {other:?}")),
    }
}

fn build_typed<T>(
    device: &cpal::Device,
    config: StreamConfig,
    src: Src,
    tx: UnboundedSender<AudioEvent>,
) -> Result<Stream, String>
where
    T: SizedSample + Send + 'static,
    f32: FromSample<T>,
{
    let mut proc = Processor::new(src, config.sample_rate, config.channels as usize, tx.clone());
    let warn_tx = tx;
    let mut errors = StreamErrors::default();
    device
        .build_input_stream::<T, _, _>(
            config,
            move |data: &[T], _| proc.push(data),
            move |e| {
                if let Some(message) = errors.notice(src, &e) {
                    let _ = warn_tx.send(AudioEvent::Warning(src, message));
                }
            },
            None,
        )
        .map_err(|e| e.to_string())
}

/// Turns cpal's stream errors into the few notices worth showing. WASAPI reports every dropped
/// buffer as an "underrun or overrun" (Xrun): on loopback that happens whenever the call's sound
/// starts or stops, costs a few milliseconds and doesn't hurt transcription, so a single one is
/// never shown. Only a sustained burst (the audio really breaking up) or a lost device is, and at
/// most one notice per source every 30 s.
#[derive(Default)]
struct StreamErrors {
    xruns: VecDeque<Instant>,
    last_notice: Option<Instant>,
}

impl StreamErrors {
    const BURST: usize = 40;
    const WINDOW: Duration = Duration::from_secs(10);
    const QUIET: Duration = Duration::from_secs(30);

    fn notice(&mut self, src: Src, e: &cpal::Error) -> Option<String> {
        let side = match src {
            Src::You => "your microphone",
            Src::Them => "the call audio",
        };
        let message = match e.kind() {
            cpal::ErrorKind::Xrun => {
                let now = Instant::now();
                self.xruns.push_back(now);
                while self.xruns.front().is_some_and(|t| now.duration_since(*t) > Self::WINDOW) {
                    self.xruns.pop_front();
                }
                if self.xruns.len() < Self::BURST {
                    return None;
                }
                self.xruns.clear();
                format!("Audio from {side} is breaking up, so some words may be missed. Closing heavy apps usually fixes it.")
            }
            // The default device changed and the stream followed it: nothing to tell the user.
            cpal::ErrorKind::DeviceChanged => return None,
            cpal::ErrorKind::DeviceNotAvailable => {
                format!("Lost {side}: the device was disconnected. Pick another one in Settings → Audio.")
            }
            cpal::ErrorKind::PermissionDenied => {
                format!("Windows blocked access to {side}. Allow it in Windows Settings → Privacy → Microphone.")
            }
            _ => format!("Problem with {side}: {e}"),
        };
        if self.last_notice.is_some_and(|t| t.elapsed() < Self::QUIET) {
            return None;
        }
        self.last_notice = Some(Instant::now());
        Some(message)
    }
}

struct Processor {
    channels: usize,
    resampler: Resampler,
    gate: Gate,
    tx: UnboundedSender<AudioEvent>,
    mono: Vec<f32>,
    resampled: Vec<f32>,
    frame: Vec<f32>,
}

impl Processor {
    fn new(src: Src, rate: u32, channels: usize, tx: UnboundedSender<AudioEvent>) -> Self {
        Self {
            channels: channels.max(1),
            resampler: Resampler::new(rate),
            gate: Gate::new(src),
            tx,
            mono: Vec::with_capacity(4096),
            resampled: Vec::with_capacity(4096),
            frame: Vec::with_capacity(FRAME),
        }
    }

    fn push<T>(&mut self, data: &[T])
    where
        T: SizedSample,
        f32: FromSample<T>,
    {
        self.mono.clear();
        let inv = 1.0 / self.channels as f32;
        for ch in data.chunks(self.channels) {
            self.mono.push(ch.iter().map(|&s| f32::from_sample_(s)).sum::<f32>() * inv);
        }
        self.resampled.clear();
        self.resampler.process(&self.mono, &mut self.resampled);
        for i in 0..self.resampled.len() {
            self.frame.push(self.resampled[i]);
            if self.frame.len() == FRAME {
                self.gate.frame(&self.frame, &self.tx);
                self.frame.clear();
            }
        }
    }
}

/// Streaming linear-interpolation resampler with a light anti-alias filter when downsampling.
/// Plenty for speech-to-text.
struct Resampler {
    ratio: f64,
    pos: f64,
    prev: f32,
    taps: [f32; 2],
    filter: bool,
}

impl Resampler {
    fn new(in_rate: u32) -> Self {
        let ratio = in_rate.max(1) as f64 / RATE as f64;
        Self { ratio, pos: 0.0, prev: 0.0, taps: [0.0; 2], filter: ratio > 1.2 }
    }

    fn process(&mut self, input: &[f32], out: &mut Vec<f32>) {
        if input.is_empty() {
            return;
        }
        if (self.ratio - 1.0).abs() < 1e-9 {
            out.extend_from_slice(input);
            return;
        }
        let x: Cow<[f32]> = if self.filter {
            let mut v = Vec::with_capacity(input.len());
            for &s in input {
                v.push((self.taps[0] + 2.0 * self.taps[1] + s) * 0.25);
                self.taps = [self.taps[1], s];
            }
            Cow::Owned(v)
        } else {
            Cow::Borrowed(input)
        };
        // Virtual stream: index 0 = last sample of the previous block, index k = x[k-1].
        let n = x.len();
        while self.pos < n as f64 {
            let i = self.pos as usize;
            let frac = (self.pos - i as f64) as f32;
            let a = if i == 0 { self.prev } else { x[i - 1] };
            let b = x[i];
            out.push(a + (b - a) * frac);
            self.pos += self.ratio;
        }
        self.pos -= n as f64;
        self.prev = x[n - 1];
    }
}

/// Adaptive energy gate. Tracks the noise floor while quiet; speech = 60 ms above 3× floor.
struct Gate {
    src: Src,
    speaking: bool,
    noise: f32,
    min_on: f32,
    hangover: usize,
    above: usize,
    silent: usize,
    utter_frames: usize,
    preroll: VecDeque<Vec<i16>>,
    pending: Vec<i16>,
    level: f32,
    level_frames: usize,
    stats: Stats,
}

/// GLINT_DEBUG_AUDIO=1 prints gate statistics every 2 s (to tune thresholds on real hardware).
#[derive(Default)]
struct Stats {
    frames: usize,
    peak: f32,
    sent: usize,
    commits: usize,
}

fn debug_audio() -> bool {
    static ON: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *ON.get_or_init(|| std::env::var("GLINT_DEBUG_AUDIO").is_ok_and(|v| v == "1"))
}

impl Gate {
    fn new(src: Src) -> Self {
        let them = src == Src::Them;
        Self {
            src,
            speaking: false,
            // Loopback is a clean digital signal; the mic has room noise.
            noise: if them { 0.001 } else { 0.004 },
            min_on: if them { 0.004 } else { 0.010 },
            // End-of-turn silence: 600 ms for the other side (answer fast), 800 ms for the user.
            hangover: if them { 30 } else { 40 },
            above: 0,
            silent: 0,
            utter_frames: 0,
            preroll: VecDeque::with_capacity(PREROLL_FRAMES + 1),
            pending: Vec::with_capacity(FRAME * CHUNK_FRAMES * 4),
            level: 0.0,
            level_frames: 0,
            stats: Stats::default(),
        }
    }

    fn frame(&mut self, f: &[f32], tx: &UnboundedSender<AudioEvent>) {
        let rms = (f.iter().map(|x| x * x).sum::<f32>() / f.len() as f32).sqrt();

        if debug_audio() {
            let s = &mut self.stats;
            s.frames += 1;
            s.peak = s.peak.max(rms);
            if s.frames % 100 == 0 {
                eprintln!(
                    "[audio {}] peak_rms={:.4} noise={:.4} on={:.4} speaking={} sent_samples={} commits={}",
                    self.src.name(),
                    s.peak,
                    self.noise,
                    (self.noise * 3.0).max(self.min_on),
                    self.speaking,
                    s.sent,
                    s.commits
                );
                s.peak = 0.0;
            }
        }

        self.level = self.level.max(rms);
        self.level_frames += 1;
        if self.level_frames == 5 {
            let _ = tx.send(AudioEvent::Level(self.src, (self.level * 6.0).min(1.0)));
            self.level = 0.0;
            self.level_frames = 0;
        }

        let on = (self.noise * 3.0).max(self.min_on);
        let off = on * 0.6;
        let pcm: Vec<i16> = f.iter().map(|x| (x.clamp(-1.0, 1.0) * 32767.0) as i16).collect();

        if !self.speaking {
            // Fall quickly, rise slowly: the floor follows quiet rooms but ignores short bursts.
            let k = if rms < self.noise { 0.1 } else { 0.005 };
            self.noise = (self.noise * (1.0 - k) + rms * k).clamp(0.0003, 0.05);
            self.preroll.push_back(pcm);
            if self.preroll.len() > PREROLL_FRAMES {
                self.preroll.pop_front();
            }
            self.above = if rms > on { self.above + 1 } else { 0 };
            if self.above >= ONSET_FRAMES {
                self.speaking = true;
                self.above = 0;
                self.silent = 0;
                self.utter_frames = 0;
                for p in self.preroll.drain(..) {
                    self.pending.extend_from_slice(&p);
                }
                self.flush(tx);
            }
            return;
        }

        self.pending.extend_from_slice(&pcm);
        self.utter_frames += 1;
        self.silent = if rms < off { self.silent + 1 } else { 0 };
        if self.pending.len() >= FRAME * CHUNK_FRAMES {
            self.flush(tx);
        }
        if self.silent >= self.hangover {
            self.commit(tx);
            self.speaking = false;
            self.silent = 0;
        } else if self.utter_frames >= MAX_UTTERANCE_FRAMES {
            self.commit(tx);
            self.utter_frames = 0;
        }
    }

    fn flush(&mut self, tx: &UnboundedSender<AudioEvent>) {
        if !self.pending.is_empty() {
            self.stats.sent += self.pending.len();
            let _ = tx.send(AudioEvent::Audio(self.src, std::mem::take(&mut self.pending)));
        }
    }

    fn commit(&mut self, tx: &UnboundedSender<AudioEvent>) {
        self.flush(tx);
        self.stats.commits += 1;
        let _ = tx.send(AudioEvent::Commit(self.src));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resampler_halves_48k() {
        let mut r = Resampler::new(48_000);
        let mut out = Vec::new();
        for _ in 0..10 {
            r.process(&vec![0.5; 960], &mut out);
        }
        assert!((out.len() as i64 - 4800).abs() <= 1, "got {}", out.len());
        assert!(out[100..].iter().all(|&s| (s - 0.5).abs() < 1e-3));
    }

    #[test]
    fn resampler_44k1_rate_is_exact_over_time() {
        let mut r = Resampler::new(44_100);
        let mut out = Vec::new();
        for _ in 0..100 {
            r.process(&vec![0.0; 441], &mut out);
        }
        assert!((out.len() as i64 - 24_000).abs() <= 1, "got {}", out.len());
    }

    #[test]
    fn gate_sends_speech_and_commits_after_silence() {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let mut g = Gate::new(Src::Them);
        let quiet = vec![0.0005f32; FRAME];
        let loud: Vec<f32> = (0..FRAME).map(|i| ((i as f32) * 0.3).sin() * 0.2).collect();
        for _ in 0..20 {
            g.frame(&quiet, &tx);
        }
        for _ in 0..25 {
            g.frame(&loud, &tx);
        }
        for _ in 0..40 {
            g.frame(&quiet, &tx);
        }
        let (mut samples, mut commits) = (0usize, 0usize);
        while let Ok(ev) = rx.try_recv() {
            match ev {
                AudioEvent::Audio(_, pcm) => samples += pcm.len(),
                AudioEvent::Commit(_) => commits += 1,
                _ => {}
            }
        }
        assert_eq!(commits, 1);
        // 300 ms pre-roll + 500 ms speech + 600 ms hangover ≈ 1.4 s; nothing from the leading silence.
        assert!(samples >= FRAME * 60 && samples <= FRAME * 72, "samples {samples}");
    }
}
