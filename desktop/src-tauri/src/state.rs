use crate::api::{Api, ApiError};
use crate::listen::ListenHandle;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU64};
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
