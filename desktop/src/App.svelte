<script lang="ts">
  import { onMount } from 'svelte';
  import { glint } from './lib/store.svelte';
  import { settings, persistSettings } from './lib/settings.svelte';
  import { ipc } from './lib/ipc';
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
  import Tips from './components/Tips.svelte';
  import Keys from './components/Keys.svelte';

  const WIDTH = 720;
  let root: HTMLElement | undefined = $state();

  const ready = $derived(glint.phase === 'ready');
  const showCaptions = $derived(glint.listen !== 'off' || glint.turns.length > 0);
  const showTips = $derived(!settings.tipsSeen && !glint.answer && !showCaptions);
  const showAsk = $derived(glint.typing || !!glint.answer);
  const showPanel = $derived(showTips || showCaptions || glint.hint || !!glint.answer || showAsk);

  // Fit the native window to the content (bar or bubble) so transparent areas never block clicks.
  // The webview is zoomed, so CSS pixels × zoom = window pixels.
  function fit() {
    if (!root) return;
    const r = root.getBoundingClientRect();
    ipc.resize(Math.ceil(r.width * settings.zoom), Math.ceil(r.height * settings.zoom));
  }

  onMount(() => {
    glint.init();
    const ro = new ResizeObserver(fit);
    if (root) ro.observe(root);
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

<main bind:this={root} style:width={glint.collapsed ? 'auto' : `${WIDTH}px`} class:collapsed={glint.collapsed}>
  {#if glint.collapsed}
    <Bubble />
  {:else}
    <Bar />
    {#if glint.menuOpen && ready}<Menu />{/if}

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
        <Answer />
        {#if showAsk}<Ask />{/if}
      </div>
    {/if}

    <Notice />
  {/if}
</main>

<style>
  main {
    padding: 2px 0 10px;
  }
  main.collapsed {
    display: inline-block;
    padding: 0;
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
</style>
