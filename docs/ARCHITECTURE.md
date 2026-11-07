# Glint — Architecture

Glint is a real-time AI copilot for Windows. It listens to both sides of a call,
can see your screen, and streams answers into a private overlay in under a second.

```
 ┌───────────────────── Windows PC ─────────────────────┐
 │  Glint desktop  (Tauri 2 · Rust core · Svelte 5 UI)   │
 │                                                       │
 │  mic ──┐  WASAPI   ┌─ resample 24k ─ VAD gate ─┐      │
 │  system┘ loopback  └───────────────────────────┴─WS──┼──┐  wss /v1/listen  (PCM16 frames)
 │  screen ── xcap ── downscale ── JPEG ─────────────────┼──┤  POST /v1/answer (SSE stream)
 │  overlay: transparent, top-most, no-activate,         │  │
 │           excluded from screen capture                │  │
 └───────────────────────────────────────────────────────┘  │
                                                            ▼
 ┌────────────── Oracle VM (api.yourdomain.com) ─────────────┐        ┌──────────────┐
 │ Caddy (TLS) → Node 22 · Fastify · SQLite (WAL)            │ ─────► │  OpenAI API  │
 │  • auth (Google ID token, device flow for desktop)        │  WS +  │  realtime STT│
 │  • metering (per-second, server-enforced)                 │  HTTPS │  chat stream │
 │  • AI gateway (keys never leave the server)               │        └──────────────┘
 │  • Razorpay orders + webhook                              │
 └───────────────────────────────────────────────────────────┘
                                ▲
 ┌──────────── Vercel ─────────┴─┐
 │ SvelteKit site: landing,       │
 │ login, device approval,        │
 │ dashboard, checkout, legal     │
 └────────────────────────────────┘
```

## Why these choices

| Decision | Choice | Why |
|---|---|---|
| Desktop shell | **Tauri 2** (Rust + WebView2) | ~4.5 MB installer (measured, v0.3.0) and ~6 MB RAM for the Rust core, plus Windows' built-in WebView2. No bundled Chromium or Node runtime, unlike Electron (what Cluely ships). Native Rust audio and screen capture. |
| Desktop UI | **Svelte 5** | Compiles away, no virtual DOM, tiny bundle, instant paint. |
| Audio | **cpal / WASAPI** mic + loopback | System audio without virtual cables or drivers. |
| Silence gate | Client-side energy VAD | We only upload speech, so bandwidth and STT cost drop ~50%. The client also decides turn ends, which keeps latency predictable. |
| Screen | **xcap** + JPEG q75, max 1600 px | ~50 ms capture + encode + upload in release builds (measured). The overlay is excluded from capture, so the model never sees it. |
| Backend | **Node 22 + Fastify + ws + SQLite** | One process, no external DB. Fast enough that OpenAI is the only real latency. |
| Auth | Google ID token (web) + **device flow** (desktop) | No client secret in the app; same pattern as GitHub CLI / VS Code. |
| Payments | **Razorpay** orders + checkout + webhook | INR, UPI, cards; idempotent crediting. |
| Billing unit | **Seconds of live time** | Hours are what users think in. Server meters while the listen socket is open; it can't be faked from the client. |

## Latency budget (target: first word on screen < 1 s after the hotkey)

| Step | Budget |
|---|---|
| Hotkey → Rust handler → UI | < 5 ms |
| Screen capture + JPEG + upload | ~50 ms (measured, release build) |
| Desktop → Oracle (India region) TLS keep-alive | 20–40 ms |
| Oracle → OpenAI, time-to-first-token (`reasoning_effort: none`) | 300–600 ms |
| SSE token → overlay render (rAF batched) | < 16 ms |

The speech side runs continuously. Partial captions stream in while the person is
still talking, so when the question ends the transcript is already there.

## API contract (v1)

Base URL: `PUBLIC_API_URL` (e.g. `https://api.glint.app`). All JSON. Auth is
`Authorization: Bearer <token>`. Tokens are opaque, stored hashed and valid for 60 days.

Errors: `{ "error": "<code>", "message": "<human text>" }` with codes
`unauthorized` (401), `no_balance` (402), `rate_limited` (429), `bad_request` (400),
`not_found` (404), `upstream` (502).

### Auth
| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/v1/auth/google` | `{ credential }` (GIS ID token) | `{ token, user }` |
| POST | `/v1/auth/dev` | `{ email }`. Only when `DEV_LOGIN=1` | `{ token, user }` |
| POST | `/v1/auth/device/start` | `{}` | `{ device_code, user_code, verify_url, interval, expires_in }` |
| GET  | `/v1/auth/device/info?user_code=` | — | `{ user_code, expires_in }` or 404 |
| POST | `/v1/auth/device/approve` | `{ user_code }` (Bearer: web session) | `{ ok: true }` |
| POST | `/v1/auth/device/poll` | `{ device_code }` | `{ status: "pending" }` / `{ status: "approved", token, user }` / 410 `expired` |
| POST | `/v1/auth/logout` | — | `{ ok: true }` |

`user_code` is 8 chars `ABCD-2345` (no ambiguous chars), shown in both the app
and the browser so the user can confirm they match. `verify_url` =
`${WEB_URL}/device?code=ABCD-2345`.

### Account
| Method | Path | Response |
|---|---|---|
| GET | `/v1/me` | `{ user: {id,email,name,picture}, balance_seconds, expires_at, live, trial_seconds }` |
| GET | `/v1/usage` | `{ usage: [{kind, seconds, started_at, ended_at}], orders: [{id, plan_id, amount_paise, seconds, status, created_at}] }` |

### Billing
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/plans` | — | `{ plans: [{id,name,price_inr,seconds,tagline,badge}], trial_seconds, validity_days }` |
| POST | `/v1/billing/order` | `{ plan_id }` | `{ order_id, amount, currency, key_id, name, email, plan }` |
| POST | `/v1/billing/verify` | `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }` | `{ ok, balance_seconds }` |
| POST | `/v1/billing/webhook` | Razorpay webhook (`X-Razorpay-Signature`) | `{ ok }` |
| POST | `/v1/admin/grant` | `{ email, seconds, note }` (admins only) | `{ ok, balance_seconds }` |

Plans (INR, GST-inclusive):

| id | Price | Time | Per hour |
|---|---|---|---|
| `trial` | free on sign-up | 20 min | — |
| `starter` | ₹499 | 2 h | ₹250 |
| `pro` | ₹1,499 | 7 h | ₹214 |
| `max` | ₹3,499 | 20 h | ₹175 |

Each purchase extends the validity of the whole balance to 180 days from that purchase.

### Models. `GET /v1/models`
`{ models: [{ id, label, tag, hint }], default }`. This is the catalog (GPT-6 Luna, GPT-6.1 Terra,
GPT-6.1 Sol), narrowed by the admin's allowed list and by what the server's OpenAI project can use
(checked against OpenAI's `/v1/models` every 30 minutes).

### Answers. `POST /v1/answer`, streamed as Server-Sent Events
```jsonc
{
  "action": "answer" | "screen" | "ask" | "shorter" | "expand" | "followups" | "recap",
  "model": "gpt-6-luna",          // optional; must be in /v1/models, otherwise the default is used
  "question": "typed text (action=ask)",
  "transcript": [{ "who": "them" | "you", "text": "..." }],   // oldest → newest, ≤ 12k chars
  "image": "<base64 jpeg, no data: prefix>" | null,
  "history": [{ "role": "user" | "assistant", "content": "..." }],  // last Q/A turns, for follow-ups
  "profile": {
    "mode": "general|interview|sales|meeting|coding", "context": "...", "language": "English",
    "session": { "company": "", "position": "", "title": "", "agenda": "", "prospect": "" },
    "docs": [{ "name": "resume.pdf", "text": "..." }]          // ≤ 24k chars total, resume first
  },
  "auto": false   // true when triggered by auto-answer
}
```
The prompt puts the stable parts first (profile, session, documents) and the conversation last,
so OpenAI's prompt cache reuses the document prefix across answers. Requests use
`service_tier: "priority"` (≈0.6 s to first word; falls back to the default lane if the account
can't use it) and `reasoning_effort: "none"`.
Stream:
```
event: delta   data: {"t":"text chunk"}
event: done    data: {"balance_seconds":12345,"ms":812}
event: error   data: {"error":"no_balance","message":"..."}
```
Answers are included in live time. Outside a live session each answer costs
`ANSWER_SECONDS` (default 30 s).

### Live transcription. `GET /v1/listen` (WebSocket, `Authorization: Bearer`)
Client → server
* text `{"type":"start","language":"en"}`: send first
* binary: `[1 byte src: 0 = you (mic), 1 = them (system audio)] + PCM16LE mono 24 kHz`
* text `{"type":"commit","src":"you"|"them"}`: end of an utterance (client VAD)
* text `{"type":"stop"}`

Server → client
* `{"type":"ready","balance_seconds":N}`
* `{"type":"delta","src":"them","id":"item_1","text":"partial words"}`
* `{"type":"final","src":"them","id":"item_1","text":"full utterance"}`
* `{"type":"balance","balance_seconds":N}` every ~10 s
* `{"type":"error","error":"no_balance"|"replaced"|"idle"|"shutdown","message":"..."}`, then close

Transcription: "them" uses `gpt-live-transcribe` (word-by-word partials) and "you" uses `gpt-transcribe`,
both over OpenAI realtime. If OpenAI refuses realtime access to a model (`model_not_found`, which is
common for a few minutes after enabling it on a project), that source falls back to transcribing each
finished utterance via `/v1/audio/transcriptions` (`STT_REST_MODEL`). Captions then arrive per
sentence (~1.5 s after it ends) instead of per word, and realtime is retried after 10 minutes.

Rules: one live session per account (a new one replaces the old one). Time is
deducted every 5 s while the socket is open, and the final partial second is rounded up.
The session closes automatically after `IDLE_TIMEOUT_S` (default 300 s) with no speech,
so a forgotten session doesn't drain hours. On `shutdown` (server restart) the app reconnects by itself.

### Admin. `/v1/admin/*` (accounts listed in `ADMIN_EMAILS` only)
| Method | Path | What |
|---|---|---|
| GET | `/v1/admin/stats` | Users, revenue, live now, usage, tokens, 14-day table |
| GET | `/v1/admin/users?q=&filter=all\|paying\|live\|blocked` | Search users |
| GET | `/v1/admin/users/:id` | Profile, balance, orders, time history, usage, signed-in devices |
| POST | `/v1/admin/users/:id/block` · `/unblock` | `{ reason }`. Blocking ends their live session and rejects every request with the reason. |
| POST | `/v1/admin/users/:id/time` | `{ seconds, note }`. Positive adds time, negative deducts. |
| POST | `/v1/admin/users/:id/logout` | Signs the user out on every device |
| GET / POST | `/v1/admin/live` · `/v1/admin/live/:id/end` | Live sessions, end one |
| GET | `/v1/admin/orders` | All orders, including unpaid checkouts |
| GET / POST | `/v1/admin/config` | Runtime controls (below) |
| GET | `/v1/admin/log` | Audit log of every admin action |

Runtime controls are stored in the DB and applied instantly, without a restart: maintenance mode
(+ message; admins bypass it), sign-ups open/closed, trial minutes, seconds charged per standalone
answer, idle auto-pause, allowed models, default model. The web UI is at `/admin`.

## Desktop internals

* **Windows**: a single `overlay` window that's transparent, undecorated, always on top,
  skip-taskbar, `WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW`, `WDA_EXCLUDEFROMCAPTURE`.
  The window is resized to fit its content, so the transparent area never blocks clicks.
  Show, hide and focus go through Win32 directly, because tao's own visibility flag doesn't
  know about a no-activate show.
* **Moving**: drag the logo (or the bubble). Glint moves its own window with `SetWindowPos`
  while the button is held, never through Windows' move loop. That loop draws a white outline
  rectangle when "Show window contents while dragging" is off, plus Snap previews, and those are
  drawn outside our window, so screen sharing would show them.
* **Focus**: the overlay never takes focus. Typing mode (`Ctrl+Shift+Space` or
  clicking the input) activates it, and pressing Esc or submitting hands focus back to the previous window.
* **Shortcuts**: global, rebindable. The scroll keys are only registered while an
  answer is visible, so they don't take arrow keys away from other apps the rest of the time.

| Action | Default |
|---|---|
| Collapse to bubble / expand | `Ctrl+\` |
| Answer now (conversation + screen) | `Ctrl+Enter` |
| Solve what's on screen | `Ctrl+Shift+Enter` |
| Start / stop listening | `Ctrl+Shift+L` |
| Type a question | `Ctrl+Shift+Space` |
| Scroll answer (contextual) | `Ctrl+↑` / `Ctrl+↓` |

* **Collapse to bubble**: `Ctrl+\`, the logo or the — button shrinks Glint to a 48 px floating logo
  (like iOS AssistiveTouch). Tap it to expand, or drag it anywhere. Expanding near a screen edge
  keeps the whole panel on screen. It shows a red ring while live, a spinning ring while
  thinking, and a dot when an answer arrived while collapsed. "Hide completely" (⋮ menu or tray)
  hides even the bubble.
* **Session setup**: type (Interview / Meeting / Sales / Coding / General) with fields for that type
  (company + position, call title + agenda, product + prospect), language, AI model picker,
  resume and reference docs (PDF / DOCX / TXT / MD, text extracted locally in Rust, ≤ 20k chars each)
  and free-form notes.
* **Quick menu (⋮)**: account and balance, dashboard, add hours, invisibility toggle, zoom
  (70–150 %), settings, hide completely, sign out, quit.
* **Audio devices**: "them" is a WASAPI loopback of the default output, or of a chosen device,
  since call apps often play through a headset that isn't the Windows default. "You" is the default
  mic or a chosen one.
* **Auto-answer**: when a finished "them" utterance looks like a question, Glint
  waits 0.35 s for any continuation, then answers on its own (setting, on by default).
* **Privacy**: audio and transcripts are never stored on the server. Only usage
  seconds and token counts are kept, for billing.
