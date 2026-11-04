<script lang="ts">
  import { onMount } from 'svelte';
  import { DEV_LOGIN, GOOGLE_CLIENT_ID } from '$lib/config';
  import { loadScript } from '$lib/script';
  import { session } from '$lib/session.svelte';
  import { errorMessage } from '$lib/api';

  let {
    onsuccess,
    title = 'Sign in to Glint',
    subtitle = 'Use your Google account. New accounts get 20 free minutes.'
  }: { onsuccess?: () => void; title?: string; subtitle?: string } = $props();

  let googleEl: HTMLDivElement | undefined = $state();
  let error = $state('');
  let busy = $state(false);
  let gsiLoading = $state(!!GOOGLE_CLIENT_ID);
  let devEmail = $state('');

  async function finish(fn: () => Promise<void>) {
    error = '';
    busy = true;
    try {
      await fn();
      onsuccess?.();
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    if (!GOOGLE_CLIENT_ID || !googleEl) return;
    const el = googleEl;
    loadScript('https://accounts.google.com/gsi/client')
      .then(() => {
        const gsi = window.google?.accounts.id;
        if (!gsi) throw new Error('Google sign-in failed to start.');
        gsi.initialize({
          client_id: GOOGLE_CLIENT_ID,
          ux_mode: 'popup',
          callback: ({ credential }) => finish(() => session.loginWithGoogle(credential))
        });
        const width = Math.max(200, Math.min(340, Math.floor(el.clientWidth || 320)));
        gsi.renderButton(el, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          logo_alignment: 'center',
          width
        });
      })
      .catch((e) => (error = errorMessage(e)))
      .finally(() => (gsiLoading = false));
  });

  function devSubmit(e: SubmitEvent) {
    e.preventDefault();
    const email = devEmail.trim();
    if (!email) return;
    finish(() => session.loginDev(email));
  }
</script>

<div class="panel card">
  <h1>{title}</h1>
  <p class="muted sub">{subtitle}</p>

  {#if GOOGLE_CLIENT_ID}
    <div class="google" class:busy>
      <div bind:this={googleEl} class="gsi"></div>
      {#if gsiLoading}<div class="skeleton" aria-hidden="true"></div>{/if}
    </div>
  {:else}
    <p class="notice">
      Google sign-in isn't configured. Set <code>PUBLIC_GOOGLE_CLIENT_ID</code> to enable it.
    </p>
  {/if}

  {#if DEV_LOGIN}
    <div class="divider"><span>dev login</span></div>
    <form onsubmit={devSubmit} class="dev">
      <label class="sr-only" for="dev-email">Email</label>
      <input
        id="dev-email"
        class="input"
        type="email"
        placeholder="you@example.com"
        autocomplete="email"
        bind:value={devEmail}
        required
      />
      <button class="btn btn-primary" disabled={busy}>Continue</button>
    </form>
  {/if}

  {#if busy}<p class="muted status">Signing you in…</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <p class="fine muted">
    By continuing you agree to our <a class="link" href="/terms">Terms</a> and
    <a class="link" href="/privacy">Privacy Policy</a>.
  </p>
</div>

<style>
  .panel {
    width: 100%;
    max-width: 420px;
    padding: 32px 24px;
    text-align: center;
  }
  h1 {
    font-size: 26px;
  }
  .sub {
    margin: 8px auto 26px;
    max-width: 320px;
    font-size: 15px;
  }
  .google {
    position: relative;
    display: flex;
    justify-content: center;
    min-height: 44px;
  }
  .google.busy {
    opacity: 0.6;
    pointer-events: none;
  }
  .gsi {
    width: 100%;
    max-width: 340px;
    display: flex;
    justify-content: center;
    /* Google's button is a light-scheme iframe. On our dark-scheme page the browser would paint
       it an opaque white backdrop; matching its scheme keeps the iframe transparent. */
    color-scheme: light;
  }
  .skeleton {
    position: absolute;
    inset: 0;
    margin: 0 auto;
    max-width: 340px;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--surface-2), var(--surface-3), var(--surface-2));
    background-size: 200% 100%;
    animation: shimmer 1.2s linear infinite;
  }
  @keyframes shimmer {
    to {
      background-position: -200% 0;
    }
  }
  .notice {
    font-size: 14px;
    color: var(--muted);
    background: var(--surface-2);
    border: 1px dashed var(--border-strong);
    border-radius: 12px;
    padding: 12px 14px;
  }
  code {
    font-family: var(--mono);
    font-size: 12.5px;
    color: var(--accent);
    overflow-wrap: anywhere;
  }
  .divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 22px 0 14px;
    color: var(--faint);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }
  .dev {
    display: flex;
    gap: 8px;
  }
  .dev .input {
    min-width: 0;
  }
  .status {
    margin-top: 14px;
    font-size: 14px;
  }
  .error {
    margin-top: 14px;
    font-size: 14px;
    color: var(--danger);
  }
  .fine {
    margin-top: 24px;
    font-size: 12.5px;
  }
  @media (max-width: 400px) {
    .dev {
      flex-direction: column;
    }
  }
</style>
