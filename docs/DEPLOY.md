# Deploying Glint

| Part | Where | URL |
|---|---|---|
| API (Node, Docker) | Oracle VM `140.245.196.3`, `/opt/glint` | `https://glint-api.strophic.in` |
| Database | VibeDB project `glint` (same VM) | — |
| Website (SvelteKit) | Vercel | `https://glint.strophic.in` |
| Windows installer | served by nginx on the VM | `https://glint-api.strophic.in/downloads/Glint-Setup.exe` |

## API on the Oracle VM

The VM already runs nginx + certbot and VibeDB. Glint runs as one container on `127.0.0.1:18400`.

**Update / redeploy** (from the repo root, Git Bash):
```bash
./deploy/deploy.sh          # uploads server/ + deploy/, rebuilds the image on the VM, waits for /health
```
The VM's `/opt/glint/server/.env` holds the secrets and is never overwritten by deploys.

**First-time setup** (already done for this VM; kept here for a fresh server):
1. VibeDB project: `sudo vibedb project create glint`. The connection string for the container is
   `sudo vibedb project credentials glint --role owner --url local-direct`, with `127.0.0.1`
   replaced by `host.docker.internal` (Postgres accepts Docker networks without TLS).
2. `/opt/glint/server/.env`: copy `server/.env.example` and fill it in (`chmod 600`).
3. `./deploy/deploy.sh`
4. DNS: Cloudflare A record `glint-api` → VM IP (proxied is fine).
5. TLS + site:
   ```bash
   sudo certbot certonly --nginx -d glint-api.strophic.in
   sudo cp /opt/glint/deploy/nginx/glint-api.conf /etc/nginx/sites-available/glint-api.strophic.in
   sudo ln -s /etc/nginx/sites-available/glint-api.strophic.in /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```
6. Installer: `mkdir -p /opt/glint/downloads` and upload `Glint-Setup.exe` there.

**Useful commands on the VM**
```bash
sudo docker logs -f glint-api                    # live logs
cd /opt/glint/deploy && sudo docker compose up -d --force-recreate   # apply .env edits
curl -s http://127.0.0.1:18400/health            # local health check
sudo vibedb project show glint                   # DB size, connections; backups in the VibeDB dashboard
```

## Website on Vercel
1. Import the GitHub repo → **Root Directory: `web`** (framework auto-detected: SvelteKit).
2. Environment variables:
   - `PUBLIC_API_URL=https://glint-api.strophic.in`
   - `PUBLIC_GOOGLE_CLIENT_ID=<your OAuth client id>`
   - `PUBLIC_DOWNLOAD_URL=https://glint-api.strophic.in/downloads/Glint-Setup.exe`
   - `PUBLIC_SUPPORT_EMAIL=<support address>`
   - leave `PUBLIC_DEV_LOGIN` unset
3. Domain: add `glint.strophic.in` (Cloudflare: CNAME `glint` → `cname.vercel-dns.com`, DNS only).
4. `PUBLIC_*` variables are baked in at build time: after changing one, redeploy.
5. If you use a different domain, update `WEB_URL` and `CORS_ORIGINS` in the VM's `.env` and recreate
   the container (`docker restart` does not reload `.env`), then rebuild the desktop app with the new
   `GLINT_WEB_URL`.

## Google sign-in
Google Cloud Console → APIs & Services:
1. **OAuth consent screen**: External, app name "Glint", links to `/privacy` and `/terms`.
   Scopes: `openid`, `email`, `profile`.
2. **Credentials → OAuth client ID → Web application**. Authorized JavaScript origins:
   `https://glint.strophic.in` and `http://localhost:5173`.
3. Put the client ID in the VM's `.env` (`GOOGLE_CLIENT_ID`) and in Vercel (`PUBLIC_GOOGLE_CLIENT_ID`).

## Cashfree payments
1. Cashfree Merchant Dashboard → Developers → **API Keys**. Start with **Test** keys:
   `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENV=sandbox` in the VM's `.env`.
2. **Webhooks**: add `https://glint-api.strophic.in/v1/billing/webhook` for *Payment* events
   (the API also sets it per order as `notify_url`). Webhooks are verified with your secret key.
3. Test a purchase end to end, then switch to production keys and `CASHFREE_ENV=production`.
4. Website verification for live mode needs `/privacy`, `/terms`, `/refunds` and `/contact` (included).

Hours are credited only after the API asks Cashfree for the order and sees `PAID` for the exact
amount. Browser confirmation and webhook can both arrive, and crediting happens once.
Coupons (admin panel → Coupons) are applied server-side. A 100% coupon credits instantly without a
payment, and a coupon counts as used only when the order is paid.

## Windows app
```powershell
cd desktop
$env:GLINT_API_URL = "https://glint-api.strophic.in"
$env:GLINT_WEB_URL = "https://glint.strophic.in"
pnpm tauri build    # → src-tauri/target/release/bundle/nsis/Glint_<version>_x64-setup.exe
scp -i ~/.ssh/oracle.key <that exe> ubuntu@140.245.196.3:/opt/glint/downloads/Glint-Setup.exe
```
Before charging money, sign the installer with a code-signing certificate
(`bundle.windows.certificateThumbprint` in `tauri.conf.json`). Otherwise SmartScreen warns every user.

## Local development
`.\dev.ps1` from the repo root opens the API, website and app. `server\.env` needs:
- `DATABASE_URL`: the VibeDB **glint-dev** project
  (`sudo vibedb project credentials glint-dev --role owner --url direct`)
- `OPENAI_API_KEY` (optional: without it, answers are simulated)
- `ADMIN_EMAILS` with the email you sign in with locally (local mode uses email "dev login")

Server tests (78 checks: auth, device flow, metering, Cashfree with a mock server, coupons,
account, admin) need any Postgres database:
```powershell
cd server
$env:DATABASE_URL="postgresql://…/glint_test"; $env:MOCK_AI="1"; $env:DEV_LOGIN="1"
$env:ADMIN_EMAILS="admin@example.com"; $env:PORT="8789"; $env:API="http://127.0.0.1:8789"
$env:CASHFREE_APP_ID="test_app"; $env:CASHFREE_SECRET_KEY="test_secret"
$env:CASHFREE_BASE_URL="http://127.0.0.1:8799/pg"; $env:CASHFREE_MOCK="1"
node dist/index.js   # in one terminal
node test/smoke.mjs  # in another
```
