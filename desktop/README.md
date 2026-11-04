# Glint for Windows

Tauri 2 (Rust core) + Svelte 5 overlay.

```
src-tauri/src/
  lib.rs        app setup, overlay placement, tray
  commands.rs   everything the UI can call
  audio.rs      mic + WASAPI loopback → 24 kHz PCM16 → VAD gate (unit-tested)
  listen.rs     live session WebSocket (auto-reconnect)
  api.rs        pooled HTTP client + SSE answer streaming
  screen.rs     screenshot of the monitor under the cursor → JPEG
  shortcuts.rs  global + contextual hotkeys
  win.rs        Win32: no-activate, focus hand-off, show/hide, capture protection
  auth.rs       session token encrypted with DPAPI
src/            Svelte UI (store.svelte.ts holds all app state)
```

## Develop
```powershell
pnpm install
pnpm tauri dev            # talks to http://localhost:8787 and http://localhost:5173 by default
cd src-tauri; cargo test  # audio resampler + speech gate tests
```

## Release build
```powershell
$env:GLINT_API_URL = "https://api.yourdomain.com"
$env:GLINT_WEB_URL = "https://yourdomain.com"
pnpm tauri build          # → src-tauri/target/release/bundle/nsis/*.exe
```

## Developer switches (runtime env vars)
| Var | Effect |
|---|---|
| `GLINT_API_URL` / `GLINT_WEB_URL` | Override the compiled-in URLs |
| `GLINT_ALLOW_CAPTURE=1` | Keep the overlay visible to screenshots (demos, marketing shots) |
| `GLINT_DEBUG_AUDIO=1` | Print speech-gate levels every 2 s (tuning on real hardware) |
| `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223` | Attach Chrome DevTools to the overlay |

## Diagnostics
* `cargo run --example audio_probe`: live peak levels for every input device and every output loopback.
  If "Stereo Mix" and loopback both read 0.0000 while audio plays, the output is muted or routed elsewhere.
* `cargo run --example play_to -- "<device>" file.wav`: play a WAV into a specific output device
  (e.g. a virtual cable) to simulate the other side of a call.
