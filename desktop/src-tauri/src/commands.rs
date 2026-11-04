use crate::api::{self, ApiError};
use crate::audio::AudioOpts;
use crate::state::AppState;
use crate::{auth, listen, screen, shortcuts, win};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::{AppHandle, Emitter, LogicalSize, Manager, State, WebviewWindow};
use tauri_plugin_opener::OpenerExt;

type R<T> = Result<T, ApiError>;

#[tauri::command]
pub fn get_config(state: State<'_, AppState>) -> Value {
    json!({ "api_url": state.api.base, "web_url": state.api.web, "version": env!("CARGO_PKG_VERSION") })
}

/// Restore the saved session. Ok(None) = signed out.
#[tauri::command]
pub async fn auth_status(app: AppHandle, state: State<'_, AppState>) -> R<Option<Value>> {
    let token = {
        let mut t = state.token.lock().unwrap();
        if t.is_none() {
            *t = auth::load(&app);
        }
        t.clone()
    };
    let Some(token) = token else { return Ok(None) };
    match state.api.get("/v1/me", Some(&token)).await {
        Ok(me) => Ok(Some(me)),
        Err(e) if e.status == 401 => {
            *state.token.lock().unwrap() = None;
            auth::clear(&app);
            Ok(None)
        }
        Err(e) => Err(e),
    }
}

/// Device sign-in: open the browser, poll until the user approves there.
#[tauri::command]
pub async fn auth_begin(app: AppHandle, state: State<'_, AppState>) -> R<Value> {
    let start = state.api.post("/v1/auth/device/start", None, &json!({})).await?;
    let device_code = start["device_code"].as_str().unwrap_or_default().to_string();
    let verify_url = start["verify_url"].as_str().unwrap_or_default().to_string();
    let interval = start["interval"].as_u64().unwrap_or(2).max(1);
    let expires = start["expires_in"].as_u64().unwrap_or(600);
    let _ = app.opener().open_url(verify_url.clone(), None::<&str>);

    let api = state.api.clone();
    let app2 = app.clone();
    let task = tauri::async_runtime::spawn(async move {
        let deadline = std::time::Instant::now() + Duration::from_secs(expires);
        while std::time::Instant::now() < deadline {
            tokio::time::sleep(Duration::from_secs(interval)).await;
            match api.post("/v1/auth/device/poll", None, &json!({ "device_code": device_code })).await {
                Ok(v) if v["status"] == "approved" => {
                    let token = v["token"].as_str().unwrap_or_default().to_string();
                    auth::save(&app2, &token);
                    *app2.state::<AppState>().token.lock().unwrap() = Some(token.clone());
                    let me = api.get("/v1/me", Some(&token)).await.ok();
                    let _ = app2.emit("auth", json!({ "kind": "ok", "me": me }));
                    return;
                }
                Ok(_) => {}
                Err(e) if e.status == 410 => break,
                Err(_) => {} // transient network error: keep polling
            }
        }
        let _ = app2.emit("auth", json!({ "kind": "error", "message": "Sign-in timed out. Try again." }));
    });
    if let Some(prev) = state.auth_poll.lock().unwrap().replace(task) {
        prev.abort();
    }
    Ok(json!({ "user_code": start["user_code"], "verify_url": verify_url }))
}

#[tauri::command]
pub fn auth_cancel(state: State<'_, AppState>) {
    if let Some(t) = state.auth_poll.lock().unwrap().take() {
        t.abort();
    }
}

#[tauri::command]
pub async fn logout(app: AppHandle, state: State<'_, AppState>) -> R<()> {
    state.stop_listen();
    let token = state.token.lock().unwrap().take();
    auth::clear(&app);
    if let Some(t) = token {
        let _ = state.api.post("/v1/auth/logout", Some(&t), &json!({})).await;
    }
    Ok(())
}

/// Answer models this server offers (only ones its OpenAI project can use).
#[tauri::command]
pub async fn models(state: State<'_, AppState>) -> R<Value> {
    state.api.get("/v1/models", None).await
}

#[tauri::command]
pub async fn me(state: State<'_, AppState>) -> R<Value> {
    let token = state.token()?;
    state.api.get("/v1/me", Some(&token)).await
}

#[tauri::command]
pub fn listen_start(
    app: AppHandle,
    state: State<'_, AppState>,
    mic: bool,
    system: bool,
    mic_device: Option<String>,
    system_device: Option<String>,
) -> R<()> {
    let token = state.token()?;
    state.stop_listen();
    let id = state.listen_seq.fetch_add(1, Ordering::SeqCst) + 1;
    let opts = AudioOpts { mic, system, mic_device, system_device };
    let handle = listen::start(app.clone(), state.api.clone(), token, opts, id)
        .map_err(|m| ApiError::local("audio", m))?;
    *state.listen.lock().unwrap() = Some(handle);
    Ok(())
}

#[tauri::command]
pub fn listen_stop(state: State<'_, AppState>) {
    state.stop_listen();
}

/// Start an answer. The latest request wins: any answer still streaming is cancelled.
#[tauri::command]
pub fn ask(app: AppHandle, state: State<'_, AppState>, id: u64, body: Value, with_screen: bool) -> R<()> {
    let token = state.token()?;
    let api = state.api.clone();
    let app2 = app.clone();
    let task = tauri::async_runtime::spawn(async move {
        let mut body = body;
        if with_screen {
            let t0 = std::time::Instant::now();
            match tauri::async_runtime::spawn_blocking(|| screen::capture_jpeg_b64(1600, 75)).await {
                Ok(Ok(img)) => {
                    body["image"] = Value::String(img);
                    let _ = app2.emit("answer", json!({ "id": id, "kind": "screen", "data": { "ms": t0.elapsed().as_millis() as u64 } }));
                }
                Ok(Err(e)) => {
                    let _ = app2.emit("answer", json!({ "id": id, "kind": "notice", "data": { "message": format!("Screen capture failed: {e}") } }));
                }
                Err(_) => {}
            }
        }
        api::stream_answer(&api, &token, body, &app2, id).await;
    });
    if let Some(prev) = state.answer.lock().unwrap().replace(task) {
        prev.abort();
    }
    Ok(())
}

#[tauri::command]
pub fn ask_cancel(state: State<'_, AppState>) {
    if let Some(t) = state.answer.lock().unwrap().take() {
        t.abort();
    }
}

#[tauri::command]
pub fn set_bindings(app: AppHandle, state: State<'_, AppState>, bindings: HashMap<String, String>) -> HashMap<String, String> {
    {
        let mut b = state.bindings.lock().unwrap();
        for (action, accel) in bindings {
            if shortcuts::DEFAULTS.iter().any(|(a, _)| *a == action) {
                b.insert(action, accel);
            }
        }
    }
    shortcuts::apply(&app)
}

#[tauri::command]
pub fn default_bindings() -> HashMap<String, String> {
    shortcuts::defaults()
}

#[tauri::command]
pub fn set_contextual_keys(app: AppHandle, on: bool) {
    shortcuts::set_contextual(&app, on);
}

/// Release every global shortcut while the user records a new one, so the combo reaches the UI.
#[tauri::command]
pub fn suspend_shortcuts(app: AppHandle, on: bool) {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    if on {
        let _ = app.global_shortcut().unregister_all();
    } else {
        shortcuts::apply(&app);
    }
}

/// Typing mode: let the overlay take keyboard focus. Leaving it hands focus back
/// to the window the user was in (unless they already clicked somewhere else: restore=false).
#[tauri::command]
pub fn set_typing(window: WebviewWindow, state: State<'_, AppState>, on: bool, restore: Option<bool>) {
    if on {
        if !state.typing.swap(true, Ordering::SeqCst) {
            let fg = win::foreground();
            let own = win::hwnd(&window).map(|h| h.0 as isize).unwrap_or(0);
            if fg != own {
                state.prev_foreground.store(fg, Ordering::SeqCst);
            }
        }
        win::set_noactivate(&window, false);
        win::focus(&window);
    } else if state.typing.swap(false, Ordering::SeqCst) {
        win::set_noactivate(&window, true);
        let prev = state.prev_foreground.swap(0, Ordering::SeqCst);
        if restore.unwrap_or(true) {
            win::set_foreground(prev);
        }
    }
}

#[tauri::command]
pub fn set_protected(window: WebviewWindow, on: bool) {
    win::set_protected(&window, on);
}

/// Size the window to its content and keep it fully on its monitor (the bubble can be dragged to
/// an edge; expanding back to the full bar must not spill off-screen).
#[tauri::command]
pub fn resize(window: WebviewWindow, width: f64, height: f64) {
    let _ = window.set_size(LogicalSize::new(width.clamp(40.0, 1400.0), height.clamp(40.0, 1100.0)));
    let (Ok(Some(m)), Ok(pos)) = (window.current_monitor(), window.outer_position()) else { return };
    let scale = m.scale_factor();
    let (w, h) = ((width * scale) as i32, (height * scale) as i32);
    let (mx, my) = (m.position().x, m.position().y);
    let (mw, mh) = (m.size().width as i32, m.size().height as i32);
    let x = pos.x.clamp(mx, (mx + mw - w).max(mx));
    let y = pos.y.clamp(my, (my + mh - h).max(my));
    if (x, y) != (pos.x, pos.y) {
        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
    }
}

/// Start moving the overlay with the mouse (call on pointerdown on a drag area).
#[tauri::command]
pub fn drag_window(window: WebviewWindow) {
    win::drag(&window);
}

#[tauri::command]
pub fn set_zoom(window: WebviewWindow, scale: f64) {
    let _ = window.set_zoom(scale.clamp(0.7, 1.5));
}

/// Native file picker → plain text, extracted on this PC.
#[tauri::command]
pub async fn pick_document(app: AppHandle, window: WebviewWindow) -> R<Option<crate::docs::DocText>> {
    use tauri_plugin_dialog::DialogExt;
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_parent(&window)
            .set_title("Add a resume or reference document")
            .add_filter("Documents", &["pdf", "docx", "txt", "md"])
            .blocking_pick_file()
    })
    .await
    .map_err(|e| ApiError::local("dialog", e.to_string()))?;
    let Some(file) = picked else { return Ok(None) };
    let path = file.into_path().map_err(|e| ApiError::local("dialog", e.to_string()))?;
    tauri::async_runtime::spawn_blocking(move || crate::docs::extract(&path))
        .await
        .map_err(|e| ApiError::local("docs", e.to_string()))?
        .map(Some)
        .map_err(|m| ApiError::local("docs", m))
}

#[tauri::command]
pub fn list_mics() -> Vec<String> {
    crate::audio::list_mics()
}

#[tauri::command]
pub fn list_outputs() -> Vec<String> {
    crate::audio::list_outputs()
}

#[tauri::command]
pub fn open_url(app: AppHandle, url: String) {
    if url.starts_with("https://") || url.starts_with("http://") {
        let _ = app.opener().open_url(url, None::<&str>);
    }
}

#[tauri::command]
pub fn hide(app: AppHandle) {
    win::conceal(&app);
}

#[tauri::command]
pub fn quit(app: AppHandle) {
    app.state::<AppState>().stop_listen();
    app.exit(0);
}
