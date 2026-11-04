//! Global shortcuts. Contextual ones (answer scrolling) are only registered while an answer is on
//! screen, so they never steal arrow keys from other apps the rest of the time.

use crate::state::AppState;
use crate::win;
use std::collections::HashMap;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub const DEFAULTS: &[(&str, &str)] = &[
    ("toggle", "Ctrl+Backslash"),
    ("answer", "Ctrl+Enter"),
    ("screen", "Ctrl+Shift+Enter"),
    ("listen", "Ctrl+Shift+L"),
    ("type", "Ctrl+Shift+Space"),
    ("scroll_up", "Ctrl+Up"),
    ("scroll_down", "Ctrl+Down"),
];

const CONTEXTUAL: &[&str] = &["scroll_up", "scroll_down"];

pub fn defaults() -> HashMap<String, String> {
    DEFAULTS.iter().map(|(a, k)| (a.to_string(), k.to_string())).collect()
}

fn register(app: &AppHandle, action: &str, accel: &str) -> Result<(), String> {
    let action = action.to_string();
    app.global_shortcut()
        .on_shortcut(accel, move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                handle(app, &action);
            }
        })
        .map_err(|e| e.to_string())
}

/// (Re)register everything. Returns per-action errors (invalid combo, taken by another app).
pub fn apply(app: &AppHandle) -> HashMap<String, String> {
    let state = app.state::<AppState>();
    let _ = app.global_shortcut().unregister_all();
    let bindings = state.bindings.lock().unwrap().clone();
    let contextual = state.contextual.load(Ordering::SeqCst);
    let mut errors = HashMap::new();
    for (action, accel) in &bindings {
        if accel.trim().is_empty() || (CONTEXTUAL.contains(&action.as_str()) && !contextual) {
            continue;
        }
        if let Err(e) = register(app, action, accel) {
            errors.insert(action.clone(), e);
        }
    }
    errors
}

pub fn set_contextual(app: &AppHandle, on: bool) {
    let state = app.state::<AppState>();
    if state.contextual.swap(on, Ordering::SeqCst) == on {
        return;
    }
    let bindings = state.bindings.lock().unwrap().clone();
    for action in CONTEXTUAL {
        let Some(accel) = bindings.get(*action).filter(|a| !a.trim().is_empty()) else { continue };
        if on {
            let _ = register(app, action, accel);
        } else {
            let _ = app.global_shortcut().unregister(accel.as_str());
        }
    }
}

/// "toggle" collapses/expands the overlay (bubble ↔ bar); if it was hidden completely, it comes
/// back expanded. Every other action also brings a hidden overlay back.
pub fn handle(app: &AppHandle, action: &str) {
    if !win::is_visible(app) {
        win::reveal(app);
        let _ = app.emit("shortcut", "expand");
        if action == "toggle" {
            return;
        }
    }
    let _ = app.emit("shortcut", action);
}
