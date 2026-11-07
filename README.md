# Glint

Real-time AI copilot for Windows. Glint hears both sides of a call, sees your screen, and streams the answer
into a private overlay that never takes focus and doesn't show up in screen shares.

| Folder | What | Runs on |
|---|---|---|
| [`desktop/`](desktop) | Tauri 2 (Rust) + Svelte 5 overlay app | Windows 10 2004+ / 11 |
| [`server/`](server) | Node 22 + Fastify + SQLite API: auth, metering, AI gateway, Razorpay | Oracle VM (Docker + Caddy) |
| [`web/`](web) | SvelteKit site: landing, Google login, device approval, dashboard, checkout, **admin panel** (`/admin`), legal | Vercel |
| [`deploy/`](deploy) | docker-compose, Caddyfile, Oracle setup and backup scripts | Oracle VM |

* [docs/PRODUCT.md](docs/PRODUCT.md): positioning, pricing and unit economics, UX, roadmap
* [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): system design, latency budget, API and WebSocket protocol
* [docs/DEPLOY.md](docs/DEPLOY.md): step-by-step production setup and local dev

**Run it locally:** `.\dev.ps1` (real AI if `server\.env` has `OPENAI_API_KEY`, else simulated).

## Default shortcuts (all rebindable)
| | |
|---|---|
| `Ctrl+\` | Collapse to the floating bubble / expand |
| `Ctrl+Enter` | Answer now (conversation + screen) |
| `Ctrl+Shift+Enter` | Solve what's on screen |
| `Ctrl+Shift+L` | Start a session / mic on-off |
| `Ctrl+Shift+Space` | Type a question |
| `Ctrl+↑ / ↓` | Scroll the answer (only while one is shown) |
| `Ctrl+Alt+C` | Show / hide the code panel |
| `Ctrl+Shift+/` | Show every shortcut |
