<script lang="ts">
  import { onMount } from 'svelte';
  import { glint, type Action } from '../lib/store.svelte';
  import Icon from './Icon.svelte';

  // The answer is rendered once in App (shared with the code panel); `onCodeRef` jumps to a block there.
  let { html, onCodeRef }: { html: string; onCodeRef?: (i: number) => void } = $props();

  let body: HTMLDivElement | undefined = $state();
  let copied = $state(false);

  const a = $derived(glint.shown);
  const total = $derived(glint.history.length);

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
      {#if total > 1}
        <span class="nav" aria-label="Earlier answers">
          <button onclick={() => glint.showAnswer(-1)} disabled={glint.shownIdx <= 0} title="Previous answer" aria-label="Previous answer">
            <Icon name="chevron-left" size={13} />
          </button>
          <span class="pos">{glint.shownIdx + 1}/{total}</span>
          <button onclick={() => glint.showAnswer(1)} disabled={glint.viewIdx === null} title="Next answer" aria-label="Next answer">
            <Icon name="chevron-right" size={13} />
          </button>
        </span>
      {/if}
      <span class="label">{a.label}{a.auto ? ' · auto' : ''}</span>
      <span class="grow"></span>
      {#if a.firstMs}<span class="meta" title="Time to first word">{(a.firstMs / 1000).toFixed(1)}s</span>{/if}
      <button onclick={copyAll} title="Copy answer" disabled={!a.text}>
        <Icon name={copied ? 'check' : 'copy'} size={14} />
      </button>
      <button onclick={() => glint.dismissAnswer()} title="Dismiss">
        <Icon name="x" size={14} />
      </button>
    </header>

    {#if a.question}
      <p class="asked" title={a.question}><span class="qmark" aria-hidden="true">Q</span>{a.question}</p>
    {/if}

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
  .nav {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-right: 2px;
    color: var(--muted);
  }
  .nav button {
    width: 22px;
    height: 22px;
  }
  .nav button:disabled {
    opacity: 0.35;
  }
  .pos {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    min-width: 28px;
    text-align: center;
  }
  .label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.7px;
    text-transform: uppercase;
    color: var(--accent);
    white-space: nowrap;
  }
  .asked {
    margin: 0 0 8px;
    padding: 7px 10px;
    border-radius: 8px;
    background: var(--question-bg);
    color: var(--question);
    font-weight: 600;
    font-size: 13.5px;
    line-height: 1.4;
    user-select: text;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .qmark {
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.5px;
    opacity: 0.75;
    margin-right: 8px;
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
