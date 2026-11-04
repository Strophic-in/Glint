//! Session token storage, encrypted with Windows DPAPI (only this Windows user can decrypt it).

use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use windows::Win32::Foundation::{LocalFree, HLOCAL};
use windows::Win32::Security::Cryptography::{
    CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
};

fn path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_local_data_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join("session.bin"))
}

fn dpapi(data: &[u8], encrypt: bool) -> Option<Vec<u8>> {
    let input = CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 };
    let mut out = CRYPT_INTEGER_BLOB::default();
    unsafe {
        let ok = if encrypt {
            CryptProtectData(&input, windows::core::w!("Glint"), None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut out)
        } else {
            CryptUnprotectData(&input, None, None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut out)
        };
        ok.ok()?;
        let v = std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(out.pbData as _)));
        Some(v)
    }
}

pub fn load(app: &AppHandle) -> Option<String> {
    let bytes = std::fs::read(path(app)?).ok()?;
    String::from_utf8(dpapi(&bytes, false)?).ok().filter(|t| !t.is_empty())
}

pub fn save(app: &AppHandle, token: &str) {
    if let (Some(p), Some(enc)) = (path(app), dpapi(token.as_bytes(), true)) {
        let _ = std::fs::write(p, enc);
    }
}

pub fn clear(app: &AppHandle) {
    if let Some(p) = path(app) {
        let _ = std::fs::remove_file(p);
    }
}
