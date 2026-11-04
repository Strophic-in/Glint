# Glint web

The public site and account pages for Glint: landing page, Google sign-in, desktop device approval,
dashboard with Razorpay checkout, and legal pages. SvelteKit 2 + Svelte 5, deployed to Vercel.

Every page is static. Content pages are prerendered, and the app pages (`/login`, `/device`, `/dashboard`)
are client-rendered shells that talk to the Glint API (`PUBLIC_API_URL`). There are no server functions,
so there's nothing to cold-start and no function cost.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `PUBLIC_API_URL` | yes | Glint API base URL, no trailing slash. Default `http://localhost:8787`. |
| `PUBLIC_GOOGLE_CLIENT_ID` | yes (prod) | Google OAuth **Web application** client ID. |
| `PUBLIC_DOWNLOAD_URL` | yes (prod) | Link to the Windows installer. If empty, Download goes to the dashboard. |
| `PUBLIC_DEV_LOGIN` | no | `1` shows an email-only dev login (`POST /v1/auth/dev`). **Never set in production.** |
| `PUBLIC_BRAND_NAME` | no | Default `Glint`. |
| `PUBLIC_SUPPORT_EMAIL` | no | Shown in the footer, contact page and legal pages. |

These are `$env/static/public` values, so they're **baked in at build time**. Redeploy after changing them.

Copy `.env.example` to `.env` for local development.

## Local development

```bash
pnpm install
cp .env.example .env          # set PUBLIC_DEV_LOGIN=1 to sign in without Google
pnpm dev                      # http://localhost:5173
pnpm check                    # svelte-check (types + a11y)
pnpm build && pnpm preview
```

Run the API locally on `:8787` (see `../server`) with `DEV_LOGIN=1` for the dev login to work.

> **Windows note:** `adapter-vercel` symlinks `node_modules` while packaging, which Windows blocks
> unless Developer Mode is on. On local Windows builds, `svelte.config.js` compiles and prerenders
> everything but skips the Vercel packaging step. Vercel's Linux builders always use the real adapter.
> Set `FORCE_VERCEL_ADAPTER=1` to package locally (requires Developer Mode).

## Deploy to Vercel

1. Push the repo to GitHub, then **Vercel → Add New → Project → Import** it.
2. **Root Directory: `web`**. The framework preset (SvelteKit) and pnpm are detected automatically.
3. Add the environment variables above (Production + Preview).
4. Deploy. Then add your domain (e.g. `glint.app`) under **Settings → Domains**.

### Google sign-in setup

Google Cloud Console → APIs & Services:

1. **OAuth consent screen**: External, app name, support email, your domain. Add links to
   `/privacy` and `/terms`. Scopes: only `openid`, `email`, `profile`.
2. **Credentials → Create OAuth client ID → Web application**.
   - Authorized JavaScript origins: `https://your-domain`, `https://your-project.vercel.app`, `http://localhost:5173`.
   - No redirect URIs are needed (the popup flow returns an ID token).
3. Use the same client ID for `PUBLIC_GOOGLE_CLIENT_ID` here and `GOOGLE_CLIENT_ID` on the server.

### Razorpay

The API creates orders and returns `key_id`. The site only loads `checkout.js` and posts the result to
`/v1/billing/verify`. For Razorpay website verification, the required pages already exist: `/privacy`, `/terms`,
`/refunds` and `/contact`. Fill in the `[Your Company Legal Name]`, address, GSTIN and grievance-officer
placeholders before submitting.

### API CORS

The API must allow the site's origin (e.g. `https://glint.app`, and `http://localhost:5173` in dev),
the `Authorization` + `Content-Type` headers, and `GET, POST, OPTIONS`.

## Routes

| Route | What it does |
|---|---|
| `/` | Landing: hero, live overlay mock, features, shortcuts, pricing (`GET /v1/plans`, static fallback), FAQ |
| `/login?next=/path` | Google sign-in (+ dev login), then redirects to `next` (same-origin paths only) |
| `/device?code=ABCD-2345` | Desktop approval: validates the code, signs in if needed, **Connect** posts to `/v1/auth/device/approve` |
| `/dashboard` | Balance, validity, live badge, buy hours (Razorpay), sessions + purchases |
| `/privacy` `/terms` `/refunds` `/contact` | Legal pages (placeholders in `[brackets]`) |

## Structure

```
src/
  app.css                  design tokens + base styles
  lib/
    api.ts                 typed fetch client for the v1 API (Bearer token in localStorage `glint_token`)
    session.svelte.ts      rune-based session: me, init/refresh, Google/dev login, logout
    config.ts              public env with defaults
    format.ts plans.ts script.ts toast.svelte.ts
    components/            Header, Footer, Logo, LoginPanel, OverlayMock, Pricing, DownloadButton, Toasts
  routes/                  pages listed above
```
