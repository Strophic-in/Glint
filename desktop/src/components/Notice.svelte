<script lang="ts">
  import { glint } from '../lib/store.svelte';
  import { ipc } from '../lib/ipc';
  import Icon from './Icon.svelte';
</script>

{#if glint.notice}
  <div class="notice panel {glint.notice.kind}" role="status">
    <span class="msg">{glint.notice.message}</span>
    {#if glint.notice.action === 'buy'}
      <button class="cta" onclick={() => glint.buy()}>Add hours</button>
    {:else if glint.notice.action === 'setup'}
      <button class="cta" onclick={() => { glint.notice = null; glint.expand(); glint.view = 'session'; }}>Set up</button>
    {:else if glint.notice.action === 'settings'}
      <button class="cta" onclick={() => { glint.notice = null; glint.expand(); glint.view = 'settings'; }}>Open settings</button>
    {:else if glint.notice.action === 'session'}
      <button class="cta" onclick={() => { glint.notice = null; glint.startSession?.(); }}>Start session</button>
    {:else if glint.notice.action === 'reveal' && glint.notice.path}
      <button class="cta" onclick={() => ipc.revealPath(glint.notice!.path!)}>Show file</button>
    {/if}
    <button class="x" onclick={() => (glint.notice = null)} title="Dismiss"><Icon name="x" size={13} /></button>
  </div>
{/if}

<style>
  .notice {
    margin-top: 6px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 8px 8px 14px;
    font-size: 12.5px;
    border-radius: 12px;
  }
  .msg {
    flex: 1;
  }
  .warn .msg {
    color: #ffd9a0;
  }
  .error .msg {
    color: #ff9ea1;
  }
  .balance {
    border-color: rgba(245, 184, 61, 0.35);
  }
  .cta {
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 650;
    font-size: 12px;
    padding: 5px 12px;
    border-radius: 8px;
  }
  .x {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    color: var(--faint);
  }
  .x:hover {
    background: var(--raise-2);
    color: var(--text);
  }
</style>
