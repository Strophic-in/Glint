<script lang="ts">
  import { onMount } from 'svelte';
  import { ipc, type ModelOption } from '../lib/ipc';
  import { settings } from '../lib/settings.svelte';
  import Icon from './Icon.svelte';

  let models = $state<ModelOption[]>([]);
  let defaultId = $state('');
  let open = $state(false);

  const currentId = $derived(settings.model || defaultId);
  const current = $derived(models.find((m) => m.id === currentId));

  onMount(() => {
    ipc
      .models()
      .then((r) => {
        models = r.models;
        defaultId = r.default;
        // A previously picked model the server no longer offers falls back to the default.
        if (settings.model && !r.models.some((m) => m.id === settings.model)) settings.model = '';
      })
      .catch(() => {});
  });

  function pick(m: ModelOption) {
    settings.model = m.id === defaultId ? '' : m.id;
    open = false;
  }
</script>

<div class="picker">
  <button class="current" class:open onclick={() => (open = !open)} aria-expanded={open}>
    <span class="ai" aria-hidden="true"><Icon name="sparkle" size={13} /></span>
    <span class="name">{current?.label ?? 'Default model'}</span>
    <Icon name="chevron" size={14} />
  </button>
  {#if open}
    <ul class="list" role="listbox">
      {#each models as m}
        <li>
          <button class:on={m.id === currentId} onclick={() => pick(m)} role="option" aria-selected={m.id === currentId}>
            <span class="row">
              <span class="label">{m.label}</span>
              <span class="tag">{m.tag}</span>
              {#if m.id === currentId}<span class="tick"><Icon name="check" size={14} /></span>{/if}
            </span>
            <span class="hint">{m.hint}</span>
          </button>
        </li>
      {:else}
        <li class="empty">No models available. Check the server's OpenAI key.</li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .picker {
    display: grid;
    gap: 6px;
  }
  .current {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 10px;
    border-radius: 9px;
    background: var(--raise);
    border: 1px solid var(--border);
    text-align: left;
  }
  .current:hover,
  .current.open {
    border-color: var(--border-strong);
  }
  .ai {
    color: var(--accent);
    display: grid;
  }
  .name {
    flex: 1;
    font-weight: 550;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 4px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg-solid);
  }
  .list button {
    width: 100%;
    text-align: left;
    display: grid;
    gap: 1px;
    padding: 7px 9px;
    border-radius: 7px;
  }
  .list button:hover {
    background: var(--raise-2);
  }
  .list button.on {
    background: var(--accent-soft);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .label {
    font-weight: 600;
  }
  .tag {
    font-size: 10.5px;
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-soft);
    padding: 1px 7px;
    border-radius: 10px;
  }
  .tick {
    margin-left: auto;
    color: var(--accent);
    display: grid;
  }
  .hint {
    font-size: 12px;
    color: var(--muted);
  }
  .empty {
    padding: 8px;
    color: var(--muted);
    font-size: 12.5px;
  }
</style>
