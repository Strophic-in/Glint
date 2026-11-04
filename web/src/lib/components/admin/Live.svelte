<script lang="ts">
  import { onMount } from 'svelte';
  import { api, errorMessage } from '$lib/api';
  import { toasts } from '$lib/toast.svelte';

  let live = $state<{ user_id: string; email: string; started_at: number }[]>([]);
  let error = $state('');
  let now = $state(Date.now());

  async function load() {
    try {
      live = (await api.admin.live()).live;
      error = '';
    } catch (e) {
      error = errorMessage(e);
    }
  }

  async function end(id: string, email: string) {
    try {
      await api.admin.endLive(id);
      toasts.ok(`Ended ${email}'s session.`);
      await load();
    } catch (e) {
      toasts.error(errorMessage(e));
    }
  }

  const dur = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  onMount(() => {
    load();
    const poll = setInterval(load, 10_000);
    const tick = setInterval(() => (now = Date.now()), 1000);
    return () => (clearInterval(poll), clearInterval(tick));
  });
</script>

{#if error}<p class="muted">{error}</p>{/if}
<div class="card">
  <div class="table-wrap">
    <table class="table">
      <thead><tr><th>User</th><th>Started</th><th>Duration</th><th></th></tr></thead>
      <tbody>
        {#each live as l (l.user_id)}
          <tr>
            <td><span class="badge badge-live"><span class="dot dot-pulse"></span></span> {l.email}</td>
            <td>{new Date(l.started_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</td>
            <td class="num">{dur(now - l.started_at)}</td>
            <td class="right"><button class="btn btn-sm" onclick={() => end(l.user_id, l.email)}>End session</button></td>
          </tr>
        {:else}
          <tr><td colspan="4" class="muted empty">Nobody is live right now.</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
<p class="muted note">Refreshes every 10 seconds. Ending a session stops billing immediately; the user can start again.</p>

<style>
  .num {
    font-variant-numeric: tabular-nums;
  }
  .right {
    text-align: right;
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
