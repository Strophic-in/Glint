<script lang="ts">
  import { glint } from '../lib/store.svelte';
  import { ipc } from '../lib/ipc';
</script>

<section class="panel card">
  {#if glint.phase === 'boot'}
    <p class="muted">Starting…</p>
  {:else if glint.phase === 'offline'}
    <h2>Can't reach Glint</h2>
    <p class="muted">{glint.bootError}</p>
    <div class="row">
      <button class="primary" onclick={() => glint.restore()}>Try again</button>
      <button class="ghost" onclick={() => ipc.quit()}>Quit</button>
    </div>
  {:else if glint.signin}
    <h2>Approve in your browser</h2>
    <p class="muted">We opened a sign-in page. Make sure it shows this code:</p>
    <div class="code">{glint.signin.code}</div>
    <p class="wait"><span class="spin"></span> Waiting for approval…</p>
    <div class="row">
      <button class="ghost" onclick={() => glint.signin && ipc.openUrl(glint.signin.url)}>Open the page again</button>
      <button class="ghost" onclick={() => glint.cancelSignin()}>Cancel</button>
    </div>
  {:else}
    <h2>Your invisible AI copilot</h2>
    <p class="muted">
      Glint listens to your call, sees your screen and gives you the words in under a second. Sign in to get
      <b>20 free minutes</b>.
    </p>
    <div class="row">
      <button class="google" onclick={() => glint.beginSignin()}>
        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
        Continue with Google
      </button>
      <button class="ghost" onclick={() => ipc.quit()}>Quit</button>
    </div>
    {#if glint.signinError}<p class="err">{glint.signinError}</p>{/if}
  {/if}
</section>

<style>
  .card {
    margin-top: 8px;
    padding: 18px 20px;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 16px;
    font-weight: 650;
  }
  .muted {
    margin: 0 0 14px;
    color: var(--muted);
    max-width: 560px;
  }
  .muted b {
    color: var(--accent);
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  button {
    height: 36px;
    padding: 0 16px;
    border-radius: 10px;
    font-weight: 600;
  }
  .google {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    background: #fff;
    color: #1f1f1f;
  }
  .google:hover {
    background: #f1f1f1;
  }
  .primary {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .ghost {
    color: var(--muted);
  }
  .ghost:hover {
    background: var(--raise-2);
    color: var(--text);
  }
  .code {
    font-family: var(--mono);
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 4px;
    color: var(--accent);
    margin: 4px 0 10px;
    user-select: text;
  }
  .wait {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    margin: 0 0 12px;
  }
  .spin {
    width: 12px;
    height: 12px;
    border: 2px solid var(--border-strong);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .err {
    color: #ff8f93;
    margin: 10px 0 0;
  }
</style>
