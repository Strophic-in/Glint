//! Screenshot of the monitor under the cursor → downscaled JPEG → base64.
//! The overlay is excluded from capture (WDA_EXCLUDEFROMCAPTURE), so the model never sees it.

use anyhow::Context;
use base64::Engine;
use xcap::image::{codecs::jpeg::JpegEncoder, imageops::FilterType, DynamicImage};
use xcap::Monitor;

pub fn capture_jpeg_b64(max_width: u32, quality: u8) -> anyhow::Result<String> {
    let monitor = crate::win::cursor_pos()
        .and_then(|(x, y)| Monitor::from_point(x, y).ok())
        .or_else(|| {
            Monitor::all()
                .ok()?
                .into_iter()
                .find(|m| m.is_primary().unwrap_or(false))
        })
        .context("no monitor found")?;
    let img = DynamicImage::ImageRgba8(monitor.capture_image().context("screen capture failed")?);
    let img = if img.width() > max_width {
        let h = (img.height() as u64 * max_width as u64 / img.width() as u64) as u32;
        img.resize_exact(max_width, h.max(1), FilterType::Triangle)
    } else {
        img
    };
    let rgb = img.to_rgb8();
    let mut out = Vec::with_capacity(400_000);
    JpegEncoder::new_with_quality(&mut out, quality).encode_image(&rgb)?;
    Ok(base64::engine::general_purpose::STANDARD.encode(out))
}
