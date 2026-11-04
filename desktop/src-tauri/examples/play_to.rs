//! Test helper: play a 16-bit PCM WAV into a specific output device (simulates the other side of a call).
//! cargo run --example play_to -- "Line 1" speech.wav
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

fn main() {
    let mut args = std::env::args().skip(1);
    let want = args.next().expect("device name substring");
    let path = args.next().expect("wav path");
    let bytes = std::fs::read(&path).unwrap();

    // Minimal RIFF parse: find fmt + data chunks.
    let (mut rate, mut channels, mut data) = (0u32, 0u16, &bytes[0..0]);
    let mut i = 12;
    while i + 8 <= bytes.len() {
        let id = &bytes[i..i + 4];
        let len = u32::from_le_bytes(bytes[i + 4..i + 8].try_into().unwrap()) as usize;
        let body = &bytes[i + 8..(i + 8 + len).min(bytes.len())];
        if id == b"fmt " {
            channels = u16::from_le_bytes([body[2], body[3]]);
            rate = u32::from_le_bytes(body[4..8].try_into().unwrap());
        } else if id == b"data" {
            data = body;
        }
        i += 8 + len + (len & 1);
    }
    let samples: Vec<f32> = data
        .chunks_exact(2 * channels as usize)
        .map(|f| i16::from_le_bytes([f[0], f[1]]) as f32 / 32768.0)
        .collect();

    let host = cpal::default_host();
    let dev = host
        .output_devices()
        .unwrap()
        .find(|d| d.to_string().contains(&want))
        .expect("device not found");
    let cfg = dev.default_output_config().unwrap();
    let out_rate = cfg.sample_rate();
    let out_ch = cfg.channels() as usize;
    println!("playing {} samples @{rate} Hz → {dev} @{out_rate} Hz x{out_ch}", samples.len());

    let step = rate as f64 / out_rate as f64;
    let pos = Arc::new(AtomicUsize::new(0));
    let p = pos.clone();
    let total = samples.len();
    let stream = dev
        .build_output_stream::<f32, _, _>(
            cfg.config(),
            move |out: &mut [f32], _| {
                let mut n = p.load(Ordering::Relaxed);
                for frame in out.chunks_mut(out_ch) {
                    let idx = (n as f64 * step) as usize;
                    let v = samples.get(idx).copied().unwrap_or(0.0);
                    frame.iter_mut().for_each(|s| *s = v);
                    n += 1;
                }
                p.store(n, Ordering::Relaxed);
            },
            |e| eprintln!("{e}"),
            None,
        )
        .unwrap();
    stream.play().unwrap();
    while ((pos.load(Ordering::Relaxed) as f64) * step) < total as f64 {
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    std::thread::sleep(std::time::Duration::from_millis(300));
}
