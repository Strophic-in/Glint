<script lang="ts">
  // Code from the current answer, shown to the left of the explanation.
  import type { CodeBlock } from '../lib/markdown';
  import Icon from './Icon.svelte';
  import Diagram from './Diagram.svelte';

  let { blocks, width, streaming = false }: { blocks: CodeBlock[]; width: number; streaming?: boolean } = $props();

  let list: HTMLDivElement | undefined = $state();
  const title = $derived(
    blocks.every((b) => b.diagram) ? 'Diagram' : blocks.some((b) => b.diagram) ? 'Code & diagrams' : 'Code',
  );
  let copied = $state(-2); // index of the block just copied; -1 = all
  let flash = $state(-1);

  function copy(i: number) {
    navigator.clipboard.writeText(i < 0 ? blocks.map((b) => b.code).join('\n\n') : blocks[i]!.code);
    copied = i;
    setTimeout(() => copied === i && (copied = -2), 1200);
  }

  /** Scroll to a block and flash it (from the marker in the explanation). */
  export function reveal(i: number) {
    const el = list?.querySelector<HTMLElement>(`[data-i="${i}"]`);
    if (!el || !list) return;
    list.scrollTo({ top: el.offsetTop - list.offsetTop - 4, behavior: 'smooth' });
    flash = i;
    setTimeout(() => flash === i && (flash = -1), 900);
  }
</script>

<aside class="code-panel panel" style:width={`${width}px`}>
  <header>
    <Icon name="code" size={14} />
    <span class="title">{title}</span>
    {#if blocks.length > 1}<span class="count">{blocks.length} blocks</span>{/if}
    <span class="grow"></span>
    <button class="copy-all" onclick={() => copy(-1)} title="Copy all code">
      <Icon name={copied === -1 ? 'check' : 'copy'} size={13} />
      {copied === -1 ? 'Copied' : blocks.length > 1 ? 'Copy all' : 'Copy'}
    </button>
  </header>
  <div class="list scroll" bind:this={list}>
    {#each blocks as b, i (i)}
      <div class="block" class:flash={flash === i} data-i={i}>
        {#if blocks.length > 1}
          <div class="bar">
            <span class="lang">{b.diagram ? 'diagram' : b.lang || 'code'}</span>
            {#if !b.diagram}<span class="lines">{b.lines} lines</span>{/if}
            <button onclick={() => copy(i)}>{copied === i ? 'Copied' : 'Copy'}</button>
          </div>
        {/if}
        {#if b.diagram}
          <Diagram source={b.code} complete={b.complete} />
        {:else}
          <pre><code class="hljs">{@html b.html}</code>{#if streaming && !b.complete}<span class="caret"></span>{/if}</pre>
        {/if}
      </div>
    {/each}
  </div>
  {#if blocks.length === 1 && !blocks[0]!.diagram}
    <footer><span class="lang">{blocks[0]!.lang || 'code'}</span> · {blocks[0]!.lines} lines</footer>
  {/if}
</aside>

<style>
  .code-panel {
    flex: none;
    display: flex;
    flex-direction: column;
    max-height: calc(var(--answer-h, 420px) + 130px);
    min-height: 0;
    overflow: hidden;
    margin-top: 2px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 9px 12px 8px;
    border-bottom: 1px solid var(--border);
    color: var(--accent);
  }
  .title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.7px;
    text-transform: uppercase;
  }
  .count {
    font-size: 11.5px;
    color: var(--faint);
  }
  .grow {
    flex: 1;
  }
  .copy-all {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    padding: 4px 9px;
    border-radius: 7px;
    background: var(--raise);
  }
  .copy-all:hover {
    background: var(--raise-2);
  }
  .list {
    flex: 1;
    min-height: 0;
    padding: 6px 0;
  }
  .block + .block {
    margin-top: 8px;
    border-top: 1px solid var(--border);
    padding-top: 6px;
  }
  .block {
    transition: background 0.3s;
  }
  .block.flash {
    background: var(--accent-soft);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 12px 4px;
    font-size: 11.5px;
  }
  .bar button {
    margin-left: auto;
    font-size: 11.5px;
    color: var(--muted);
    padding: 2px 8px;
    border-radius: 6px;
  }
  .bar button:hover {
    color: var(--text);
    background: var(--raise-2);
  }
  .lang {
    font-family: var(--mono);
    color: var(--muted);
  }
  .lines {
    color: var(--faint);
  }
  pre {
    margin: 0;
    padding: 4px 12px 6px;
    font-family: var(--mono);
    font-size: 12.5px;
    line-height: 1.55;
    white-space: pre;
    overflow-x: auto;
    user-select: text;
  }
  footer {
    padding: 6px 12px;
    border-top: 1px solid var(--border);
    font-size: 11.5px;
    color: var(--faint);
  }
  .caret {
    display: inline-block;
    width: 7px;
    height: 13px;
    margin-left: 2px;
    vertical-align: -2px;
    background: var(--accent);
    border-radius: 1px;
    animation: pulse 0.9s ease-in-out infinite;
  }
</style>
