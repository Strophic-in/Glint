use crate::api::{Api, ApiError};
use crate::listen::ListenHandle;
use std::collections::HashMap;
use crate::screen::Frame;
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicIsize, AtomicU64};
use std::sync::Mutex;
use tauri::async_runtime::JoinHandle;

pub struct AppState {
    pub api: Api,
    pub token: Mutex<Option<String>>,
    pub listen: Mutex<Option<ListenHandle>>,
    pub listen_seq: AtomicU64,
    pub answer: Mutex<Option<JoinHandle<()>>>,
    pub auth_poll: Mutex<Option<JoinHandle<()>>>,
    pub bindings: Mutex<HashMap<String, String>>,
    pub contextual: AtomicBool,
    pub typing: AtomicBool,
    pub prev_foreground: AtomicIsize,
    /// Physical px between the window's left edge and the main column (the code panel's width).
    pub layout_left: AtomicI32,
    /// Latest screen frame, kept fresh while live so auto-answers don't wait for a capture.
    pub screen_frame: Mutex<Option<Frame>>,
    /// Bumped to stop the screen watcher; the thread exits when its generation is stale.
    pub screen_watch: AtomicU64,
    /// While a session records: its folder, where screenshots used for answers are saved.
    pub session_assets: Mutex<Option<std::path::PathBuf>>,
    /// Fingerprint and path of the last saved screenshot (an unchanged screen isn't saved twice).
    pub last_shot: Mutex<Option<(u64, String)>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            api: Api::new(),
            token: Mutex::new(None),
            listen: Mutex::new(None),
            listen_seq: AtomicU64::new(0),
            answer: Mutex::new(None),
            auth_poll: Mutex::new(None),
            bindings: Mutex::new(crate::shortcuts::defaults()),
            contextual: AtomicBool::new(false),
            typing: AtomicBool::new(false),
            prev_foreground: AtomicIsize::new(0),
            layout_left: AtomicI32::new(0),
            screen_frame: Mutex::new(None),
            screen_watch: AtomicU64::new(0),
            session_assets: Mutex::new(None),
            last_shot: Mutex::new(None),
        }
    }

    pub fn token(&self) -> Result<String, ApiError> {
        self.token.lock().unwrap().clone().ok_or_else(ApiError::unauthorized)
    }

    pub fn stop_listen(&self) {
        if let Some(h) = self.listen.lock().unwrap().take() {
            h.stop();
        }
    }
}
