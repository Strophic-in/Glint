//! Screenshot of the monitor under the cursor → downscaled JPEG → base64.
//! The overlay is excluded from capture (WDA_EXCLUDEFROMCAPTURE), so the model never sees it.
//!
//! While live, a watcher keeps a recent frame of the screen (including whatever someone is
//! sharing in the call) so an auto-answer can attach it without waiting for a capture.

use crate::state::AppState;
use anyhow::Context;
use base64::Engine;
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use xcap::image::{codecs::jpeg::JpegEncoder, imageops::FilterType, DynamicImage, RgbaImage};
use xcap::Monitor;

const MAX_WIDTH: u32 = 1600;
const QUALITY: u8 = 75;
/// How often the watcher looks at the screen, and how old a frame an auto-answer may use.
const WATCH_EVERY: Duration = Duration::from_millis(1500);
pub const FRESH_FOR: Duration = Duration::from_millis(2500);

pub struct Frame {
    pub at: Instant,
    pub jpeg_b64: String,
    sig: u64,
}

fn capture_rgba() -> anyhow::Result<RgbaImage> {
    let monitor = crate::win::cursor_pos()
        .and_then(|(x, y)| Monitor::from_point(x, y).ok())
        .or_else(|| {
            Monitor::all()
                .ok()?
                .into_iter()
                .find(|m| m.is_primary().unwrap_or(false))
        })
        .context("no monitor found")?;
    monitor.capture_image().context("screen capture failed")
}

/// Cheap fingerprint (FNV-1a over a sparse grid of pixels) to skip re-encoding an unchanged screen.
fn signature(img: &RgbaImage) -> u64 {
    let (w, h) = img.dimensions();
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325 ^ ((w as u64) << 32 | h as u64);
    for y in (0..h).step_by(12) {
        for x in (0..w).step_by(12) {
            for b in img.get_pixel(x, y).0 {
                hash = (hash ^ b as u64).wrapping_mul(0x0100_0000_01b3);
            }
        }
    }
    hash
}

fn encode(img: RgbaImage) -> anyhow::Result<String> {
    let img = DynamicImage::ImageRgba8(img);
    let img = if img.width() > MAX_WIDTH {
        let h = (img.height() as u64 * MAX_WIDTH as u64 / img.width() as u64) as u32;
        img.resize_exact(MAX_WIDTH, h.max(1), FilterType::Triangle)
    } else {
        img
    };
    let rgb = img.to_rgb8();
    let mut out = Vec::with_capacity(400_000);
    JpegEncoder::new_with_quality(&mut out, QUALITY).encode_image(&rgb)?;
    Ok(base64::engine::general_purpose::STANDARD.encode(out))
}

pub fn capture_jpeg_b64() -> anyhow::Result<String> {
    encode(capture_rgba()?)
}

/// A frame from the watcher if it is recent enough to stand for "the screen right now".
pub fn fresh_frame(state: &AppState) -> Option<String> {
    let frame = state.screen_frame.lock().unwrap();
    frame.as_ref().filter(|f| f.at.elapsed() <= FRESH_FOR).map(|f| f.jpeg_b64.clone())
}

/// Start or stop the background watcher. Each start gets a new generation; an older thread
/// notices it is stale and exits.
pub fn watch(app: &AppHandle, on: bool) {
    let state = app.state::<AppState>();
    let gen = state.screen_watch.fetch_add(1, Ordering::SeqCst) + 1;
    if !on {
        *state.screen_frame.lock().unwrap() = None;
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        while state.screen_watch.load(Ordering::SeqCst) == gen {
            if let Ok(img) = capture_rgba() {
                let sig = signature(&img);
                let unchanged = {
                    let mut frame = state.screen_frame.lock().unwrap();
                    match frame.as_mut() {
                        Some(f) if f.sig == sig => {
                            f.at = Instant::now();
                            true
                        }
                        _ => false,
                    }
                };
                if !unchanged {
                    if let Ok(jpeg_b64) = encode(img) {
                        if state.screen_watch.load(Ordering::SeqCst) == gen {
                            *state.screen_frame.lock().unwrap() = Some(Frame { at: Instant::now(), jpeg_b64, sig });
                        }
                    }
                }
            }
            std::thread::sleep(WATCH_EVERY);
        }
    });
}
