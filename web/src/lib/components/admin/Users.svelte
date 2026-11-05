<script lang="ts">
  import { onMount } from 'svelte';
  import { api, errorMessage, type AdminUser, type AdminUserSort } from '$lib/api';
  import { formatBalance, formatCostINR, formatDate, formatDateTime, formatDuration, formatINR, formatUSD } from '$lib/format';
  import UserDetail from './UserDetail.svelte';

  let q = $state('');
  let filter = $state('all');
  let sort = $state<AdminUserSort>('recent');
  let usdInr = $state(88);
  let users = $state<AdminUser[]>([]);
  let total = $state(0);
  let loading = $state(true);
  let error = $state('');
  let selected = $state<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'paying', label: 'Paying' },
    { id: 'live', label: 'Live' },
    { id: 'blocked', label: 'Blocked' }
  ];

  const SORTS: { id: AdminUserSort; label: string }[] = [
    { id: 'recent', label: 'Newest first' },
    { id: 'cost', label: 'Highest AI cost' },
    { id: 'usage', label: 'Most time used' },
    { id: 'paid', label: 'Top payers' }
  ];

  async function load(more = false) {
    loading = true;
    error = '';
    try {
      const r = await api.admin.users(q.trim(), filter, more ? users.length : 0, sort);
      users = more ? [...users, ...r.users] : r.users;
      total = r.total;
      usdInr = r.usd_inr ?? usdInr;
    } catch (e) {
      error = errorMessage(e);
    } finally {
      loading = false;
    }
  }

  function search() {
    clearTimeout(timer);
    timer = setTimeout(() => load(), 250);
  }

  onMount(() => load());
</script>

{#if selected}
  <UserDetail id={selected} onclose={() => ((selected = null), load())} />
{:else}
  <div class="tools">
    <input class="input" type="search" placeholder="Search email or name…" bind:value={q} oninput={search} aria-label="Search users" />
    <div class="chips">
      {#each FILTERS as f}
        <button class="chip" class:on={filter === f.id} onclick={() => ((filter = f.id), load())}>{f.label}</button>
      {/each}
    </div>
    <select
      class="input sort"
      value={sort}
      onchange={(e) => ((sort = e.currentTarget.value as AdminUserSort), load())}
      aria-label="Sort users"
    >
      {#each SORTS as s}<option value={s.id}>{s.label}</option>{/each}
    </select>
  </div>

  {#if error}
    <p class="muted">{error} <button class="btn btn-sm" onclick={() => load()}>Retry</button></p>
  {:else}
    <div class="card">
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr><th>User</th><th>Joined</th><th>Balance</th><th>Paid</th><th>Used</th><th>AI cost</th><th>Status</th></tr>
          </thead>
          <tbody>
            {#each users as u (u.id)}
              <tr class="row" onclick={() => (selected = u.id)} tabindex="0" onkeydown={(e) => e.key === 'Enter' && (selected = u.id)}>
                <td>
                  <div class="who">
                    {#if u.picture}<img src={u.picture} alt="" referrerpolicy="no-referrer" />{:else}<span class="av">{(u.name || u.email)[0]?.toUpperCase()}</span>{/if}
                    <div>
                      <div class="email" title={u.email}>{u.email}</div>
                      {#if u.name}<div class="muted small">{u.name}</div>{/if}
                    </div>
                  </div>
                </td>
                <td class="nowrap">
                  {formatDate(u.created_at)}
                  <div class="muted small">seen {formatDateTime(u.last_seen_at)}</div>
                </td>
                <td class="num">{formatBalance(u.balance_seconds)}</td>
                <td class="num">{u.paid_paise ? formatINR(u.paid_paise / 100) : '—'}</td>
                <td class="num">
                  {u.used_seconds ? formatDuration(u.used_seconds) : '—'}
                  {#if u.answers}<div class="muted small">{u.answers} answers</div>{/if}
                </td>
                <td class="num" title={formatUSD(u.cost_micros)}>{u.cost_micros ? formatCostINR(u.cost_micros, usdInr) : '—'}</td>
                <td>
                  {#if u.blocked}<span class="badge bad">Blocked</span>{/if}
                  {#if u.live}<span class="badge badge-live"><span class="dot dot-pulse"></span> Live</span>{/if}
                  {#if !u.blocked && !u.live}<span class="badge">Active</span>{/if}
                </td>
              </tr>
            {:else}
              <tr><td colspan="7" class="muted empty">{loading ? 'Loading…' : 'No users match.'}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
    <p class="muted foot">
      Showing {users.length} of {total}
      {#if users.length < total && filter !== 'live'}
        <button class="btn btn-sm" onclick={() => load(true)} disabled={loading}>Load more</button>
      {/if}
    </p>
  {/if}
{/if}

<style>
  .tools {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: center;
    margin-bottom: 14px;
  }
  .tools .input {
    max-width: 360px;
    height: 40px;
  }
  .chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .sort {
    width: auto;
    height: 36px;
    padding: 0 12px;
    margin-left: auto;
  }
  @media (max-width: 640px) {
    .sort {
      margin-left: 0;
    }
  }
  .chip {
    height: 32px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .chip.on {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-ink);
  }
  .row {
    cursor: pointer;
  }
  .row:hover td {
    background: var(--surface-2);
  }
  .who {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 220px;
  }
  .who img,
  .av {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    flex: none;
  }
  .av {
    display: grid;
    place-items: center;
    background: var(--surface-3);
    font-weight: 700;
    font-size: 13px;
  }
  .who > div {
    min-width: 0;
  }
  .email {
    font-weight: 550;
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nowrap {
    white-space: nowrap;
  }
  .small {
    font-size: 12.5px;
  }
  .num {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .badge.bad {
    background: rgba(255, 107, 107, 0.12);
    border-color: rgba(255, 107, 107, 0.3);
    color: var(--danger);
  }
  .empty {
    text-align: center;
    padding: 28px;
  }
  .foot {
    margin-top: 12px;
    display: flex;
    gap: 12px;
    align-items: center;
    font-size: 14px;
  }
</style>
