<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import LoginPanel from '$lib/components/LoginPanel.svelte';
  import { session } from '$lib/session.svelte';
  import { ApiError, api, errorMessage } from '$lib/api';
  import { BRAND } from '$lib/config';

  type Status = 'idle' | 'checking' | 'valid' | 'expired' | 'error' | 'approving' | 'done';

  function normalize(raw: string | null): string {
    const s = (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
  }

  const code = $derived(normalize(page.url.searchParams.get('code')));

  let status = $state<Status>('idle');
  let error = $state('');
  let expiresAt = $state(0);
  let now = $state(Date.now());
  let manual = $state('');

  const remaining = $derived(Math.max(0, Math.ceil((expiresAt - now) / 1000)));
  const countdown = $derived(`${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`);

  // Validate the code whenever it changes.
  $effect(() => {
    const c = code;
    error = '';
    if (!c) {
      status = 'idle';
      return;
    }
    status = 'checking';
    let cancelled = false;
    api
      .deviceInfo(c)
      .then((info) => {
        if (cancelled) return;
        expiresAt = Date.now() + info.expires_in * 1000;
        status = info.expires_in > 0 ? 'valid' : 'expired';
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && (e.status === 404 || e.status === 410)) status = 'expired';
        else {
          status = 'error';
          error = errorMessage(e);
        }
      });
    return () => {
      cancelled = true;
    };
  });

  // Countdown tick while waiting for approval.
  $effect(() => {
    if (status !== 'valid') return;
    const t = setInterval(() => {
      now = Date.now();
      if (expiresAt && now >= expiresAt) status = 'expired';
    }, 1000);
    return () => clearInterval(t);
  });

  async function approve() {
    status = 'approving';
    error = '';
    try {
      await api.deviceApprove(code);
      status = 'done';
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 410)) status = 'expired';
      else if (e instanceof ApiError && e.status === 401) {
        await session.refresh();
        status = 'valid';
        error = 'Please sign in again.';
      } else {
        status = 'valid';
        error = errorMessage(e);
      }
    }
  }

  function submitManual(e: SubmitEvent) {
    e.preventDefault();
    const c = normalize(manual);
    if (c) goto(`/device?code=${encodeURIComponent(c)}`, { replaceState: true });
  }

  async function switchAccount() {
    await session.logout();
  }
</script>

<svelte:head>
  <title>Connect the app · {BRAND}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<section class="wrap container">
  {#if status === 'idle'}
    <div class="card box">
      <div class="icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
          ><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg
        >
      </div>
      <h1>Connect {BRAND} for Windows</h1>
      <p class="muted sub">Enter the code shown in the app.</p>
      <form class="manual" onsubmit={submitManual}>
        <label class="sr-only" for="code">Device code</label>
        <input
          id="code"
          class="input mono-input"
          placeholder="ABCD-2345"
          maxlength="9"
          autocomplete="off"
          spellcheck="false"
          bind:value={manual}
          required
        />
        <button class="btn btn-primary">Continue</button>
      </form>
    </div>
  {:else if status === 'checking' || session.loading}
    <p class="muted">Checking code…</p>
  {:else if status === 'expired'}
    <div class="card box">
      <div class="icon warn" aria-hidden="true">!</div>
      <h1>This code has expired</h1>
      <p class="muted sub">
        Codes last a few minutes. In {BRAND}, click <b>Sign in with Google</b> again to get a fresh one.
      </p>
      <a class="btn" href="/device">Enter a code manually</a>
    </div>
  {:else if status === 'error'}
    <div class="card box">
      <div class="icon warn" aria-hidden="true">!</div>
      <h1>Couldn't check this code</h1>
      <p class="muted sub">{error}</p>
      <button class="btn" onclick={() => location.reload()}>Try again</button>
    </div>
  {:else if status === 'done'}
    <div class="card box">
      <div class="icon ok" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"
          ><path d="m5 12 5 5 9-10" /></svg
        >
      </div>
      <h1>You're connected</h1>
      <p class="muted sub">Return to {BRAND} — it will finish signing in on its own. You can close this tab.</p>
      <a class="btn" href="/dashboard">Open dashboard</a>
    </div>
  {:else if !session.signedIn}
    <LoginPanel
      title="Sign in to connect {BRAND}"
      subtitle="Sign in with the Google account you want to use in the app."
    />
  {:else}
    <div class="card box">
      <div class="icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
          ><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg
        >
      </div>
      <h1>Connect {BRAND} for Windows</h1>
      <p class="muted sub">Make sure this matches the code in the app.</p>

      <div class="code" aria-label="Device code {code}">{code}</div>
      <p class="expires muted">Expires in <span class="mono">{countdown}</span></p>

      <div class="who">
        {#if session.me?.user.picture}
          <img src={session.me.user.picture} alt="" width="32" height="32" referrerpolicy="no-referrer" />
        {/if}
        <div>
          <div class="email">{session.me?.user.email}</div>
          <button class="switch" onclick={switchAccount}>Not you? Switch account</button>
        </div>
      </div>

      <button class="btn btn-primary btn-lg btn-block" onclick={approve} disabled={status === 'approving'}>
        {status === 'approving' ? 'Connecting…' : 'Connect'}
      </button>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <p class="fine muted">Only connect if you just clicked sign in inside {BRAND}. Never enter a code someone sent you.</p>
    </div>
  {/if}
</section>

<style>
  .wrap {
    display: flex;
    justify-content: center;
    padding-top: 72px;
    padding-bottom: 24px;
  }
  .box {
    width: 100%;
    max-width: 440px;
    padding: 32px 24px;
    text-align: center;
  }
  .icon {
    width: 48px;
    height: 48px;
    margin: 0 auto 18px;
    border-radius: 14px;
    display: grid;
    place-items: center;
    color: var(--accent);
    background: var(--accent-soft);
    border: 1px solid rgba(245, 184, 61, 0.22);
    font-weight: 700;
    font-size: 22px;
  }
  .icon svg {
    width: 24px;
    height: 24px;
  }
  .icon.ok {
    color: var(--ok);
    background: rgba(61, 220, 151, 0.12);
    border-color: rgba(61, 220, 151, 0.28);
  }
  .icon.warn {
    color: var(--danger);
    background: rgba(255, 107, 107, 0.1);
    border-color: rgba(255, 107, 107, 0.28);
  }
  h1 {
    font-size: 24px;
  }
  .sub {
    margin: 8px auto 22px;
    max-width: 340px;
    font-size: 15px;
  }
  .code {
    font-family: var(--mono);
    font-weight: 600;
    font-size: clamp(30px, 9vw, 42px);
    letter-spacing: 0.08em;
    padding: 18px 12px;
    border-radius: 14px;
    background: var(--bg);
    border: 1px solid var(--border-strong);
    color: var(--text);
  }
  .expires {
    margin-top: 10px;
    font-size: 13px;
  }
  .mono {
    font-family: var(--mono);
  }
  .who {
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    margin: 22px 0 18px;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .who img {
    border-radius: 50%;
    flex: none;
  }
  .who > div {
    min-width: 0;
  }
  .email {
    font-weight: 600;
    font-size: 14.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .switch {
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    font-size: 13px;
    cursor: pointer;
  }
  .switch:hover {
    color: var(--text);
    text-decoration: underline;
  }
  .manual {
    display: flex;
    gap: 8px;
  }
  .mono-input {
    font-family: var(--mono);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    min-width: 0;
  }
  .error {
    margin-top: 12px;
    color: var(--danger);
    font-size: 14px;
  }
  .fine {
    margin-top: 16px;
    font-size: 12.5px;
  }
  @media (max-width: 400px) {
    .manual {
      flex-direction: column;
    }
  }
</style>
