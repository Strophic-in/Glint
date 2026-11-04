<script lang="ts">
  import { glint } from '../lib/store.svelte';
  import Icon from './Icon.svelte';

  let el: HTMLDivElement | undefined = $state();
  const shown = $derived(glint.showTranscript ? glint.turns : glint.turns.slice(-2));

  $effect(() => {
    // Follow the newest line.
    void shown.length;
    void shown.at(-1)?.text;
    if (el) el.scrollTop = el.scrollHeight;
  });
</script>

<section class="captions">
  <div class="lines scroll" class:full={glint.showTranscript} bind:this={el}>
    {#each shown as t (t.id)}
      <p class={t.who}>
        <b>{t.who === 'them' ? 'Them' : 'You'}</b>
        <span class:partial={!t.final}>{t.text}</span>
      </p>
    {:else}
      <p class="empty">
        {glint.listen === 'live' ? 'Listening… live captions appear here.' : 'Start listening to see live captions.'}
      </p>
    {/each}
  </div>
  <div class="tools">
    <button
      class:on={glint.showTranscript}
      onclick={() => (glint.showTranscript = !glint.showTranscript)}
      title={glint.showTranscript ? 'Collapse transcript' : 'Full transcript'}
    >
      <Icon name="list" size={14} />
    </button>
    <button onclick={() => glint.clearTranscript()} title="Clear transcript (starts a fresh context)">
      <Icon name="trash" size={14} />
    </button>
  </div>
</section>

<style>
  .captions {
    display: flex;
    gap: 8px;
    padding: 10px 10px 10px 14px;
    border-bottom: 1px solid var(--border);
  }
  .lines {
    flex: 1;
    max-height: 50px;
    font-size: 13px;
    user-select: text;
  }
  .lines.full {
    max-height: 180px;
  }
  p {
    margin: 0 0 2px;
    color: var(--muted);
    line-height: 1.45;
  }
  p b {
    font-weight: 650;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    margin-right: 6px;
  }
  p.them b {
    color: var(--them);
  }
  p.them {
    color: var(--text);
  }
  p.you b {
    color: var(--faint);
  }
  .partial {
    opacity: 0.75;
  }
  .empty {
    color: var(--faint);
  }
  .tools {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .tools button {
    width: 24px;
    height: 22px;
    border-radius: 6px;
    display: grid;
    place-items: center;
    color: var(--faint);
  }
  .tools button:hover,
  .tools button.on {
    background: var(--raise-2);
    color: var(--text);
  }
</style>
