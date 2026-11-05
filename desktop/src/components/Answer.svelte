<script lang="ts">
  import { onMount } from 'svelte';
  import { glint, type Action } from '../lib/store.svelte';
  import Icon from './Icon.svelte';

  // The answer is rendered once in App (shared with the code panel); `onCodeRef` jumps to a block there.
  let { html, onCodeRef }: { html: string; onCodeRef?: (i: number) => void } = $props();

  let body: HTMLDivElement | undefined = $state();
  let copied = $state(false);

  const a = $derived(glint.answer);

  onMount(() => {
    glint.scrollBy = (dy) => body?.scrollBy({ top: dy, behavior: 'smooth' });
  });

  // New answer → back to the top (the first line is the answer).
  $effect(() => {
    void a?.id;
    if (body) body.scrollTop = 0;
  });

  function onBodyClick(e: MouseEvent) {
    const ref = (e.target as HTMLElement).closest<HTMLElement>('.code-ref');
    if (ref) return onCodeRef?.(Number(ref.dataset.ref));
    const btn = (e.target as HTMLElement).closest('.copy-code') as HTMLButtonElement | null;
    if (!btn) return;
    const code = btn.closest('.code')?.querySelector('pre')?.textContent ?? '';
    navigator.clipboard.writeText(code);
    btn.textContent = 'Copied';
    setTimeout(() => (btn.textContent = 'Copy'), 1200);
  }

  function copyAll() {
    if (!a) return;
    navigator.clipboard.writeText(a.text);
    copied = true;
    setTimeout(() => (copied = false), 1200);
  }

  const chips: { action: Action; label: string }[] = [
    { action: 'shorter', label: 'Shorter' },
    { action: 'expand', label: 'More detail' },
    { action: 'followups', label: 'Follow-up questions' },
    { action: 'recap', label: 'Recap' },
  ];
</script>

{#if a}
  <section class="answer">
    <header>
      <span class="label">{a.label}{a.auto ? ' · auto' : ''}</span>
      {#if a.question}<span class="q" title={a.question}>“{a.question}”</span>{/if}
      <span class="grow"></span>
      {#if a.firstMs}<span class="meta" title="Time to first word">{(a.firstMs / 1000).toFixed(1)}s</span>{/if}
      <button onclick={copyAll} title="Copy answer" disabled={!a.text}>
        <Icon name={copied ? 'check' : 'copy'} size={14} />
      </button>
      <button onclick={() => glint.dismissAnswer()} title="Dismiss">
        <Icon name="x" size={14} />
      </button>
    </header>

    {#if a.status === 'thinking'}
      <div class="thinking" aria-label="Thinking">
        <i style:width="88%"></i>
        <i style:width="64%"></i>
      </div>
    {/if}

    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="md scroll body" bind:this={body} onclick={onBodyClick}>
      {@html html}{#if a.status === 'streaming'}<span class="caret"></span>{/if}
    </div>

    {#if a.status === 'error'}
      <p class="err">
        {a.error}
        <button onclick={() => glint.ask(a.action, { question: a.question })}>Retry</button>
      </p>
    {/if}

    {#if a.status === 'done'}
      <footer>
        {#each chips as c}
          <button class="chip" onclick={() => glint.ask(c.action)}>{c.label}</button>
        {/each}
      </footer>
    {/if}
  </section>
{/if}

<style>
  .answer {
    padding: 10px 14px 12px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 24px;
    margin-bottom: 6px;
  }
  .label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.7px;
    text-transform: uppercase;
    color: var(--accent);
    white-space: nowrap;
  }
  .q {
    color: var(--muted);
    font-size: 12.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .grow {
    flex: 1;
  }
  .meta {
    font-size: 11px;
    color: var(--faint);
    font-variant-numeric: tabular-nums;
  }
  header button {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    display: grid;
    place-items: center;
    color: var(--faint);
  }
  header button:hover:not(:disabled) {
    background: var(--raise-2);
    color: var(--text);
  }
  .body {
    max-height: var(--answer-h, 420px);
    padding-right: 4px;
  }
  .caret {
    display: inline-block;
    width: 7px;
    height: 14px;
    margin-left: 2px;
    vertical-align: -2px;
    background: var(--accent);
    border-radius: 1px;
    animation: pulse 0.9s ease-in-out infinite;
  }
  .thinking {
    display: grid;
    gap: 8px;
    padding: 4px 0 6px;
  }
  .thinking i {
    height: 10px;
    border-radius: 5px;
    background: linear-gradient(90deg, var(--raise) 0%, var(--accent-soft) 50%, var(--raise) 100%);
    background-size: 200% 100%;
    animation: shimmer 1.2s linear infinite;
  }
  .err {
    margin: 4px 0 0;
    color: #ff8f93;
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .err button {
    color: var(--text);
    background: var(--raise-2);
    border-radius: 7px;
    padding: 3px 10px;
    font-size: 12px;
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
  }
  .chip {
    font-size: 12px;
    font-weight: 550;
    padding: 4px 11px;
    border-radius: 14px;
    border: 1px solid var(--border);
    color: var(--muted);
  }
  .chip:hover {
    border-color: var(--border-strong);
    color: var(--text);
    background: var(--raise);
  }
</style>
