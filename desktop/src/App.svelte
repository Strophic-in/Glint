<script lang="ts">
  import { onMount } from 'svelte';
  import { glint } from './lib/store.svelte';
  import { settings, persistSettings, SIZE } from './lib/settings.svelte';
  import { ipc, on } from './lib/ipc';
  import { renderAnswer, type CodeBlock } from './lib/markdown';
  import Bar from './components/Bar.svelte';
  import Bubble from './components/Bubble.svelte';
  import SignIn from './components/SignIn.svelte';
  import Captions from './components/Captions.svelte';
  import Answer from './components/Answer.svelte';
  import CodePanel from './components/CodePanel.svelte';
  import Ask from './components/Ask.svelte';
  import Notice from './components/Notice.svelte';
  import Settings from './components/Settings.svelte';
  import Session from './components/Session.svelte';
  import Menu from './components/Menu.svelte';
  import Tips from './components/Tips.svelte';
  import Keys from './components/Keys.svelte';
  import UpdateBanner from './components/UpdateBanner.svelte';
  import { updates } from './lib/update.svelte';
  import { recorder } from './lib/recorder.svelte';

  const GAP = 8;
  let root: HTMLElement | undefined = $state();
  let col: HTMLElement | undefined = $state();
  let codePanel: CodePanel | undefined = $state();

  const ready = $derived(glint.phase === 'ready');
  const showCaptions = $derived(glint.listen !== 'off' || glint.turns.length > 0);
  const showTips = $derived(!settings.tipsSeen && !glint.answer && !showCaptions);
  const showAsk = $derived(glint.typing || !!glint.answer);
  const showPanel = $derived(showTips || showCaptions || glint.hint || !!glint.answer || showAsk);

  // Corner grip: live size while dragging, saved to settings when the button is released.
  let dragSize = $state<{ w: number; h: number } | null>(null);
  const width = $derived(dragSize?.w ?? settings.width);
  const answerHeight = $derived(dragSize?.h ?? settings.answerHeight);

  // The code panel sits to the left of the main column, sized from it, and only if it fits on the
  // screen (screen size is in device-independent px, so divide by the zoom). Otherwise code stays inline.
  const codeWidth = $derived.by(() => {
    const room = Math.floor(window.screen.availWidth / settings.zoom) - width - GAP - 24;
    return Math.min(Math.max(360, Math.round(width * 0.72)), width >= 960 ? 900 : 640, room);
  });
  const canSplit = $derived(settings.codePanel && codeWidth >= 300 && glint.view === 'main' && !glint.collapsed);

  // The answer is rendered once per frame while it streams, shared by the text and the code panel.
  let rendered = $state<{ html: string; blocks: CodeBlock[] }>({ html: '', blocks: [] });
  let raf = 0;
  $effect(() => {
    const text = glint.answer?.text ?? '';
    const split = canSplit;
    const side = settings.codeSide;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => (rendered = renderAnswer(text, split, side)));
  });
  const codeOpen = $derived(ready && canSplit && !!glint.answer && rendered.blocks.length > 0);

  // Fit the native window to the content (bar or bubble) so transparent areas never block clicks.
  // The webview is zoomed, so CSS pixels × zoom = window pixels.
  function fit() {
    if (!root) return;
    const r = root.getBoundingClientRect();
    const left = codeOpen && col && settings.codeSide === 'left' ? col.offsetLeft : 0;
    const z = settings.zoom;
    ipc.resize(Math.ceil(r.width * z), Math.ceil(r.height * z), left * z);
  }

  // Which edge is being dragged: the right edge changes the width, the bottom edge the answer
  // height, the corner both. The cursor stays a resize cursor until the button is released.
  let resizeMode = $state<'both' | 'x' | 'y'>('both');
  function startResize(e: PointerEvent, mode: 'both' | 'x' | 'y') {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    resizeMode = mode;
    document.documentElement.style.cursor = mode === 'x' ? 'ew-resize' : mode === 'y' ? 'ns-resize' : 'nwse-resize';
    dragSize = { w: settings.width, h: settings.answerHeight };
    ipc.resizeDrag();
  }

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

  onMount(() => {
    glint.init();
    updates.start();
    glint.onAnswerDone = (a) => recorder.record(a);
    glint.onTurnFinal = (t) => recorder.line(t);
    // Saved placement (monitor + spot), once the window has its real size.
    const placeTimer = setTimeout(() => ipc.placeWindow(settings.placeMonitor, settings.placeAnchor), 400);
    // Quitting from the menu or tray: save an open session (with a quick review) first.
    const stopQuit = on('quit-requested', async () => {
      try {
        if (recorder.active) await recorder.end(true);
      } finally {
        ipc.quitNow();
      }
    });
    const ro = new ResizeObserver(fit);
    if (root) ro.observe(root);
    // Rust follows the mouse during a corner drag and reports the offset from the press in physical
    // pixels; devicePixelRatio already includes both the display scale and the zoom. Settings keep
    // the size from before the drag until the button is released.
    const stop = on<{ dx: number; dy: number; done: boolean }>('resize-drag', ({ dx, dy, done }) => {
      if (!dragSize) return;
      const k = window.devicePixelRatio || 1;
      const next = {
        w: resizeMode === 'y' ? settings.width : clamp(settings.width + dx / k, SIZE.minWidth, SIZE.maxWidth),
        h: resizeMode === 'x' ? settings.answerHeight : clamp(settings.answerHeight + dy / k, SIZE.minAnswer, SIZE.maxAnswer),
      };
      if (done) {
        settings.width = next.w;
        settings.answerHeight = next.h;
        dragSize = null;
        document.documentElement.style.cursor = '';
      } else {
        dragSize = next;
      }
    });
    // Activation can blur/focus in quick succession; only leave typing mode if focus is really gone.
    let blurTimer: ReturnType<typeof setTimeout> | undefined;
    const onBlur = () => {
      clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        if (!document.hasFocus()) glint.stopTyping(false);
      }, 200);
    };
    window.addEventListener('blur', onBlur);
    return () => {
      ro.disconnect();
      clearTimeout(placeTimer);
      stop.then((f) => f());
      stopQuit.then((f) => f());
      clearTimeout(blurTimer);
      window.removeEventListener('blur', onBlur);
    };
  });

  // Persist every settings change (deep-tracked via JSON).
  $effect(() => {
    JSON.stringify(settings);
    persistSettings();
  });

  $effect(() => {
    document.documentElement.style.setProperty('--opacity', String(settings.opacity));
  });

  $effect(() => {
    ipc.setZoom(settings.zoom).then(fit);
  });

  $effect(() => {
    ipc.setProtected(settings.protected);
  });

  // While live, keep a recent frame of the screen so auto-answers can include it with no delay.
  $effect(() => {
    const live = glint.listen === 'live' || glint.listen === 'reconnecting';
    ipc.setScreenWatch(live && settings.autoAnswer && settings.screen && settings.screenAuto);
  });

  $effect(() => {
    const bindings = { ...settings.bindings };
    ipc.setBindings(bindings).then((errors) => {
      glint.shortcutErrors = errors;
    });
  });

  // Answer-scroll keys only exist while an answer is on screen.
  $effect(() => {
    ipc.setContextualKeys(glint.visible && !glint.collapsed && !!glint.answer && glint.view === 'main');
  });

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (glint.menuOpen) glint.menuOpen = false;
    else if (glint.view === 'session') glint.view = 'main';
    else if (glint.view === 'main') {
      if (glint.typing) glint.stopTyping();
      else if (glint.answer) glint.dismissAnswer();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<main bind:this={root} class:collapsed={glint.collapsed} style:--answer-h={`${answerHeight}px`}>
  {#if glint.collapsed}
    <Bubble />
  {:else}
    {#snippet code()}
      <CodePanel
        bind:this={codePanel}
        blocks={rendered.blocks}
        width={codeWidth}
        streaming={glint.answer?.status === 'streaming'}
      />
    {/snippet}
    {#if codeOpen && settings.codeSide === 'left'}{@render code()}{/if}
    <div class="col" bind:this={col} style:width={`${width}px`}>
      <Bar />
      {#if glint.menuOpen && ready}<Menu />{/if}
      {#if ready && glint.view === 'main' && updates.showBanner}<UpdateBanner />{/if}

      {#if !ready}
        <SignIn />
      {:else if glint.view === 'settings'}
        <Settings />
      {:else if glint.view === 'session'}
        <Session />
      {:else if showPanel}
        <div class="panel stack">
          {#if showTips}<Tips />{/if}
          {#if showCaptions}<Captions />{/if}
          {#if glint.hint && !glint.answer}
            <button class="hint" onclick={() => glint.ask('answer')}>
              Question detected. Answer it now <Keys accel={settings.bindings.answer} />
            </button>
          {/if}
          <Answer html={rendered.html} onCodeRef={(i) => codePanel?.reveal(i)} />
          {#if showAsk}<Ask />{/if}
        </div>
      {/if}

      <Notice />
      <!-- Resize: right edge (width), bottom edge (height), corner (both). -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="edge edge-r" class:active={!!dragSize && resizeMode === 'x'} onpointerdown={(e) => startResize(e, 'x')}></div>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="edge edge-b" class:active={!!dragSize && resizeMode === 'y'} onpointerdown={(e) => startResize(e, 'y')}></div>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="grip"
        class:active={!!dragSize && resizeMode === 'both'}
        onpointerdown={(e) => startResize(e, 'both')}
        ondblclick={() => {
          settings.width = 720;
          settings.answerHeight = 420;
        }}
        title="Drag to resize · double-click to reset"
      ></div>
    </div>
    {#if codeOpen && settings.codeSide === 'right'}{@render code()}{/if}
  {/if}
</main>

<style>
  main {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    width: max-content;
    padding: 2px 0 10px;
  }
  main.collapsed {
    display: inline-block;
    padding: 0;
  }
  .col {
    position: relative;
    flex: none;
    min-width: 0;
  }
  .stack {
    margin-top: 6px;
    overflow: hidden;
  }
  .hint {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 14px;
    color: var(--accent);
    font-weight: 600;
    font-size: 13px;
    background: var(--accent-soft);
    border-bottom: 1px solid var(--border);
  }
  /* Resize handles. The edges are invisible strips that light up on hover; the corner shows
     three diagonal strokes. They stay inside the window (main has 10px of bottom padding). */
  .edge {
    position: absolute;
    z-index: 5;
  }
  .edge::after {
    content: '';
    position: absolute;
    border-radius: 2px;
    background: var(--accent);
    opacity: 0;
    transition: opacity 0.15s;
  }
  .edge:hover::after,
  .edge.active::after {
    opacity: 0.7;
  }
  .edge-r {
    top: 52px;
    bottom: 12px;
    right: 0;
    width: 7px;
    cursor: ew-resize;
  }
  .edge-r::after {
    top: 0;
    bottom: 0;
    right: 1px;
    width: 3px;
  }
  .edge-b {
    left: 12px;
    right: 20px;
    bottom: -10px;
    height: 9px;
    cursor: ns-resize;
  }
  .edge-b::after {
    left: 0;
    right: 0;
    bottom: 3px;
    height: 3px;
  }
  .grip {
    position: absolute;
    z-index: 6;
    right: 0;
    bottom: -10px;
    width: 18px;
    height: 18px;
    cursor: nwse-resize;
    opacity: 0.55;
    background:
      linear-gradient(135deg, transparent 45%, var(--muted) 45%, var(--muted) 52%, transparent 52%),
      linear-gradient(135deg, transparent 65%, var(--muted) 65%, var(--muted) 72%, transparent 72%),
      linear-gradient(135deg, transparent 85%, var(--muted) 85%, var(--muted) 92%, transparent 92%);
  }
  .grip:hover,
  .grip.active {
    opacity: 1;
  }
</style>
