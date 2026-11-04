# Publishing Glint on the Microsoft Store

Why: apps installed from the Store are signed by Microsoft, so users never see the "unknown publisher",
SmartScreen or "suspicious download" warnings that an unsigned installer gets. Individual developer
accounts are free.

The direct-download installer (`Glint-Setup.exe`) keeps working alongside the Store version.

## 1. Partner Center account (one time)

1. Go to https://partner.microsoft.com/dashboard/registration and register as an **Individual** developer
   (free; you verify your identity with an ID and a selfie). A company account needs business
   verification instead.
2. Choose the publisher display name users will see, e.g. "Strophic".

## 2. Reserve the name and copy the package identity

1. Partner Center → **Apps and games** → **New product** → **MSIX or PWA app** → reserve **Glint**.
   If it's taken, try "Glint AI Copilot".
2. Open the product → **Product management** → **Product identity**. Copy these into
   `desktop/msix/store.json`:
   - `Package/Identity/Name` → `identityName`
   - `Package/Identity/Publisher` → `publisher` (starts with `CN=`)
   - `Package/Properties/PublisherDisplayName` → `publisherDisplayName`
   - the reserved name → `displayName`

## 3. Build the package

```powershell
cd desktop
$env:GLINT_API_URL = "https://glint-api.strophic.in"; $env:GLINT_WEB_URL = "https://glint.strophic.in"
pnpm tauri build                 # release build with the production URLs
.\msix\build-msix.ps1            # -> desktop\release\Glint.msix (unsigned; the Store signs it)
```

Bump `version` in `src-tauri/tauri.conf.json` for every new upload: the Store rejects a version it has
already seen.

Optional local test (needs Windows Developer Mode): `.\msix\build-msix.ps1 -LocalTest` registers a
"Glint (test)" copy. Remove it with `Get-AppxPackage Glint.LocalTest | Remove-AppxPackage`.

## 4. Submission

Partner Center → the product → **Start submission**:

**Pricing and availability**: Free, all markets (or India first). Visibility: Public.

**Properties**
- Category: **Productivity**
- Privacy policy URL: `https://glint.strophic.in/privacy`
- Website: `https://glint.strophic.in`
- Support contact: `https://glint.strophic.in/contact`
- Product declarations: tick that the app requires internet. Leave "depends on non-Microsoft drivers or
  NT services" unticked.

**Age ratings**: answer the questionnaire. Glint has no user-to-user communication, no purchases inside
the app and no mature content.

**Packages**: upload `desktop/release/Glint.msix`.

**Store listing** (English):

- Product name: Glint
- Short description:
  > A real-time AI copilot for calls and meetings. Glint listens to both sides of the conversation, sees
  > your screen when you ask, and streams helpful answers into a private overlay in under a second.
- Description:
  > Glint helps you think on your feet during calls, meetings, sales demos and prep sessions.
  >
  > • Live captions for both sides: your microphone and your computer's audio, so it works with Zoom,
  >   Google Meet, Microsoft Teams and any other app.
  > • One-key answers: press Ctrl+Enter and Glint suggests what to say next, using the conversation so far,
  >   your notes and documents you attach (for example a resume or product sheet).
  > • Screen help: ask Glint to read what's on your screen and explain it.
  > • A private overlay: the overlay stays out of your screen shares and recordings, and never takes focus
  >   away from the app you're using.
  > • Fast: answers start streaming in under a second.
  > • Your data stays yours: audio, screenshots and transcripts are not stored on our servers.
  >
  > New accounts get 20 free minutes. More hours can be bought on glint.strophic.in and are billed per
  > second, only while Glint is listening.
- Product features (one per line):
  > Live captions for both sides of any call
  > AI answers in under a second with Ctrl+Enter
  > Uses your notes and documents for context
  > Reads your screen when you ask
  > Private overlay that stays out of screen shares
  > Pay per hour, no subscription
- Search terms: `AI copilot`, `meeting assistant`, `live captions`, `call assistant`, `interview prep`,
  `sales assistant`, `transcription`
- Screenshots: at least one PNG, 1366×768 or larger, of the real app (overlay over a call).
- Copyright: `© 2026 <your legal name>`

**Submission options → Notes for certification**:
> Sign in with any Google account; new accounts get a free 20-minute trial, no payment needed.
> Ctrl+Shift+L starts listening, Ctrl+Enter asks for an answer, Ctrl+Shift+Enter answers about the screen,
> Ctrl+\ collapses or expands the overlay.
> Purchases of extra hours happen on our website (glint.strophic.in), not inside the app.

**Restricted capability justification (runFullTrust)**:
> Glint is a Win32 desktop application (Tauri + WebView2) packaged as MSIX. Full trust is required to
> capture system audio through WASAPI loopback, register global keyboard shortcuts, and show an
> always-on-top overlay window.

Then **Submit to the Store**. Certification usually takes 1 to 3 business days. If it's rejected, the
report says which policy and what to change.

## After it's live

Point the website's Download button at the Store listing (set `PUBLIC_DOWNLOAD_URL` in Vercel to the
`https://apps.microsoft.com/detail/<product id>` link and redeploy), or show both options.
