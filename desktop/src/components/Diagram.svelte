<script lang="ts">
  // One diagram in the code panel. While its block is still streaming it shows the source;
  // once the block is complete it is drawn (and can be flipped back to the source).
  import { renderDiagram } from '../lib/diagram';

  let { source, complete }: { source: string; complete: boolean } = $props();

  let svg = $state('');
  let box: HTMLDivElement | undefined = $state();

  // Fit the panel width, but never shrink below 70% of natural size (labels stay readable);
  // anything wider scrolls sideways.
  $effect(() => {
    void svg;
    const el = box?.querySelector('svg');
    if (!el || !box) return;
    const natural = el.viewBox?.baseVal?.width || el.getBoundingClientRect().width;
    if (!natural) return;
    el.style.maxWidth = 'none';
    el.style.height = 'auto';
    el.style.width = `${Math.round(Math.max(natural * 0.7, Math.min(natural, box.clientWidth)))}px`;
  });
  let failed = $state(false);
  let showSource = $state(false);

  $effect(() => {
    svg = '';
    failed = false;
    if (!complete) return;
    let current = true;
    renderDiagram(source).then(
      (s) => current && (svg = s),
      () => current && (failed = true),
    );
    return () => {
      current = false;
    };
  });
</script>

<div class="diagram">
  {#if svg && !showSource}
    <div class="svg" bind:this={box}>{@html svg}</div>
  {:else}
    <pre>{source}</pre>
    {#if !complete}
      <p class="note">Drawing the diagram when it's complete…</p>
    {:else if failed}
      <p class="note">Couldn't draw this diagram, so here is its source.</p>
    {/if}
  {/if}
  {#if svg}
    <button class="flip" onclick={() => (showSource = !showSource)}>{showSource ? 'Show diagram' : 'Show source'}</button>
  {/if}
</div>

<style>
  .diagram {
    position: relative;
    padding: 6px 12px 8px;
  }
  .svg {
    display: flex;
    overflow-x: auto;
  }
  .svg :global(svg) {
    flex: none;
    margin: 0 auto;
    height: auto;
  }
  pre {
    margin: 0;
    font-family: var(--mono);
    font-size: 12.5px;
    line-height: 1.55;
    white-space: pre;
    overflow-x: auto;
    user-select: text;
    color: var(--muted);
  }
  .note {
    margin: 6px 0 0;
    font-size: 11.5px;
    color: var(--faint);
  }
  .flip {
    margin-top: 6px;
    font-size: 11.5px;
    color: var(--muted);
    padding: 2px 8px;
    border-radius: 6px;
  }
  .flip:hover {
    color: var(--text);
    background: var(--raise-2);
  }
</style>
