//! HTTP client for the Glint API. One pooled client so every request reuses a warm TLS connection.

use futures_util::StreamExt;
use serde::Serialize;
use serde_json::{json, Value};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
pub struct ApiError {
    pub status: u16,
    pub error: String,
    pub message: String,
}

impl ApiError {
    pub fn local(error: &str, message: impl Into<String>) -> Self {
        Self { status: 0, error: error.into(), message: message.into() }
    }
    pub fn network(e: impl std::fmt::Display) -> Self {
        Self::local("network", format!("Can't reach Glint servers. Check your internet. ({e})"))
    }
    pub fn unauthorized() -> Self {
        Self { status: 401, error: "unauthorized".into(), message: "Please sign in.".into() }
    }
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

#[derive(Clone)]
pub struct Api {
    pub base: String,
    pub web: String,
    pub http: reqwest::Client,
}

fn setting(name: &str, compiled: Option<&str>, default: &str) -> String {
    std::env::var(name)
        .ok()
        .filter(|s| !s.is_empty())
        .or(compiled.map(String::from))
        .unwrap_or_else(|| default.to_string())
        .trim_end_matches('/')
        .to_string()
}

impl Api {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .user_agent(format!("Glint/{} (Windows)", env!("CARGO_PKG_VERSION")))
            .tcp_nodelay(true)
            .connect_timeout(Duration::from_secs(8))
            .pool_idle_timeout(Duration::from_secs(120))
            .build()
            .expect("http client");
        Self {
            base: setting("GLINT_API_URL", option_env!("GLINT_API_URL"), "http://localhost:8787"),
            web: setting("GLINT_WEB_URL", option_env!("GLINT_WEB_URL"), "http://localhost:5173"),
            http,
        }
    }

    pub fn url(&self, path: &str) -> String {
        format!("{}{}", self.base, path)
    }

    pub fn ws_url(&self, path: &str) -> String {
        let base = if let Some(rest) = self.base.strip_prefix("https://") {
            format!("wss://{rest}")
        } else if let Some(rest) = self.base.strip_prefix("http://") {
            format!("ws://{rest}")
        } else {
            self.base.clone()
        };
        format!("{base}{path}")
    }

    async fn parse(res: reqwest::Response) -> Result<Value, ApiError> {
        let status = res.status().as_u16();
        let body: Value = res.json().await.unwrap_or(Value::Null);
        if (200..300).contains(&status) {
            return Ok(body);
        }
        Err(ApiError {
            status,
            error: body["error"].as_str().unwrap_or("error").to_string(),
            message: body["message"].as_str().unwrap_or("Something went wrong.").to_string(),
        })
    }

    pub async fn get(&self, path: &str, token: Option<&str>) -> Result<Value, ApiError> {
        let mut req = self.http.get(self.url(path)).timeout(Duration::from_secs(15));
        if let Some(t) = token {
            req = req.bearer_auth(t);
        }
        Self::parse(req.send().await.map_err(ApiError::network)?).await
    }

    pub async fn post(&self, path: &str, token: Option<&str>, body: &Value) -> Result<Value, ApiError> {
        let mut req = self.http.post(self.url(path)).timeout(Duration::from_secs(15)).json(body);
        if let Some(t) = token {
            req = req.bearer_auth(t);
        }
        Self::parse(req.send().await.map_err(ApiError::network)?).await
    }

    /// Open the TLS connection ahead of the first real request.
    pub async fn warm(&self) {
        let _ = self.http.get(self.url("/health")).timeout(Duration::from_secs(5)).send().await;
    }
}

fn emit_answer(app: &AppHandle, id: u64, kind: &str, data: Value) {
    let _ = app.emit("answer", json!({ "id": id, "kind": kind, "data": data }));
}

/// POST /v1/answer and forward the SSE stream to the UI as `answer` events.
pub async fn stream_answer(api: &Api, token: &str, body: Value, app: &AppHandle, id: u64) {
    let res = api
        .http
        .post(api.url("/v1/answer"))
        .bearer_auth(token)
        .json(&body)
        .send()
        .await;
    let res = match res {
        Ok(r) => r,
        Err(e) => return emit_answer(app, id, "error", json!(ApiError::network(e))),
    };
    if !res.status().is_success() {
        let err = Api::parse(res).await.err().unwrap_or_else(|| ApiError::local("error", "Unexpected response."));
        return emit_answer(app, id, "error", json!(err));
    }

    let mut stream = res.bytes_stream();
    let mut buf: Vec<u8> = Vec::with_capacity(4096);
    let mut finished = false;
    while let Some(chunk) = stream.next().await {
        let Ok(chunk) = chunk else { break };
        buf.extend_from_slice(&chunk);
        // SSE events are separated by a blank line. Split on bytes so UTF-8 never breaks mid-char.
        while let Some(pos) = buf.windows(2).position(|w| w == b"\n\n") {
            let block: Vec<u8> = buf.drain(..pos + 2).collect();
            let block = String::from_utf8_lossy(&block);
            let mut event = "message";
            let mut data = String::new();
            for line in block.lines() {
                if let Some(v) = line.strip_prefix("event:") {
                    event = v.trim();
                } else if let Some(v) = line.strip_prefix("data:") {
                    data.push_str(v.trim_start());
                }
            }
            let payload: Value = serde_json::from_str(&data).unwrap_or(Value::Null);
            match event {
                "delta" => emit_answer(app, id, "delta", payload),
                "done" | "error" => {
                    finished = true;
                    emit_answer(app, id, event, payload);
                }
                _ => {}
            }
        }
    }
    if !finished {
        emit_answer(app, id, "error", json!(ApiError::local("network", "Connection dropped. Press again to retry.")));
    }
}

/// Run an answer request to completion and return the whole text. Used for the end-of-session
/// review, which goes into the saved session file instead of streaming into the overlay.
pub async fn collect_answer(api: &Api, token: &str, body: Value) -> Result<String, ApiError> {
    let res = api
        .http
        .post(api.url("/v1/answer"))
        .bearer_auth(token)
        .json(&body)
        .send()
        .await
        .map_err(ApiError::network)?;
    if !res.status().is_success() {
        return Err(Api::parse(res).await.err().unwrap_or_else(|| ApiError::local("error", "Unexpected response.")));
    }
    let mut stream = res.bytes_stream();
    let mut buf: Vec<u8> = Vec::with_capacity(8192);
    let mut text = String::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(ApiError::network)?;
        buf.extend_from_slice(&chunk);
        while let Some(pos) = buf.windows(2).position(|w| w == b"\n\n") {
            let block: Vec<u8> = buf.drain(..pos + 2).collect();
            let block = String::from_utf8_lossy(&block);
            let mut event = "message";
            let mut data = String::new();
            for line in block.lines() {
                if let Some(v) = line.strip_prefix("event:") {
                    event = v.trim();
                } else if let Some(v) = line.strip_prefix("data:") {
                    data.push_str(v.trim_start());
                }
            }
            let payload: Value = serde_json::from_str(&data).unwrap_or(Value::Null);
            match event {
                "delta" => text.push_str(payload.get("t").and_then(Value::as_str).unwrap_or("")),
                "done" => return Ok(text),
                "error" => {
                    let msg = payload.get("message").and_then(Value::as_str).unwrap_or("The review failed.");
                    return Err(ApiError::local("error", msg));
                }
                _ => {}
            }
        }
    }
    Err(ApiError::local("network", "Connection dropped before the review finished."))
}
