<script lang="ts">
  // Ctrl+Shift+/ (Ctrl+?): a quick read-only list of every current keybinding. Rebinding happens in Settings.
  import { glint } from '../lib/store.svelte';
  import { settings } from '../lib/settings.svelte';
  import { SHORTCUTS } from '../lib/shortcuts';
  import Icon from './Icon.svelte';
  import Keys from './Keys.svelte';

  function openSettings() {
    glint.shortcutsOpen = false;
    glint.view = 'settings';
  }
</script>

<div class="wrap">
  <div class="shortcuts panel">
    <header>
      <span class="title">Shortcuts</span>
      <button class="close" onclick={() => (glint.shortcutsOpen = false)} aria-label="Close">
        <Icon name="x" size={13} />
      </button>
    </header>
    <ul class="scroll">
      {#each SHORTCUTS as s}
        <li>
          <span>{s.label}</span>
          <Keys accel={settings.bindings[s.key]} />
        </li>
      {/each}
    </ul>
    <button class="edit" onclick={openSettings}>Edit in Settings →</button>
  </div>
</div>

<style>
  .wrap {
    margin-top: 6px;
  }
  .shortcuts {
    padding: 10px 12px 12px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }
  .title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.7px;
    text-transform: uppercase;
    color: var(--accent);
  }
  .close {
    margin-left: auto;
    color: var(--muted);
    padding: 3px;
    border-radius: 6px;
  }
  .close:hover {
    color: var(--text);
    background: var(--raise-2);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 260px;
    display: grid;
    gap: 5px;
  }
  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 2px;
    font-size: 13px;
    border-bottom: 1px solid var(--border);
  }
  li:last-child {
    border-bottom: none;
  }
  li > span {
    color: var(--muted);
  }
  .edit {
    width: 100%;
    margin-top: 8px;
    padding: 6px 0;
    font-size: 12px;
    text-align: center;
    color: var(--accent);
  }
  .edit:hover {
    text-decoration: underline;
  }
</style>
