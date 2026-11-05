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
    lang: Option<String>,
) -> R<()> {
    let token = state.token()?;
    state.stop_listen();
    let id = state.listen_seq.fetch_add(1, Ordering::SeqCst) + 1;
    let opts = AudioOpts { mic, system, mic_device, system_device };
    let handle = listen::start(app.clone(), state.api.clone(), token, opts, id, lang.as_deref().unwrap_or("en"))
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
    // Auto-answers are the most latency-sensitive: use the watcher's recent frame when there is
    // one. A question the user asks gets a fresh capture (they may have just switched windows).
    let auto = body.get("auto").and_then(Value::as_bool).unwrap_or(false);
    let cached = if with_screen && auto { screen::fresh_frame(&state) } else { None };
    let task = tauri::async_runtime::spawn(async move {
        let mut body = body;
        if let Some(img) = cached {
            let path = save_session_shot(&app2, &img);
            body["image"] = Value::String(img);
            let _ = app2.emit("answer", json!({ "id": id, "kind": "screen", "data": { "ms": 0, "cached": true, "path": path } }));
        } else if with_screen {
            let t0 = std::time::Instant::now();
            match tauri::async_runtime::spawn_blocking(screen::capture_jpeg_b64).await {
                Ok(Ok(img)) => {
                    let ms = t0.elapsed().as_millis() as u64;
                    let path = save_session_shot(&app2, &img);
                    body["image"] = Value::String(img);
                    let _ = app2.emit("answer", json!({ "id": id, "kind": "screen", "data": { "ms": ms, "path": path } }));
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
///
/// `left` is how far the main column sits from the window's left edge (the code panel, in logical
/// px). When it changes, the window moves by the difference so the main column stays put on
/// screen and the code panel opens to its left.
#[tauri::command]
pub fn resize(window: WebviewWindow, state: State<'_, AppState>, width: f64, height: f64, left: Option<f64>) {
    let (Ok(Some(m)), Ok(pos)) = (window.current_monitor(), window.outer_position()) else {
        let _ = window.set_size(LogicalSize::new(width.clamp(40.0, 4000.0), height.clamp(40.0, 3000.0)));
        return;
    };
    let scale = m.scale_factor();
    let (mx, my) = (m.position().x, m.position().y);
    let (mw, mh) = (m.size().width as i32, m.size().height as i32);
    let w = ((width.max(40.0) * scale).round() as i32).min(mw);
    let h = ((height.max(40.0) * scale).round() as i32).min(mh);
    let left = (left.unwrap_or(0.0).max(0.0) * scale).round() as i32;
    let prev_left = state.layout_left.swap(left, Ordering::SeqCst);
    let x = (pos.x + prev_left - left).clamp(mx, (mx + mw - w).max(mx));
    let y = pos.y.clamp(my, (my + mh - h).max(my));
    win::set_bounds(&window, x, y, w, h);
}

/// "store" when installed from the Microsoft Store (it updates the app itself), else "direct".
#[tauri::command]
pub fn install_kind() -> &'static str {
    let packaged = std::env::current_exe()
        .map(|p| p.to_string_lossy().to_ascii_lowercase().contains(r"\windowsapps\"))
        .unwrap_or(false);
    if packaged { "store" } else { "direct" }
}

/// Start a corner resize (call on pointerdown on the resize grip).
#[tauri::command]
pub fn resize_drag(app: AppHandle) {
    win::track_resize(&app);
}

/// Keep a recent screen frame while live, so auto-answers can include the screen instantly.
#[tauri::command]
pub fn set_screen_watch(app: AppHandle, on: bool) {
    screen::watch(&app, on);
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

static QUITTING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Quit from the menu or tray: the UI first saves an open session (it calls `quit_now` when done).
/// If the UI doesn't answer, Glint exits anyway after a few seconds.
pub fn request_quit(app: &AppHandle) {
    if QUITTING.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = app.emit("quit-requested", ());
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(12));
        quit_now(app);
    });
}

#[tauri::command]
pub fn quit(app: AppHandle) {
    request_quit(&app);
}

#[tauri::command]
pub fn quit_now(app: AppHandle) {
    app.state::<AppState>().stop_listen();
    app.exit(0);
}

/// End-of-session review: the whole text at once (it goes into the session file).
#[tauri::command]
pub async fn session_review(state: State<'_, AppState>, body: Value) -> R<String> {
    let token = state.token()?;
    let api = state.api.clone();
    api::collect_answer(&api, &token, body).await
}

/// While a session records, keep the screenshot an answer used (so questions shown on a shared
/// screen end up in the session file). Returns the saved file's path.
fn save_session_shot(app: &AppHandle, jpeg_b64: &str) -> Option<String> {
    use base64::Engine;
    let state = app.state::<AppState>();
    let dir = state.session_assets.lock().unwrap().clone()?;
    let bytes = base64::engine::general_purpose::STANDARD.decode(jpeg_b64).ok()?;
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for b in bytes.iter().step_by(7) {
        hash = (hash ^ *b as u64).wrapping_mul(0x0100_0000_01b3);
    }
    let mut last = state.last_shot.lock().unwrap();
    if let Some((h, path)) = last.as_ref() {
        if *h == hash && std::path::Path::new(path).exists() {
            return Some(path.clone());
        }
    }
    let ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let path = dir.join(format!("screen-{ms}.jpg"));
    std::fs::write(&path, &bytes).ok()?;
    let path = path.to_string_lossy().into_owned();
    *last = Some((hash, path.clone()));
    Some(path)
}

/// Turn a title into a safe Windows file or folder name.
fn clean_name(name: &str) -> String {
    let clean: String = name
        .chars()
        .map(|c| if c.is_control() || r#"<>:"/\|?*"#.contains(c) { '-' } else { c })
        .take(120)
        .collect();
    clean.trim().trim_end_matches('.').to_string()
}

/// Start (Some(name)) or stop (None) saving screenshots into the session's folder.
#[tauri::command]
pub fn set_session_assets(app: AppHandle, state: State<'_, AppState>, name: Option<String>) -> R<Option<String>> {
    let dir = match name.map(|n| clean_name(&n)).filter(|n| !n.is_empty()) {
        Some(n) => {
            let dir = sessions_folder(&app)?.join(n);
            std::fs::create_dir_all(&dir).map_err(|e| ApiError::local("files", e.to_string()))?;
            Some(dir)
        }
        None => None,
    };
    *state.session_assets.lock().unwrap() = dir.clone();
    *state.last_shot.lock().unwrap() = None;
    Ok(dir.map(|d| d.to_string_lossy().into_owned()))
}

fn sessions_folder(app: &AppHandle) -> R<std::path::PathBuf> {
    let docs = app.path().document_dir().map_err(|e| ApiError::local("files", e.to_string()))?;
    Ok(docs.join("Glint Sessions"))
}

/// Write a session file into Documents\Glint Sessions and return its path. Written to a temp file
/// and renamed, so an autosave cut short by a crash never leaves half a file.
#[tauri::command]
pub fn save_session(app: AppHandle, file_name: String, content: String) -> R<String> {
    let dir = sessions_folder(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| ApiError::local("files", e.to_string()))?;
    let clean = clean_name(&file_name);
    let name = match clean.as_str() {
        "" => "Glint session.md".to_string(),
        n if n.to_ascii_lowercase().ends_with(".md") => n.to_string(),
        n => format!("{n}.md"),
    };
    let path = dir.join(name);
    let tmp = path.with_extension("md.tmp");
    std::fs::write(&tmp, content.as_bytes()).map_err(|e| ApiError::local("files", e.to_string()))?;
    std::fs::rename(&tmp, &path).map_err(|e| ApiError::local("files", e.to_string()))?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn sessions_dir(app: AppHandle) -> R<String> {
    Ok(sessions_folder(&app)?.to_string_lossy().into_owned())
}

/// Show a saved session in Explorer (or open the sessions folder).
#[tauri::command]
pub fn reveal_path(app: AppHandle, path: String) {
    let p = std::path::PathBuf::from(&path);
    if p.is_dir() {
        let _ = app.opener().open_path(path, None::<&str>);
    } else {
        let _ = app.opener().reveal_item_in_dir(p);
    }
}

#[derive(serde::Serialize)]
pub struct MonitorInfo {
    name: String,
    width: u32,
    height: u32,
    primary: bool,
}

#[tauri::command]
pub fn list_monitors(window: WebviewWindow) -> Vec<MonitorInfo> {
    let primary = window.primary_monitor().ok().flatten().and_then(|m| m.name().cloned());
    window
        .available_monitors()
        .unwrap_or_default()
        .into_iter()
        .map(|m| {
            let name = m.name().cloned().unwrap_or_default();
            MonitorInfo { primary: primary.as_deref() == Some(name.as_str()), width: m.size().width, height: m.size().height, name }
        })
        .collect()
}

/// Move the overlay to a preset spot on a monitor ("" = the one it's on). The main column is what
/// gets placed; a code panel to its left goes with it. Content growing later keeps it on screen.
#[tauri::command]
pub fn place_window(window: WebviewWindow, state: State<'_, AppState>, monitor: String, anchor: String) {
    let monitors = window.available_monitors().unwrap_or_default();
    let m = monitors
        .into_iter()
        .find(|m| !monitor.is_empty() && m.name().map(String::as_str) == Some(monitor.as_str()))
        .or_else(|| window.current_monitor().ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten());
    let (Some(m), Ok(size)) = (m, window.outer_size()) else { return };
    let (w, h) = (size.width as i32, size.height as i32);
    let (mx, my) = (m.position().x, m.position().y);
    let (mw, mh) = (m.size().width as i32, m.size().height as i32);
    let scale = m.scale_factor();
    let margin = (14.0 * scale) as i32;
    let taskbar = (56.0 * scale) as i32;
    let left = state.layout_left.load(Ordering::SeqCst);
    let main_w = w - left;
    let main_x = match anchor.as_str() {
        "top-left" | "bottom-left" => mx + margin,
        "top-right" | "bottom-right" => mx + mw - main_w - margin,
        _ => mx + (mw - main_w) / 2,
    };
    let y = match anchor.as_str() {
        a if a.starts_with("bottom") => my + mh - h - taskbar,
        "center" => my + (mh - h) / 2,
        _ => my + margin,
    };
    let x = (main_x - left).clamp(mx, (mx + mw - w).max(mx));
    let y = y.clamp(my, (my + mh - h).max(my));
    win::set_bounds(&window, x, y, w, h);
}
