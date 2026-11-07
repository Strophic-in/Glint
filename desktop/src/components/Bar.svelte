<script lang="ts">
  import { glint, sessionLabel } from '../lib/store.svelte';
  import { settings, MODES } from '../lib/settings.svelte';
  import { keyParts } from '../lib/keys';
  import { ipc } from '../lib/ipc';
  import { formatLeft } from '../lib/time';
  import Icon from './Icon.svelte';
  import Keys from './Keys.svelte';
  import Spark from './Spark.svelte';
  import { recorder } from '../lib/recorder.svelte';

  // The session's End button asks once more; the question goes away by itself after a few seconds.
  let confirmEnd = $state(false);
  let confirmTimer: ReturnType<typeof setTimeout> | undefined;
  function askEnd() {
    confirmEnd = true;
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => (confirmEnd = false), 5000);
  }

  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  const live = $derived(glint.listen === 'live' || glint.listen === 'reconnecting');
  const busy = $derived(glint.answer?.status === 'thinking' || glint.answer?.status === 'streaming');
  const spark = $derived(glint.phase !== 'ready' ? 'off' : busy ? 'thinking' : live ? 'live' : 'idle');
  const modeIcon = $derived(MODES.find((m) => m.id === settings.mode)?.icon ?? 'sparkle');
  const keys = (a: string) => keyParts(settings.bindings[a] ?? '').join('+');

  // Responsive bar: measure instead of guessing breakpoints. Try the full bar, then drop labels
  // level by level (c1 → c3) until nothing overflows. Classes are set directly so the check is
  // synchronous (no paint in between, so no flicker).
  let bar: HTMLElement | undefined = $state();
  function fitBar() {
    if (!bar) return;
    for (let lvl = 0; lvl <= 3; lvl++) {
      bar.classList.toggle('c1', lvl >= 1);
      bar.classList.toggle('c2', lvl >= 2);
      bar.classList.toggle('c3', lvl >= 3);
      if (bar.scrollWidth <= bar.clientWidth + 1) break;
    }
  }
  $effect(() => {
    if (!bar) return;
    const ro = new ResizeObserver(fitBar);
    ro.observe(bar);
    return () => ro.disconnect();
  });
  // Content changes (session start/end, mic state, End? prompt, the ticking balance) change the
  // bar's natural width without changing its box, so refit on those too.
  $effect(() => {
    void [recorder.active, recorder.finishing, live, glint.listen, confirmEnd, glint.phase, settings.mode];
    void [sessionLabel(), settings.bindings.answer, formatLeft(glint.balanceNow(now))];
    fitBar();
  });


  // Drag the overlay from the bar's empty areas (not its buttons). Glint moves the window itself so
  // Windows never draws a drag outline that screen sharing could see.
  function dragFromBar(e: PointerEvent) {
    const t = e.target as HTMLElement;
    if (e.button !== 0 || (t !== e.currentTarget && !('drag' in t.dataset))) return;
    ipc.dragWindow();
  }

  // The logo is the handle: drag it to move Glint, tap it to collapse (same as the bubble).
  let handle: { x: number; y: number } | null = null;
  let moved = false;

  function handleDown(e: PointerEvent) {
    if (e.button !== 0) return;
    handle = { x: e.screenX, y: e.screenY };
    moved = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleMove(e: PointerEvent) {
    if (!handle || moved) return;
    if (Math.hypot(e.screenX - handle.x, e.screenY - handle.y) > 4) {
      moved = true;
      ipc.dragWindow();
    }
  }

  function handleClick() {
    handle = null;
    if (moved) {
      moved = false;
      return;
    }
    glint.collapse();
  }

  function toggleView(v: 'session' | 'settings') {
    glint.menuOpen = false;
    glint.view = glint.view === v ? 'main' : v;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<header class="bar panel" bind:this={bar} onpointerdown={dragFromBar}>
  <button
    class="logo"
    onpointerdown={handleDown}
    onpointermove={handleMove}
    onclick={handleClick}
    title="Drag to move · click to collapse ({keys('toggle')})"
    aria-label="Collapse"
  >
    <Spark state={spark} size={20} />
  </button>

  {#if glint.phase === 'ready'}
    <button class="chip" class:active={glint.view === 'session'} onclick={() => toggleView('session')} title="Session setup: type, company, resume, model">
      <Icon name={modeIcon} size={14} />
      <!-- While recording, the REC timer needs the room: the chip shows just its icon. -->
      {#if !recorder.active && !recorder.finishing}<span class="chip-text">{sessionLabel()}</span>{/if}
    </button>
    {#if recorder.active || recorder.finishing}
      {@const secs = Math.max(0, Math.floor((now - recorder.startedAt) / 1000))}
      {#if confirmEnd && recorder.active}
        <span class="rec confirm">
          End?
          <button class="end" onclick={() => { confirmEnd = false; recorder.end(); }} title="Save the session and end it">Save</button>
          <button class="keep" onclick={() => (confirmEnd = false)} title="Keep recording">Keep</button>
        </span>
      {:else}
        <!-- Ending needs a second click: it sits next to Listen, which only pauses. -->
        <button
          class="rec"
          class:paused={!live}
          onclick={askEnd}
          disabled={recorder.finishing}
          title={live ? 'Session recording. Click to end it.' : 'Session recording, mic off. Click to end it.'}
        >
          <span class="dot"></span>
          {#if recorder.finishing}Saving…{:else}{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}{#if !live}<span class="state">mic off</span>{/if}<span class="end">End</span>{/if}
        </button>
      {/if}
    {/if}

    {#if recorder.active}
      <!-- Mic: its own button, separate from the session. Off stops your mic and the call audio
           (so listening time isn't charged); the session keeps running until End. -->
      <button
        class="btn listen"
        class:live
        class:off={!live && glint.listen !== 'connecting'}
        class:connecting={glint.listen === 'connecting' || glint.listen === 'reconnecting'}
        onclick={() => glint.toggleListen()}
        title="{live ? 'Turn the mic off: stops your mic and the call audio, so listening time is not charged. The session keeps running' : 'Turn the mic back on'} ({keys('listen')})"
        aria-pressed={live}
      >
        {#if live}
          <span class="meters" aria-hidden="true">
            <i style:transform="scaleY({0.15 + glint.levels.them * 0.85})" class="them"></i>
            <i style:transform="scaleY({0.15 + glint.levels.you * 0.85})"></i>
          </span>
          <Icon name="mic" size={14} />
        {:else if glint.listen === 'connecting'}
          <Icon name="mic" size={15} /> …
        {:else}
          <Icon name="mic-off" size={15} /><span class="label">Mic off</span>
        {/if}
      </button>
    {:else}
      <button
        class="btn listen"
        onclick={() => glint.toggleListen()}
        disabled={recorder.finishing}
        title="Start a session: Glint records it and turns the mic on ({keys('listen')})"
      >
        <Icon name="play" size={14} /><span class="label">{recorder.finishing ? 'Saving…' : 'Start session'}</span>
      </button>
    {/if}

    <button class="btn primary" onclick={() => glint.ask('answer')} title="Answer now: conversation + screen ({keys('answer')})">
      <Icon name="bolt" size={15} /><span class="label">Answer</span>
      <span class="keys-hint"><Keys accel={settings.bindings.answer} /></span>
    </button>

    <button class="btn" onclick={() => glint.ask('screen')} title="Solve what's on screen ({keys('screen')})">
      <Icon name="screen" size={15} /><span class="label">Screen</span>
    </button>

    <button class="btn icon" onclick={() => glint.startTyping()} title="Type a question ({keys('type')})">
      <Icon name="keyboard" size={16} />
    </button>

    <div class="grow" data-drag></div>

    <button class="balance" class:low={glint.balanceNow(now) < 600} onclick={() => glint.buy()} title="Time left. Click to add hours.">
      <Icon name="clock" size={13} />
      <span class="label">{formatLeft(glint.balanceNow(now))}</span>
    </button>
    <button
      class="btn icon"
      class:active={glint.menuOpen}
      onclick={() => (glint.menuOpen = !glint.menuOpen)}
      title="Menu"
      aria-label="Menu"
      aria-expanded={glint.menuOpen}
    >
      <Icon name="dots" size={18} />
    </button>
  {:else}
    <span class="title" data-drag>Glint</span>
    <div class="grow" data-drag></div>
  {/if}

  <button class="btn icon" onclick={() => glint.collapse()} title="Collapse to bubble ({keys('toggle')})" aria-label="Collapse">
    <Icon name="minus" size={16} />
  </button>
</header>

<style>
  .rec {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 6px 0 9px;
    margin-right: 4px;
    border-radius: 15px;
    border: 1px solid rgba(255, 90, 95, 0.45);
    background: rgba(255, 90, 95, 0.12);
    color: #ff8f93;
    font-size: 12px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .rec .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--live);
    animation: pulse 1.4s ease-in-out infinite;
  }
  .rec.paused {
    border-color: rgba(245, 184, 61, 0.45);
    background: rgba(245, 184, 61, 0.1);
    color: var(--accent);
  }
  .rec.paused .dot {
    background: var(--accent);
    animation: none;
  }
  .rec .state {
    font-size: 11px;
    font-weight: 600;
    opacity: 0.85;
  }
  .rec.confirm {
    gap: 5px;
    padding-right: 4px;
  }
  .rec.confirm button {
    padding: 3px 8px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 650;
  }
  .rec.confirm .keep {
    color: var(--muted);
  }
  .rec.confirm .keep:hover {
    color: var(--text);
    background: var(--raise-2);
  }
  .rec .end {
    margin-left: 2px;
    padding: 2px 7px;
    border-radius: 10px;
    background: rgba(255, 90, 95, 0.22);
    color: #ffd0d2;
    font-size: 11px;
  }
  .rec:hover:not(:disabled) .end {
    background: rgba(255, 90, 95, 0.4);
  }
  .bar {
    height: 48px;
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 0 6px 0 8px;
    border-radius: 24px;
    cursor: default;
  }
  .logo {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    cursor: grab;
    touch-action: none;
  }
  .logo:active {
    cursor: grabbing;
  }
  .logo:hover {
    background: var(--raise-2);
  }
  .title {
    font-weight: 600;
    margin-left: 4px;
    letter-spacing: 0.2px;
  }
  /* Buttons keep their size, so a too-narrow bar overflows (which fitBar detects and fixes by
     dropping labels) instead of silently squashing the menu and hide buttons at the right edge. */
  .bar > :global(*) {
    flex-shrink: 0;
  }
  .bar > .grow {
    flex: 1 1 0;
    align-self: stretch;
    min-width: 8px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    max-width: 150px;
    padding: 0 10px;
    border-radius: 15px;
    border: 1px solid var(--border);
    color: var(--muted);
    font-size: 12.5px;
    font-weight: 550;
    margin-right: 4px;
  }
  .chip:hover,
  .chip.active {
    color: var(--text);
    border-color: var(--border-strong);
    background: var(--raise);
  }
  .chip-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .btn {
    height: 34px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 0 11px;
    border-radius: 17px;
    font-weight: 550;
    font-size: 13px;
    color: var(--text);
    transition: background 0.12s;
    white-space: nowrap;
  }
  .btn:hover {
    background: var(--raise-2);
  }
  .btn.icon {
    width: 34px;
    padding: 0;
    justify-content: center;
    color: var(--muted);
  }
  .btn.icon:hover,
  .btn.icon.active {
    color: var(--text);
  }
  .btn.icon.active {
    background: var(--raise-2);
  }
  .btn.primary {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .btn.primary:hover {
    background: #ffc65a;
  }
  .btn.primary :global(kbd) {
    background: rgba(0, 0, 0, 0.12);
    border-color: rgba(0, 0, 0, 0.15);
    color: var(--accent-ink);
  }
  .listen {
    background: var(--raise);
  }
  .listen.live {
    background: rgba(255, 90, 95, 0.14);
    color: #ffb3b5;
  }
  .listen.connecting {
    color: var(--muted);
  }
  .listen.off {
    color: var(--accent);
  }
  /* Compact levels, picked by measuring (see fitBar): labels drop step by step so every button,
     the ⋮ menu included, stays inside the bar instead of being cut off at the window's edge. */
  .bar:global(.c1) .keys-hint,
  .bar:global(.c1) .chip-text {
    display: none;
  }
  .bar:global(.c2) .label {
    display: none;
  }
  .bar:global(.c2) .btn {
    padding: 0 9px;
  }
  .bar:global(.c3) .rec .state,
  .bar:global(.c3) .rec .end,
  .bar:global(.c3) .balance .label {
    display: none;
  }
  .meters {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 14px;
  }
  .meters i {
    width: 3px;
    height: 14px;
    border-radius: 2px;
    background: #ffb3b5;
    transform-origin: center;
    transition: transform 0.1s linear;
  }
  .meters i.them {
    background: var(--them);
  }
  .balance {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 26px;
    padding: 0 8px;
    border-radius: 13px;
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .balance:hover {
    background: var(--raise-2);
    color: var(--text);
  }
  .balance.low {
    color: var(--accent);
  }
</style>
