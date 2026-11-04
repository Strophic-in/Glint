<script lang="ts">
  import { onMount } from 'svelte';
  import { glint } from '../lib/store.svelte';
  import { settings } from '../lib/settings.svelte';
  import Icon from './Icon.svelte';
  import Keys from './Keys.svelte';

  let value = $state('');
  let input: HTMLInputElement | undefined = $state();

  onMount(() => {
    glint.focusAsk = () => input?.focus();
  });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    glint.submitQuestion(value);
    value = '';
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      glint.stopTyping();
    }
  }
</script>

<form class="ask" class:active={glint.typing} onsubmit={submit}>
  <input
    bind:this={input}
    bind:value
    placeholder="Ask anything about the call or your screen…"
    onpointerdown={() => !glint.typing && glint.startTyping()}
    onkeydown={onKey}
    spellcheck="false"
    autocomplete="off"
  />
  {#if !glint.typing}<Keys accel={settings.bindings.type} />{/if}
  <button type="submit" disabled={!value.trim()} title="Ask (Enter)">
    <Icon name="send" size={15} />
  </button>
</form>

<style>
  .ask {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 8px 8px 14px;
    border-top: 1px solid var(--border);
  }
  input {
    flex: 1;
    background: transparent;
    border: 0;
    padding: 6px 0;
    outline: none;
  }
  input::placeholder {
    color: var(--faint);
  }
  button {
    width: 30px;
    height: 30px;
    border-radius: 9px;
    display: grid;
    place-items: center;
    background: var(--accent);
    color: var(--accent-ink);
  }
  button:disabled {
    background: var(--raise-2);
    color: var(--faint);
    cursor: default;
  }
</style>
