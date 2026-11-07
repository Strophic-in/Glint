<script lang="ts">
  import { onMount } from 'svelte';
  import { glint } from './lib/store.svelte';
  import { settings, persistSettings, SIZE } from './lib/settings.svelte';
  import { ipc, on, emit } from './lib/ipc';
  import { renderAnswer, type CodeBlock } from './lib/markdown';
  import Bar from './components/Bar.svelte';
  import Bubble from './components/Bubble.svelte';
  import SignIn from './components/SignIn.svelte';
  import Captions from './components/Captions.svelte';
  import Answer from './components/Answer.svelte';
  import Ask from './components/Ask.svelte';
  import Notice from './components/Notice.svelte';
  import Settings from './components/Settings.svelte';
  import Session from './components/Session.svelte';
  import Menu from './components/Menu.svelte';
  import ShortcutsOverlay from './components/ShortcutsOverlay.svelte';
  import Tips from './components/Tips.svelte';
  import Keys from './components/Keys.svelte';
  import UpdateBanner from './components/UpdateBanner.svelte';
  import { updates } from './lib/update.svelte';
  import { recorder } from './lib/recorder.svelte';

  let root: HTMLElement | undefined = $state();

  const ready = $derived(glint.phase === 'ready');
  const showCaptions = $derived(glint.listen !== 'off' || glint.turns.length > 0);
  const showTips = $derived(!settings.tipsSeen && !glint.answer && !showCaptions);
  const showAsk = $derived(glint.typing || !!glint.answer);
  const showPanel = $derived(showTips || showCaptions || glint.hint || !!glint.answer || showAsk);

  // Corner grip: live size while dragging, saved to settings when the button is released.
  let dragSize = $state<{ w: number; h: number } | null>(null);
  // Clamped: a width saved under an older, smaller minimum would cut off the bar's buttons.
  const width = $derived(dragSize?.w ?? Math.max(SIZE.minWidth, settings.width));
  const answerHeight = $derived(dragSize?.h ?? settings.answerHeight);

  // The code panel lives in its own window now (see CodeWindow.svelte), so splitting code out of
  // the answer only depends on whether that panel is enabled, not on whether it fits beside us.
  const splitCode = $derived(settings.codePanel && glint.view === 'main' && !glint.collapsed);

  // The answer is rendered once per frame while it streams, shared by the text and the code panel.
  let rendered = $state<{ html: string; blocks: CodeBlock[] }>({ html: '', blocks: [] });
  let raf = 0;
  $effect(() => {
    const text = glint.shown?.text ?? '';
    const split = splitCode;
    const side = settings.codeSide;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => (rendered = renderAnswer(text, split, side)));
  });
  const codeVisible = $derived(glint.visible && ready && splitCode && rendered.blocks.length > 0);

  // Broadcast the code panel window's content and visibility; it has no access to this window's
  // in-memory state, only to events (see CodeWindow.svelte).
  $effect(() => {
    emit('code-content', { blocks: rendered.blocks, streaming: glint.shown?.status === 'streaming' });
  });
  $effect(() => {
    emit('code-visible', codeVisible);
  });

  // Only what the code window renders with; the full settings (resume text included) would be
  // serialized across windows on every keystroke.
  const codeSettings = () => ({ opacity: settings.opacity, zoom: settings.zoom, protected: settings.protected });

  // Fit the native window to the content (bar or bubble) so transparent areas never block clicks.
  // The webview is zoomed, so CSS pixels × zoom = window pixels.
  function fit() {
    if (!root) return;
    const r = root.getBoundingClientRect();
    const z = settings.zoom;
    ipc.resize(Math.ceil(r.width * z), Math.ceil(r.height * z));
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
    glint.startSession = async () => {
      glint.view = 'main';
      await recorder.start();
      // Answers are only as specific as what Glint knows: nudge (once per session) when an
      // interview starts with no resume or company, the case where answers sound most generic.
      const noResume = !settings.docs.some((d) => d.kind === 'resume');
      if (recorder.active && settings.mode === 'interview' && (noResume || !settings.session.company.trim())) {
        glint.notify(
          { kind: 'info', message: noResume ? 'Add your resume so answers use your real projects and numbers.' : 'Add the company and role so answers fit this interview.', action: 'setup' },
          12000,
        );
      }
    };
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
    // The code window's own mount can finish after our first broadcast (separate webview, racing
    // startup); it asks for a fresh sync once it's actually listening instead of silently missing it.
    const stopCodeReady = on('code-window-ready', () => {
      emit('settings-sync', codeSettings());
      emit('code-content', { blocks: rendered.blocks, streaming: glint.shown?.status === 'streaming' });
      emit('code-visible', codeVisible);
    });
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
      stopCodeReady.then((f) => f());
      clearTimeout(blurTimer);
      window.removeEventListener('blur', onBlur);
    };
  });

  // Persist every settings change (deep-tracked via JSON), and hand the code panel window the
  // slice it needs to render itself (opacity, zoom, protection) — it has its own settings module
  // instance in its own webview, so it can't just read this one.
  $effect(() => {
    JSON.stringify(settings);
    persistSettings();
    emit('settings-sync', codeSettings());
  });

  // A see-through overlay turns solid while the mouse is over it (if enabled), so you can glance
  // past it during a call and still read it comfortably the moment you point at it.
  let hovering = $state(false);
  $effect(() => {
    // Not while the menu or Settings is open: that's where the slider is, and it needs a live preview.
    const solid = hovering && settings.solidOnHover && !glint.menuOpen && glint.view !== 'settings';
    document.documentElement.style.setProperty('--opacity', String(solid ? 1 : settings.opacity));
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
    if (glint.shortcutsOpen) glint.shortcutsOpen = false;
    else if (glint.menuOpen) glint.menuOpen = false;
    else if (glint.view === 'session') glint.view = 'main';
    else if (glint.view === 'main') {
      if (glint.typing) glint.stopTyping();
      else if (glint.answer) glint.dismissAnswer();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<main
  bind:this={root}
  class:collapsed={glint.collapsed}
  style:--answer-h={`${answerHeight}px`}
  onpointerenter={() => (hovering = true)}
  onpointerleave={() => (hovering = false)}
>
  {#if glint.collapsed}
    <Bubble />
  {:else}
    <div class="col" style:width={`${width}px`}>
      <Bar />
      {#if glint.menuOpen && ready}<Menu />{/if}
      {#if glint.shortcutsOpen}<ShortcutsOverlay />{/if}
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
            <button class="hint" onclick={() => glint.ask('answer', { question: glint.hint })}>
              <span class="hint-q">{glint.hint}</span>
              <span class="hint-cta">Answer <Keys accel={settings.bindings.answer} /></span>
            </button>
          {/if}
          <Answer html={rendered.html} onCodeRef={(i) => emit('code-reveal', i)} />
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
  .hint-q {
    flex: 1;
    min-width: 0;
    text-align: left;
    color: var(--question);
  }
  .hint-cta {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: none;
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
