<script lang="ts">
  import { onMount } from 'svelte';
  import { api, errorMessage, type AdminOrder } from '$lib/api';
  import { formatDateTime, formatDuration, formatINR } from '$lib/format';

  let orders = $state<AdminOrder[] | null>(null);
  let error = $state('');

  onMount(async () => {
    try {
      orders = (await api.admin.orders()).orders;
    } catch (e) {
      error = errorMessage(e);
    }
  });
</script>

{#if error}
  <p class="muted">{error}</p>
{:else if !orders}
  <p class="muted">Loading…</p>
{:else}
  <div class="card">
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Created</th><th>User</th><th>Plan</th><th>Amount</th><th>Status</th><th>Order / payment</th></tr></thead>
        <tbody>
          {#each orders as o (o.id)}
            <tr>
              <td>{formatDateTime(o.created_at)}</td>
              <td>{o.email}</td>
              <td>{o.plan_id} · {formatDuration(o.seconds)}</td>
              <td class="num">{formatINR(o.amount_paise / 100)}</td>
              <td><span class="badge" class:badge-ok={o.status === 'paid'}>{o.status === 'paid' ? 'Paid' : 'Not paid'}</span></td>
              <td class="mono">{o.id}<br />{o.payment_id ?? ''}</td>
            </tr>
          {:else}
            <tr><td colspan="6" class="muted empty">No orders yet.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
  <p class="muted note">"Not paid" = checkout opened but payment wasn't completed.</p>
{/if}

<style>
  .num {
    font-variant-numeric: tabular-nums;
  }
  .mono {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--muted);
  }
  .empty {
    text-align: center;
    padding: 28px;
  }
  .note {
    font-size: 13.5px;
    margin-top: 10px;
  }
</style>
