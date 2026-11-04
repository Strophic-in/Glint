<script lang="ts">
  import { onMount } from 'svelte';
  import { api, errorMessage, type AdminUserDetail } from '$lib/api';
  import { toasts } from '$lib/toast.svelte';
  import { formatBalance, formatDate, formatDateTime, formatDuration, formatINR } from '$lib/format';

  let { id, onclose }: { id: string; onclose: () => void } = $props();

  let d = $state<AdminUserDetail | null>(null);
  let error = $state('');
  let busy = $state(false);
  let minutes = $state(60);
  let note = $state('');
  let reason = $state('');

  async function load() {
    error = '';
    try {
      d = await api.admin.user(id);
    } catch (e) {
      error = errorMessage(e);
    }
  }

  async function act(fn: () => Promise<unknown>, done: string) {
    busy = true;
    try {
      await fn();
      toasts.ok(done);
      await load();
    } catch (e) {
      toasts.error(errorMessage(e));
    } finally {
      busy = false;
    }
  }

  const changeTime = (sign: 1 | -1) =>
    act(
      () => api.admin.time(id, sign * Math.round(minutes * 60), note.trim()),
      `${sign > 0 ? 'Added' : 'Deducted'} ${minutes} min.`
    );
  const block = () => act(() => api.admin.block(id, reason.trim()), 'User blocked. Live session ended.');
  const unblock = () => act(() => api.admin.unblock(id), 'User unblocked.');
  const logout = () => act(() => api.admin.logout(id), 'Signed out on every device.');
  const endLive = () => act(() => api.admin.endLive(id), 'Live session ended.');

  const REASONS: Record<string, string> = {
    trial: 'Welcome trial',
    order: 'Purchase',
    admin: 'Added by admin',
    admin_deduct: 'Deducted by admin',
    expired: 'Expired'
  };

  onMount(load);
</script>

<button class="btn btn-sm btn-ghost back" onclick={onclose}>← All users</button>

{#if error}
  <p class="muted">{error} <button class="btn btn-sm" onclick={load}>Retry</button></p>
{:else if !d}
  <p class="muted">Loading…</p>
{:else}
  <div class="top">
    <div class="who">
      {#if d.user.picture}<img src={d.user.picture} alt="" referrerpolicy="no-referrer" />{/if}
      <div>
        <h2>{d.user.name || d.user.email}</h2>
        <p class="muted">{d.user.email} · joined {formatDate(d.user.created_at)} · last seen {formatDateTime(d.user.last_seen_at)}</p>
      </div>
    </div>
    <div class="badges">
      {#if d.user.blocked}<span class="badge bad">Blocked{d.user.blocked_reason ? `: ${d.user.blocked_reason}` : ''}</span>{/if}
      {#if d.live}<span class="badge badge-live"><span class="dot dot-pulse"></span> Live now</span>{/if}
      {#if d.user.admin}<span class="badge badge-accent">Admin</span>{/if}
    </div>
  </div>

  <div class="actions">
    <article class="card box">
      <span class="label">Balance</span>
      <span class="big">{formatBalance(d.user.balance_seconds)}</span>
      <span class="muted small">Valid till {formatDate(d.user.expires_at)}</span>
      <div class="row">
        <input class="input" type="number" min="1" max="60000" bind:value={minutes} aria-label="Minutes" />
        <span class="muted">min</span>
      </div>
      <input class="input" placeholder="Note (optional), e.g. refund, promo" bind:value={note} maxlength="200" />
      <div class="row">
        <button class="btn btn-sm btn-primary" disabled={busy || !minutes} onclick={() => changeTime(1)}>Add time</button>
        <button class="btn btn-sm" disabled={busy || !minutes} onclick={() => changeTime(-1)}>Deduct</button>
      </div>
    </article>

    <article class="card box">
      <span class="label">Access</span>
      {#if d.user.blocked}
        <p class="muted small">This user can't sign in, answer or go live.</p>
        <button class="btn btn-sm btn-primary" disabled={busy} onclick={unblock}>Unblock</button>
      {:else}
        <input class="input" placeholder="Reason shown to the user (optional)" bind:value={reason} maxlength="300" />
        <button class="btn btn-sm danger" disabled={busy || d.user.admin} onclick={block}>Block user</button>
      {/if}
      <div class="row">
        <button class="btn btn-sm" disabled={busy} onclick={logout}>Sign out everywhere</button>
        {#if d.live}<button class="btn btn-sm" disabled={busy} onclick={endLive}>End live session</button>{/if}
      </div>
    </article>
  </div>

  <div class="tables">
    <section class="card">
      <h3>Orders</h3>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Date</th><th>Plan</th><th>Amount</th><th>Status</th><th>Payment</th></tr></thead>
          <tbody>
            {#each d.orders as o}
              <tr>
                <td>{formatDateTime(o.created_at)}</td>
                <td>{o.plan_id} · {formatDuration(o.seconds)}</td>
                <td>{formatINR(o.amount_paise / 100)}</td>
                <td><span class="badge" class:badge-ok={o.status === 'paid'}>{o.status}</span></td>
                <td class="mono">{o.payment_id ?? '—'}</td>
              </tr>
            {:else}
              <tr><td colspan="5" class="muted">No orders.</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h3>Time history</h3>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Date</th><th>Change</th><th>Reason</th><th>Note</th></tr></thead>
          <tbody>
            {#each d.credits as c}
              <tr>
                <td>{formatDateTime(c.created_at)}</td>
                <td class:neg={c.seconds < 0}>{c.seconds < 0 ? '−' : '+'}{formatDuration(Math.abs(c.seconds))}</td>
                <td>{REASONS[c.reason] ?? c.reason}</td>
                <td class="muted">{c.note ?? ''}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h3>Usage</h3>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Started</th><th>Type</th><th>Charged</th><th>Model</th><th>Tokens in / out</th></tr></thead>
          <tbody>
            {#each d.usage as u}
              <tr>
                <td>{formatDateTime(u.started_at)}</td>
                <td>{u.kind === 'live' ? 'Live session' : 'Answer'}</td>
                <td>{u.seconds ? formatDuration(u.seconds) : 'Included'}</td>
                <td class="mono">{u.model ?? '—'}</td>
                <td>{u.input_tokens ?? '—'} / {u.output_tokens ?? '—'}</td>
              </tr>
            {:else}
              <tr><td colspan="5" class="muted">No usage yet.</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h3>Signed-in devices</h3>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Type</th><th>Signed in</th><th>Last used</th><th>Client</th></tr></thead>
          <tbody>
            {#each d.sessions as s}
              <tr>
                <td>{s.kind === 'desktop' ? 'Desktop app' : 'Web'}</td>
                <td>{formatDateTime(s.created_at)}</td>
                <td>{formatDateTime(s.last_used_at)}</td>
                <td class="muted ua">{s.user_agent ?? '—'}</td>
              </tr>
            {:else}
              <tr><td colspan="4" class="muted">Not signed in anywhere.</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  </div>
{/if}

<style>
  .back {
    margin-bottom: 14px;
  }
  .top {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 18px;
  }
  .who {
    display: flex;
    gap: 14px;
    align-items: center;
    min-width: 0;
  }
  .who img {
    width: 48px;
    height: 48px;
    border-radius: 50%;
  }
  h2 {
    font-size: 22px;
  }
  .who p {
    margin: 2px 0 0;
    font-size: 14px;
  }
  .badges {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }
  .badge.bad {
    background: rgba(255, 107, 107, 0.12);
    border-color: rgba(255, 107, 107, 0.3);
    color: var(--danger);
  }
  .actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .box {
    padding: 20px 22px;
    display: grid;
    gap: 10px;
    align-content: start;
  }
  .box .input {
    height: 40px;
  }
  .label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .big {
    font-size: 28px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .small {
    font-size: 13px;
    margin: 0;
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .row .input {
    max-width: 120px;
  }
  .danger {
    background: rgba(255, 107, 107, 0.14);
    border-color: rgba(255, 107, 107, 0.35);
    color: var(--danger);
  }
  .tables {
    display: grid;
    gap: 14px;
  }
  .tables section {
    padding: 18px 20px;
    min-width: 0;
  }
  h3 {
    font-size: 16px;
    margin-bottom: 10px;
  }
  .mono {
    font-family: var(--mono);
    font-size: 12.5px;
  }
  .neg {
    color: var(--danger);
  }
  .ua {
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12.5px;
  }
</style>
