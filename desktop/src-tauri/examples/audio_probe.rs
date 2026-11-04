//! Diagnostic: loopback-capture every output device and capture every input device for 6 s,
//! printing peak levels. Plays nothing itself.  cargo run --example audio_probe
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

fn main() {
    let host = cpal::default_host();
    if let Some(d) = host.default_output_device() {
        println!("default output: {d}");
    }
    if let Some(d) = host.default_input_device() {
        println!("default input:  {d}");
    }
    let mut probes: Vec<(String, Arc<AtomicU32>, cpal::Stream)> = vec![];
    let devices: Vec<(String, cpal::Device, bool)> = host
        .output_devices()
        .unwrap()
        .map(|d| (format!("loopback {d}"), d, true))
        .chain(host.input_devices().unwrap().map(|d| (format!("input    {d}"), d, false)))
        .collect();
    for (label, dev, is_out) in devices {
        let cfg = if is_out { dev.default_output_config() } else { dev.default_input_config() };
        let Ok(cfg) = cfg else {
            println!("{label}: no config");
            continue;
        };
        if cfg.sample_format() != cpal::SampleFormat::F32 {
            println!("{label}: format {:?} (skipped)", cfg.sample_format());
            continue;
        }
        let peak = Arc::new(AtomicU32::new(0));
        let p = peak.clone();
        match dev.build_input_stream::<f32, _, _>(
            cfg.config(),
            move |data: &[f32], _| {
                let m = data.iter().fold(0f32, |a, &x| a.max(x.abs()));
                p.fetch_max(m.to_bits(), Ordering::Relaxed);
            },
            |_| {},
            None,
        ) {
            Ok(s) => {
                s.play().unwrap();
                probes.push((label, peak, s));
            }
            Err(e) => println!("{label}: {e}"),
        }
    }
    for sec in 1..=6 {
        std::thread::sleep(std::time::Duration::from_secs(1));
        let line: Vec<String> = probes
            .iter()
            .map(|(l, p, _)| format!("{}={:.4}", &l[..l.len().min(30)], f32::from_bits(p.swap(0, Ordering::Relaxed))))
            .collect();
        println!("t={sec}s  {}", line.join(" | "));
    }
}
