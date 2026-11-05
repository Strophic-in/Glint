<script lang="ts">
  import { glint } from '../lib/store.svelte';
  import { updates } from '../lib/update.svelte';
  import { ipc } from '../lib/ipc';
  import Icon from './Icon.svelte';

  // A live session is closed first so its last seconds are billed and the mic is released.
  async function stopLive() {
    if (glint.listen !== 'off' && glint.listen !== 'error') {
      await ipc.listenStop();
      await new Promise((r) => setTimeout(r, 600));
    }
  }
</script>

<div class="update panel" role="status">
  <Icon name="sparkle" size={14} />
  {#if updates.status === 'downloading'}
    <span class="text">Downloading Glint {updates.version}… {Math.round(updates.progress * 100)}%</span>
    <span class="bar"><i style:width={`${Math.round(updates.progress * 100)}%`}></i></span>
  {:else if updates.status === 'installing'}
    <span class="text">Installing Glint {updates.version}. Glint will reopen in a moment.</span>
  {:else if updates.status === 'error'}
    <span class="text err">{updates.error}</span>
    <button class="primary" onclick={() => updates.install(stopLive)}>Retry</button>
  {:else}
    <span class="text"><b>Glint {updates.version}</b> is available.{glint.listen === 'live' ? ' Updating stops listening.' : ''}</span>
    <button class="ghost" onclick={() => (updates.dismissed = true)}>Later</button>
    <button class="primary" onclick={() => updates.install(stopLive)}>Update now</button>
  {/if}
</div>

<style>
  .update {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-top: 6px;
    padding: 8px 10px 8px 12px;
    font-size: 12.5px;
    color: var(--accent);
  }
  .text {
    flex: 1;
    min-width: 0;
    color: var(--muted);
  }
  .text b {
    color: var(--text);
    font-weight: 650;
  }
  .text.err {
    color: #ff8f93;
  }
  .bar {
    width: 120px;
    height: 5px;
    border-radius: 3px;
    background: var(--raise-2);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.2s;
  }
  button {
    font-size: 12px;
    font-weight: 600;
    padding: 4px 11px;
    border-radius: 7px;
    white-space: nowrap;
  }
  .primary {
    color: var(--accent-ink);
    background: var(--accent);
  }
  .ghost {
    color: var(--muted);
  }
  .ghost:hover {
    color: var(--text);
    background: var(--raise-2);
  }
</style>
