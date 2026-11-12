//! Live session: audio events → WebSocket → Glint server → OpenAI realtime STT.
//! Server messages are forwarded to the UI unchanged as `listen:msg` events.

use crate::api::Api;
use crate::audio::{self, AudioEvent, AudioHandle, AudioOpts};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, watch};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::{http::HeaderValue, Message};

pub struct ListenHandle {
    pub id: u64,
    stop: watch::Sender<bool>,
    _audio: AudioHandle,
}

impl ListenHandle {
    pub fn stop(self) {
        let _ = self.stop.send(true);
        // AudioHandle stops capture on drop.
    }
}

enum End {
    Stopped,
    Fatal(String),
    Dropped,
}

fn state(app: &AppHandle, state: &str, message: Option<&str>) {
    let _ = app.emit("listen:state", json!({ "state": state, "message": message }));
}

/// `lang`: what the server should transcribe: ISO codes like "en" or "en,hi", or "auto".
/// `session`: the app session (id, title) this listening belongs to, so usage can be grouped by it.
pub fn start(
    app: AppHandle,
    api: Api,
    token: String,
    opts: AudioOpts,
    id: u64,
    lang: &str,
    session: Option<(String, String)>,
) -> Result<ListenHandle, String> {
    let (tx, rx) = mpsc::unbounded_channel();
    let (audio, warnings) = audio::start(opts, tx)?;
    for w in warnings {
        let _ = app.emit("listen:msg", json!({ "type": "notice", "message": w }));
    }
    let (stop_tx, stop_rx) = watch::channel(false);
    let lang: String = lang.chars().filter(|c| c.is_ascii_lowercase() || *c == ',').take(20).collect();
    let mut path = format!("/v1/listen?lang={}", if lang.is_empty() { "en" } else { &lang });
    if let Some((sid, title)) = session {
        path.push_str(&format!("&session={}&title={}", query_encode(&sid), query_encode(&title)));
    }
    tauri::async_runtime::spawn(run(app, api, token, rx, stop_rx, id, path));
    Ok(ListenHandle { id, stop: stop_tx, _audio: audio })
}

async fn run(
    app: AppHandle,
    api: Api,
    token: String,
    mut rx: mpsc::UnboundedReceiver<AudioEvent>,
    mut stop: watch::Receiver<bool>,
    id: u64,
    path: String,
) {
    state(&app, "connecting", None);
    let mut failures = 0u32;
    let final_message: Option<String> = loop {
        match connect(&api, &token, &path).await {
            Ok(ws) => {
                failures = 0;
                state(&app, "live", None);
                match session(&app, ws, &mut rx, &mut stop).await {
                    End::Stopped => break None,
                    End::Fatal(msg) => break Some(msg),
                    End::Dropped => {}
                }
            }
            Err(End::Fatal(msg)) => break Some(msg),
            Err(_) => {}
        }
        failures += 1;
        if failures > 5 {
            break Some("Connection lost. Press Ctrl+Shift+L to resume.".into());
        }
        state(&app, "reconnecting", None);
        // Drop audio captured while offline, then back off (unless the user stops).
        while rx.try_recv().is_ok() {}
        tokio::select! {
            _ = stop.changed() => break None,
            _ = tokio::time::sleep(Duration::from_millis(600 * failures as u64)) => {}
        }
    };

    // Release the audio devices if this session is still the current one.
    let st = app.state::<crate::state::AppState>();
    let mut cur = st.listen.lock().unwrap();
    if cur.as_ref().map(|h| h.id) == Some(id) {
        cur.take();
    }
    drop(cur);
    match final_message {
        Some(msg) => state(&app, "error", Some(&msg)),
        None => state(&app, "off", None),
    }
}

type Ws = tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

async fn connect(api: &Api, token: &str, path: &str) -> Result<Ws, End> {
    let mut req = api.ws_url(path).into_client_request().map_err(|e| End::Fatal(e.to_string()))?;
    let auth = HeaderValue::from_str(&format!("Bearer {token}")).map_err(|e| End::Fatal(e.to_string()))?;
    req.headers_mut().insert("authorization", auth);
    if let Ok(device) = HeaderValue::from_str(crate::device::id()) {
        req.headers_mut().insert("x-glint-device", device);
    }
    match tokio_tungstenite::connect_async_with_config(req, None, true).await {
        Ok((ws, _)) => Ok(ws),
        Err(tokio_tungstenite::tungstenite::Error::Http(resp)) => {
            let code = resp.status().as_u16();
            let body: Value = resp
                .body()
                .as_ref()
                .and_then(|b| serde_json::from_slice(b).ok())
                .unwrap_or(Value::Null);
            let msg = body["message"].as_str().map(String::from).unwrap_or_else(|| match code {
                401 => "Please sign in again.".into(),
                402 => "You are out of time. Add hours to keep going.".into(),
                _ => format!("Server refused the connection ({code})."),
            });
            if code >= 500 && code != 503 {
                Err(End::Dropped)
            } else {
                Err(End::Fatal(msg))
            }
        }
        Err(_) => Err(End::Dropped),
    }
}

async fn session(
    app: &AppHandle,
    ws: Ws,
    rx: &mut mpsc::UnboundedReceiver<AudioEvent>,
    stop: &mut watch::Receiver<bool>,
) -> End {
    let (mut sink, mut stream) = ws.split();
    if sink.send(Message::text(json!({ "type": "start" }).to_string())).await.is_err() {
        return End::Dropped;
    }
    let mut ping = tokio::time::interval(Duration::from_secs(20));
    ping.tick().await;
    let mut server_error: Option<(String, String)> = None;

    loop {
        tokio::select! {
            _ = stop.changed() => {
                let _ = sink.send(Message::text(json!({ "type": "stop" }).to_string())).await;
                let _ = sink.close().await;
                return End::Stopped;
            }
            ev = rx.recv() => match ev {
                None => return End::Stopped,
                Some(AudioEvent::Audio(src, pcm)) => {
                    let mut frame = Vec::with_capacity(1 + pcm.len() * 2);
                    frame.push(src as u8);
                    for s in pcm {
                        frame.extend_from_slice(&s.to_le_bytes());
                    }
                    if sink.send(Message::binary(frame)).await.is_err() {
                        return End::Dropped;
                    }
                }
                Some(AudioEvent::Commit(src)) => {
                    let msg = json!({ "type": "commit", "src": src.name() }).to_string();
                    if sink.send(Message::text(msg)).await.is_err() {
                        return End::Dropped;
                    }
                }
                Some(AudioEvent::Level(src, level)) => {
                    let _ = app.emit("listen:level", json!({ "src": src.name(), "level": level }));
                }
                Some(AudioEvent::Warning(src, message)) => {
                    let _ = app.emit("listen:msg", json!({ "type": "notice", "src": src.name(), "message": message }));
                }
            },
            msg = stream.next() => match msg {
                Some(Ok(Message::Text(t))) => {
                    let v: Value = serde_json::from_str(t.as_str()).unwrap_or(Value::Null);
                    if v["type"] == "error" {
                        server_error = Some((
                            v["error"].as_str().unwrap_or("error").to_string(),
                            v["message"].as_str().unwrap_or("Session ended.").to_string(),
                        ));
                    }
                    let _ = app.emit("listen:msg", v);
                }
                Some(Ok(Message::Close(_))) | None | Some(Err(_)) => {
                    return match server_error {
                        // Server restarts are transient: reconnect.
                        Some((code, _)) if code == "shutdown" => End::Dropped,
                        Some((_, message)) => End::Fatal(message),
                        None => End::Dropped,
                    };
                }
                _ => {}
            },
            _ = ping.tick() => {
                if sink.send(Message::Ping(Default::default())).await.is_err() {
                    return End::Dropped;
                }
            }
        }
    }
}

/// Percent-encode a query value (UTF-8 bytes; unreserved characters pass through).
fn query_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}
