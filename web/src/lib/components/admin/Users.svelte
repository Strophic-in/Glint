<script lang="ts">
  import { onMount } from 'svelte';
  import { api, errorMessage, type AdminUser } from '$lib/api';
  import { formatBalance, formatDate, formatDateTime, formatINR } from '$lib/format';
  import UserDetail from './UserDetail.svelte';

  let q = $state('');
  let filter = $state('all');
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

  async function load(more = false) {
    loading = true;
    error = '';
    try {
      const r = await api.admin.users(q.trim(), filter, more ? users.length : 0);
      users = more ? [...users, ...r.users] : r.users;
      total = r.total;
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
  </div>

  {#if error}
    <p class="muted">{error} <button class="btn btn-sm" onclick={() => load()}>Retry</button></p>
  {:else}
    <div class="card">
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr><th>User</th><th>Joined</th><th>Last seen</th><th>Balance</th><th>Paid</th><th>Status</th></tr>
          </thead>
          <tbody>
            {#each users as u (u.id)}
              <tr class="row" onclick={() => (selected = u.id)} tabindex="0" onkeydown={(e) => e.key === 'Enter' && (selected = u.id)}>
                <td>
                  <div class="who">
                    {#if u.picture}<img src={u.picture} alt="" referrerpolicy="no-referrer" />{:else}<span class="av">{(u.name || u.email)[0]?.toUpperCase()}</span>{/if}
                    <div>
                      <div class="email">{u.email}</div>
                      {#if u.name}<div class="muted small">{u.name}</div>{/if}
                    </div>
                  </div>
                </td>
                <td>{formatDate(u.created_at)}</td>
                <td>{formatDateTime(u.last_seen_at)}</td>
                <td class="num">{formatBalance(u.balance_seconds)}</td>
                <td class="num">{u.paid_paise ? formatINR(u.paid_paise / 100) : '—'}</td>
                <td>
                  {#if u.blocked}<span class="badge bad">Blocked</span>{/if}
                  {#if u.live}<span class="badge badge-live"><span class="dot dot-pulse"></span> Live</span>{/if}
                  {#if !u.blocked && !u.live}<span class="badge">Active</span>{/if}
                </td>
              </tr>
            {:else}
              <tr><td colspan="6" class="muted empty">{loading ? 'Loading…' : 'No users match.'}</td></tr>
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
  .email {
    font-weight: 550;
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
