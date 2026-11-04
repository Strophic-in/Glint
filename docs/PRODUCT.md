# Glint: product decisions

## Positioning
**"Answers before they finish asking."** A real-time AI copilot for Windows that hears both
sides of a call, sees your screen, and puts the next thing to say in a private overlay in under a second.

Who it's for (in launch order): job seekers in interviews and mock interviews, sales and customer calls,
students and professionals in meetings, developers working through problems on screen.

> Don't market it as a cheating tool. Payment gateways (Razorpay included) treat that as a
> high-risk category and can freeze payouts, and Google's OAuth review and app stores react the same way.
> "Your copilot for every call" sells just as well and keeps the business safe.

## How Glint beats Cluely
| | Cluely | Glint |
|---|---|---|
| App weight | Electron (bundles Chromium + Node) | Tauri: **2.5 MB installer**, 6 MB Rust core, uses Windows' built-in WebView2 |
| Focus | Can grab focus | **Never takes focus.** Typing mode hands it back to your app |
| Who said what | Single mixed stream | **Both sides, labelled** (system audio = them, mic = you) |
| Proactive | Press to ask | **Auto-answer** when they ask a question, plus a "question detected" hint |
| Shortcuts | Fixed, global arrows | **Rebindable**; scroll keys exist only while an answer is shown |
| Headset calls | Default device only | **Pick the call's output device** (headset vs speakers) |
| Pricing | USD subscription | **INR hour packs**, UPI, billed per second only while live |
| Forgotten session | Keeps billing | **Auto-pause** after 5 min of silence |
| Privacy | — | No audio, transcripts or screenshots stored on the server |
| Personal context | Basic | **Session setup** (company + role, call agenda) plus **resume and reference docs** that answers are grounded in |
| Model choice | Fixed | **Model picker** (GPT-6 Luna / 6.1 Terra / 6.1 Sol), showing only models the server can use |
| Out of the way | Hide or show | **Collapses to a floating logo bubble** you can drag anywhere, tap to reopen |
| Operator control | — | **Admin panel**: stats, block users, add/deduct time, force logout, kill live sessions, maintenance mode, sign-up switch, pricing rules, audit log |

## Pricing: hours, not credits
Hours fit how users think ("one interview ≈ 1 hour"), and they're simple to explain on a sales call.
Credits make people do math and feel like a casino. The model:

* **Free trial: 20 minutes** on sign-up, no card. Enough for one real call, which is the moment people decide to buy.
* **Starter ₹499 / 2 h**: entry point for one important call (₹250/h).
* **Pro ₹1,499 / 7 h**: your original idea at ₹1,499, the anchor plan (₹214/h).
* **Max ₹3,499 / 20 h**: heavy users and placement season (₹175/h).
* Prices include GST. Each purchase makes the **whole balance valid for 180 days**.
* **Billed per second, only while live.** Answers inside a live session are included. A
  standalone answer (screen solve or typed question while not listening) costs 30 s.

### Unit economics (per live hour, Balanced tier)
| Cost item | Assumption | ≈ $/h |
|---|---|---|
| Their speech → `gpt-live-transcribe` | $0.017/min, ~27 speaking min/h after the VAD gate | 0.46 |
| Your speech → `gpt-transcribe` | $0.0045/min, ~24 min/h | 0.11 |
| Answers → `gpt-6.1-terra` | ~40 answers × ~$0.006–0.01 | 0.24–0.40 |
| **Total** | | **≈ $0.8–1.0 (≈ ₹70–88)** |

Pro nets about ₹177/h after GST and Razorpay fees, which leaves **~50–55% gross margin**. Starter is about 60%, Max about 45%.
Levers if you need more margin: use `gpt-transcribe` for both sides (live captions become per-sentence,
saving ~₹30/h), run auto-answers on the Instant tier, or raise Max to ₹3,999.

### Later
* Referral: 30 min for both people. This is the cheapest acquisition channel in India.
* Bulk packs for colleges and teams (admin grant endpoint already exists).
* A monthly "unlimited" plan (fair-use cap) once you have 2–3 months of usage data.
  UPI AutoPay mandates add friction, so keep prepaid as the default.

## The desktop UI (designed for a 2-second glance)
* One slim pill at the top-centre: **Listen · Answer · Screen · ⌨ · time left · ⚙ · hide**.
* The panel only appears when there's something to show: live captions (last 2 lines, expandable),
  the answer card (first line = what to say, then bullets), follow-up chips
  (Shorter, More detail, Follow-up questions, Recap) and the ask box.
* The window resizes to its content, so the transparent area never blocks clicks.
* Settings stay basic on purpose: Mode, About you, speed tier, language, auto-answer, screen,
  audio sources and devices, hide from share, opacity, shortcuts, account.

## Roadmap
1. **v0.2**: auto-updater (Tauri updater + signed builds), export session notes, an admin dashboard
   for revenue and margins (token usage is already logged per answer).
2. **v0.3**: macOS build (Tauri supports it; audio needs ScreenCaptureKit), team accounts,
   referral credits, an optional ultra-low-latency STT provider.
3. **v0.4**: on-device VAD model, local push-to-talk, glossary/keywords from the profile to improve transcription.

## Launch risks
* **Code signing.** Unsigned installers trigger SmartScreen ("Windows protected your PC"), so buy an
  OV code-signing certificate before a paid launch.
* **Model churn.** Model names are env vars on the server, so you can switch without shipping a new app.
* **Single VM.** Nightly SQLite backups are scripted. Copy them off the box (OCI Object Storage) weekly.
