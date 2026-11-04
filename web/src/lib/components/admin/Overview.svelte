<script lang="ts">
  import { onMount } from 'svelte';
  import { api, errorMessage, type AdminStats } from '$lib/api';
  import { formatINR } from '$lib/format';

  let stats = $state<AdminStats | null>(null);
  let error = $state('');

  const hours = (s: number) => `${(s / 3600).toFixed(s < 36000 ? 1 : 0)} h`;
  const num = (n: number) => n.toLocaleString('en-IN');

  async function load() {
    error = '';
    try {
      stats = await api.admin.stats();
    } catch (e) {
      error = errorMessage(e);
    }
  }

  onMount(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  });
</script>

{#if error}
  <p class="muted">{error} <button class="btn btn-sm" onclick={load}>Retry</button></p>
{:else if !stats}
  <p class="muted">Loading…</p>
{:else}
  <div class="grid">
    <article class="card stat">
      <span class="label">Users</span>
      <span class="big">{num(stats.users_total)}</span>
      <span class="muted sub">+{stats.users_24h} today · +{stats.users_7d} this week</span>
    </article>
    <article class="card stat">
      <span class="label">Revenue (30 days)</span>
      <span class="big">{formatINR(stats.revenue_30d_paise / 100)}</span>
      <span class="muted sub">{stats.orders_30d} orders · {formatINR(stats.revenue_total_paise / 100)} all time</span>
    </article>
    <article class="card stat">
      <span class="label">Live now</span>
      <span class="big">{stats.live_now}</span>
      <span class="muted sub">{hours(stats.live_seconds_24h)} today · {hours(stats.live_seconds_7d)} this week</span>
    </article>
    <article class="card stat">
      <span class="label">Paying users</span>
      <span class="big">{num(stats.paying_users)}</span>
      <span class="muted sub">
        {stats.users_total ? Math.round((stats.paying_users / stats.users_total) * 100) : 0}% conversion · {stats.active_7d} active this week
      </span>
    </article>
    <article class="card stat">
      <span class="label">Answers today</span>
      <span class="big">{num(stats.answers_24h)}</span>
      <span class="muted sub">
        {(stats.input_tokens_7d / 1e6).toFixed(2)}M in / {(stats.output_tokens_7d / 1e6).toFixed(2)}M out tokens (7 days)
      </span>
    </article>
    <article class="card stat">
      <span class="label">Unused balance</span>
      <span class="big">{hours(stats.balance_outstanding_seconds)}</span>
      <span class="muted sub">{stats.blocked_users} blocked users</span>
    </article>
  </div>

  <div class="card daily">
    <h2>Last 14 days</h2>
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr><th>Day</th><th>Sign-ups</th><th>Revenue</th><th>Live time</th><th>Answers</th></tr>
        </thead>
        <tbody>
          {#each stats.daily as d}
            <tr>
              <td>{new Date(d.day).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
              <td>{d.signups}</td>
              <td>{d.revenue_paise ? formatINR(d.revenue_paise / 100) : '—'}</td>
              <td>{d.live_seconds ? hours(d.live_seconds) : '—'}</td>
              <td>{d.answers || '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{/if}

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .stat {
    padding: 20px 22px;
    display: grid;
    gap: 4px;
  }
  .label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .big {
    font-size: 30px;
    font-weight: 700;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .sub {
    font-size: 13px;
  }
  .daily {
    padding: 20px 22px;
  }
  h2 {
    font-size: 17px;
    margin-bottom: 12px;
  }
  td {
    font-variant-numeric: tabular-nums;
  }
</style>
