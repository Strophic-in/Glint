<script lang="ts">
  import { onMount } from 'svelte';
  import { api, errorMessage, type AdminUserDetail } from '$lib/api';
  import { toasts } from '$lib/toast.svelte';
  import { formatBalance, formatCostINR, formatDate, formatDateTime, formatDuration, formatINR, formatUSD } from '$lib/format';

  let { id, onclose }: { id: string; onclose: () => void } = $props();

  let d = $state<AdminUserDetail | null>(null);
  let error = $state('');
  let busy = $state(false);
  let minutes = $state(60);
  let note = $state('');
  let reason = $state('');
  let confirmRemoveAll = $state(false);

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
  const removeAll = () =>
    act(async () => {
      await api.admin.removeAllTime(id, note.trim());
      confirmRemoveAll = false;
    }, 'Removed all remaining time.');
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

  const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));

  // What this user cost us vs what they paid (revenue incl. GST, before payment fees).
  const money = $derived.by(() => {
    if (!d) return null;
    const t = d.totals;
    const costMicros = t.stt_cost_micros + t.answer_cost_micros;
    const revenue = t.paid_paise / 100;
    const marginAmount = revenue - (costMicros / 1e6) * d.usd_inr;
    return { costMicros, revenue, marginAmount, marginPct: revenue > 0 ? Math.round((marginAmount / revenue) * 100) : null };
  });

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
        <button class="btn btn-sm danger" disabled={busy || d.user.balance_seconds <= 0} onclick={() => (confirmRemoveAll = true)}>
          Remove all time
        </button>
      </div>
      {#if confirmRemoveAll}
        <div class="confirm" role="alert">
          <p class="small">
            Remove all <b>{formatBalance(d.user.balance_seconds)}</b> from {d.user.email}? They won't be able to go live
            until they buy or are given more time.
          </p>
          <div class="row">
            <button class="btn btn-sm danger" disabled={busy} onclick={removeAll}>Yes, remove all</button>
            <button class="btn btn-sm btn-ghost" disabled={busy} onclick={() => (confirmRemoveAll = false)}>Cancel</button>
          </div>
        </div>
      {/if}
    </article>

    {#if money}
      <article class="card box">
        <span class="label">AI cost</span>
        <span class="big">{formatCostINR(money.costMicros, d.usd_inr)}</span>
        <span class="muted small">{formatUSD(money.costMicros)} at OpenAI list prices</span>
        <dl class="facts">
          <dt>Captions</dt>
          <dd>
            {formatCostINR(d.totals.stt_cost_micros, d.usd_inr)}
            <span class="muted">· {d.totals.sessions} sessions, {formatDuration(d.totals.live_seconds)} live, {Math.round(d.totals.audio_ms / 60000)} min audio</span>
          </dd>
          <dt>Answers</dt>
          <dd>
            {formatCostINR(d.totals.answer_cost_micros, d.usd_inr)}
            <span class="muted">· {d.totals.answers} answers, {tokens(d.totals.input_tokens)} in ({tokens(d.totals.cached_tokens)} cached) / {tokens(d.totals.output_tokens)} out</span>
          </dd>
          <dt>Paid</dt>
          <dd>{money.revenue ? formatINR(money.revenue) : '—'}</dd>
          <dt>Margin</dt>
          <dd class:neg={money.marginAmount < 0} class:pos={money.marginAmount > 0}>
            {formatINR(money.marginAmount)}{money.marginPct === null ? '' : ` (${money.marginPct}%)`}
          </dd>
        </dl>
      </article>
    {/if}

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
          <thead><tr><th>Started</th><th>Type</th><th>Charged</th><th>Model</th><th>Tokens in / out · audio</th><th>AI cost</th></tr></thead>
          <tbody>
            {#each d.usage as u}
              <tr>
                <td>{formatDateTime(u.started_at)}</td>
                <td>{u.kind === 'live' ? 'Live session' : 'Answer'}</td>
                <td>{u.seconds ? formatDuration(u.seconds) : 'Included'}</td>
                <td class="mono">{u.model ?? '—'}</td>
                <td>
                  {#if u.kind === 'live'}
                    {u.audio_ms != null ? `${(u.audio_ms / 60000).toFixed(1)} min audio` : '—'}
                  {:else}
                    {u.input_tokens ?? '—'}{u.cached_tokens ? ` (${u.cached_tokens} cached)` : ''} / {u.output_tokens ?? '—'}
                    {#if u.service_tier === 'priority' || u.service_tier === 'fast'}<span class="muted"> · fast</span>{/if}
                  {/if}
                </td>
                <td class="nowrap" title={u.cost_micros != null ? formatUSD(u.cost_micros) : ''}>
                  {u.cost_micros != null ? formatCostINR(u.cost_micros, d.usd_inr) : '—'}
                </td>
              </tr>
            {:else}
              <tr><td colspan="6" class="muted">No usage yet.</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h3>PCs used</h3>
      <p class="muted note">
        One free trial per PC: the first free account to use Glint on a PC holds its trial; other free accounts
        there must buy hours. Accounts with any purchase, coupon or grant are never limited.
      </p>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>PC</th><th>First used</th><th>Last used</th><th>Free trial</th><th>Other accounts on this PC</th></tr></thead>
          <tbody>
            {#each d.devices ?? [] as dv}
              <tr>
                <td class="mono">{dv.device}…</td>
                <td>{formatDateTime(dv.first_seen)}</td>
                <td>{formatDateTime(dv.last_seen)}</td>
                <td>
                  {#if !dv.trial_user_id}<span class="muted">Not claimed</span>
                  {:else if dv.trial_user_id === d.user.id}<span class="badge badge-ok">This account</span>
                  {:else}<span class="badge">Another account</span>{/if}
                </td>
                <td>
                  {#if dv.other_accounts.length}
                    {#each dv.other_accounts as o, i}{#if i > 0}, {/if}{o.email}{/each}
                  {:else}<span class="muted">None</span>{/if}
                </td>
              </tr>
            {:else}
              <tr><td colspan="5" class="muted">No PCs recorded yet (app 0.3.4 or later reports them).</td></tr>
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
  .confirm {
    display: grid;
    gap: 10px;
    padding: 12px 14px;
    border: 1px solid rgba(255, 107, 107, 0.35);
    border-radius: var(--radius-sm);
    background: rgba(255, 107, 107, 0.06);
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
  .pos {
    color: var(--ok);
  }
  .facts {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 12px;
    margin: 4px 0 0;
    font-size: 13.5px;
  }
  .facts dt {
    color: var(--muted);
  }
  .facts dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .nowrap {
    white-space: nowrap;
  }
  .ua {
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12.5px;
  }
</style>
