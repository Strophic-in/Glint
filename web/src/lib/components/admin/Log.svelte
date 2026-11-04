<script lang="ts">
  import { onMount } from 'svelte';
  import { api, errorMessage, type AdminLogRow } from '$lib/api';
  import { formatDateTime } from '$lib/format';

  let log = $state<AdminLogRow[] | null>(null);
  let error = $state('');

  const LABELS: Record<string, string> = {
    block: 'Blocked user',
    unblock: 'Unblocked user',
    add_time: 'Added time',
    deduct_time: 'Deducted time',
    force_logout: 'Signed user out',
    end_live: 'Ended live session',
    config: 'Changed controls'
  };

  function detail(raw: string | null) {
    if (!raw) return '';
    try {
      const d = JSON.parse(raw);
      return Object.entries(d)
        .filter(([, v]) => v !== null && v !== '')
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
        .join(' · ');
    } catch {
      return raw;
    }
  }

  onMount(async () => {
    try {
      log = (await api.admin.log()).log;
    } catch (e) {
      error = errorMessage(e);
    }
  });
</script>

{#if error}
  <p class="muted">{error}</p>
{:else if !log}
  <p class="muted">Loading…</p>
{:else}
  <div class="card">
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
        <tbody>
          {#each log as l}
            <tr>
              <td>{formatDateTime(l.created_at)}</td>
              <td>{l.admin ?? '—'}</td>
              <td>{LABELS[l.action] ?? l.action}</td>
              <td>{l.target ?? ''}</td>
              <td class="muted small">{detail(l.detail)}</td>
            </tr>
          {:else}
            <tr><td colspan="5" class="muted empty">No admin actions yet.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{/if}

<style>
  .small {
    font-size: 13px;
  }
  .empty {
    text-align: center;
    padding: 28px;
  }
</style>
