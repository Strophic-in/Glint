//! A stable, anonymous id for this PC, sent to the API as `X-Glint-Device` so the free trial can be
//! limited to one per PC. It is a SHA-256 of Windows' MachineGuid (set when Windows is installed;
//! the same for every account and every reinstall of Glint), so the raw machine id never leaves the
//! PC. If the registry can't be read, the computer and user names stand in.

use sha2::{Digest, Sha256};
use std::sync::OnceLock;
use windows::core::w;
use windows::Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};

pub fn id() -> &'static str {
    static ID: OnceLock<String> = OnceLock::new();
    ID.get_or_init(|| {
        let source = machine_guid().unwrap_or_else(|| {
            let var = |k: &str| std::env::var(k).unwrap_or_default();
            format!("{}\\{}", var("COMPUTERNAME"), var("USERNAME"))
        });
        let digest = Sha256::digest(format!("glint-device-v1:{}", source.trim().to_ascii_lowercase()));
        digest.iter().map(|b| format!("{b:02x}")).collect()
    })
}

fn machine_guid() -> Option<String> {
    let mut buf = [0u16; 128];
    let mut size = (buf.len() * 2) as u32;
    let status = unsafe {
        RegGetValueW(
            HKEY_LOCAL_MACHINE,
            w!("SOFTWARE\\Microsoft\\Cryptography"),
            w!("MachineGuid"),
            RRF_RT_REG_SZ,
            None,
            Some(buf.as_mut_ptr().cast()),
            Some(&mut size),
        )
    };
    if status.is_err() {
        return None;
    }
    let len = (size as usize / 2).saturating_sub(1).min(buf.len());
    let guid = String::from_utf16_lossy(&buf[..len]);
    (!guid.trim().is_empty()).then_some(guid)
}

#[cfg(test)]
mod tests {
    #[test]
    fn reads_machine_guid_and_hashes_it() {
        assert!(super::machine_guid().is_some(), "MachineGuid not readable");
        let id = super::id();
        assert_eq!(id.len(), 64);
        assert!(id.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
        assert_eq!(id, super::id(), "stable within a run");
    }
}
