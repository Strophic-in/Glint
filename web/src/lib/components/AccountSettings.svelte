<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { api, errorMessage, setToken, type AccountSession } from '$lib/api';
  import { session } from '$lib/session.svelte';
  import { toasts } from '$lib/toast.svelte';
  import { formatDateTime } from '$lib/format';

  const me = $derived(session.me);
  let name = $state('');
  let phone = $state('');
  let saving = $state(false);
  let sessions = $state<AccountSession[] | null>(null);
  let confirmEmail = $state('');
  let deleting = $state(false);
  let showDelete = $state(false);

  $effect(() => {
    if (me && !name) name = me.user.name ?? '';
    if (me && !phone) phone = me.user.phone ?? '';
  });

  async function loadSessions() {
    try {
      sessions = (await api.account.sessions()).sessions;
    } catch (e) {
      toasts.error(errorMessage(e));
    }
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    saving = true;
    try {
      await api.account.profile({ name: name.trim(), phone: phone.trim() });
      await session.refresh();
      toasts.ok('Profile saved.');
    } catch (err) {
      toasts.error(errorMessage(err));
    } finally {
      saving = false;
    }
  }

  async function revoke(s: AccountSession) {
    try {
      await api.account.revoke(s.id);
      toasts.ok(`Signed out ${deviceName(s)}.`);
      await loadSessions();
    } catch (e) {
      toasts.error(errorMessage(e));
    }
  }

  async function revokeOthers() {
    try {
      const r = await api.account.revokeOthers();
      toasts.ok(r.revoked ? `Signed out ${r.revoked} other device${r.revoked > 1 ? 's' : ''}.` : 'No other devices.');
      await loadSessions();
    } catch (e) {
      toasts.error(errorMessage(e));
    }
  }

  async function remove(e: SubmitEvent) {
    e.preventDefault();
    deleting = true;
    try {
      await api.account.remove(confirmEmail.trim());
      setToken(null);
      session.me = null;
      toasts.ok('Your account has been deleted.');
      goto('/', { replaceState: true });
    } catch (err) {
      toasts.error(errorMessage(err));
      deleting = false;
    }
  }

  function deviceName(s: AccountSession) {
    if (s.kind === 'desktop') return 'Glint for Windows';
    const ua = s.user_agent ?? '';
    const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
    return os ? `${browser} on ${os}` : browser;
  }

  onMount(loadSessions);
</script>

{#if me}
  <div class="grid">
    <form class="card box" onsubmit={save}>
      <h3>Profile</h3>
      <div class="who">
        {#if me.user.picture}<img src={me.user.picture} alt="" width="40" height="40" referrerpolicy="no-referrer" />{/if}
        <div>
          <div class="email">{me.user.email}</div>
          <div class="muted small">Signed in with Google</div>
        </div>
      </div>
      <label class="field">
        <span>Name</span>
        <input class="input" bind:value={name} maxlength="80" required />
      </label>
      <label class="field">
        <span>Mobile <span class="muted">· for payment receipts</span></span>
        <input class="input" inputmode="tel" bind:value={phone} maxlength="16" placeholder="10-digit mobile" />
      </label>
      <button class="btn btn-sm btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
    </form>

    <div class="card box">
      <div class="head">
        <h3>Signed-in devices</h3>
        {#if sessions && sessions.length > 1}
          <button class="btn btn-sm btn-ghost" onclick={revokeOthers}>Sign out all others</button>
        {/if}
      </div>
      {#if !sessions}
        <p class="muted">Loading…</p>
      {:else}
        <ul class="devices">
          {#each sessions as s (s.id)}
            <li>
              <div>
                <div class="dname">
                  {deviceName(s)}
                  {#if s.current}<span class="badge badge-ok">This device</span>{/if}
                </div>
                <div class="muted small">Last active {formatDateTime(s.last_used_at)} · signed in {formatDateTime(s.created_at)}</div>
              </div>
              {#if !s.current}<button class="btn btn-sm btn-ghost" onclick={() => revoke(s)}>Sign out</button>{/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>

  <div class="card danger">
    <div>
      <h3>Delete account</h3>
      <p class="muted small">
        Removes your profile, devices and remaining time. Payment records are kept for tax law. This can't be undone.
      </p>
    </div>
    {#if !showDelete}
      <button class="btn btn-sm danger-btn" onclick={() => (showDelete = true)}>Delete my account</button>
    {:else}
      <form class="confirm" onsubmit={remove}>
        <label class="field">
          <span>Type <b>{me.user.email}</b> to confirm</span>
          <input class="input" bind:value={confirmEmail} autocomplete="off" />
        </label>
        <div class="row">
          <button class="btn btn-sm danger-btn" disabled={deleting || confirmEmail.trim().toLowerCase() !== me.user.email.toLowerCase()}>
            {deleting ? 'Deleting…' : 'Delete permanently'}
          </button>
          <button type="button" class="btn btn-sm btn-ghost" onclick={() => ((showDelete = false), (confirmEmail = ''))}>Cancel</button>
        </div>
      </form>
    {/if}
  </div>
{/if}

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 14px;
    margin-bottom: 14px;
  }
  .box {
    padding: 20px 22px;
    display: grid;
    gap: 12px;
    align-content: start;
    min-width: 0;
  }
  h3 {
    font-size: 17px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .who img {
    border-radius: 50%;
  }
  .email {
    font-weight: 600;
    word-break: break-all;
  }
  .small {
    font-size: 13px;
    margin: 0;
  }
  .field {
    display: grid;
    gap: 6px;
    font-size: 14px;
    font-weight: 600;
  }
  .field .input {
    height: 42px;
    font-weight: 400;
  }
  .devices {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }
  .devices li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border);
  }
  .devices li:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }
  .dname {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    font-weight: 550;
  }
  .danger {
    padding: 20px 22px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    border-color: rgba(255, 107, 107, 0.3);
  }
  .danger-btn {
    background: rgba(255, 107, 107, 0.14);
    border-color: rgba(255, 107, 107, 0.35);
    color: var(--danger);
  }
  .confirm {
    display: grid;
    gap: 10px;
    min-width: min(100%, 340px);
  }
  .row {
    display: flex;
    gap: 8px;
  }
</style>
