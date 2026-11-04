<script lang="ts">
  import { glint, sessionLabel } from '../lib/store.svelte';
  import { settings, MODES } from '../lib/settings.svelte';
  import { keyParts } from '../lib/keys';
  import { ipc } from '../lib/ipc';
  import { formatLeft } from '../lib/time';
  import Icon from './Icon.svelte';
  import Keys from './Keys.svelte';
  import Spark from './Spark.svelte';

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

  function clock(ms: number) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }


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
<header class="bar panel" onpointerdown={dragFromBar}>
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
      <span class="chip-text">{sessionLabel()}</span>
    </button>

    <button
      class="btn listen"
      class:live
      class:connecting={glint.listen === 'connecting' || glint.listen === 'reconnecting'}
      onclick={() => glint.toggleListen()}
      title="{live ? 'Stop listening' : 'Listen to the call'} ({keys('listen')})"
    >
      {#if live}
        <span class="meters" aria-hidden="true">
          <i style:transform="scaleY({0.15 + glint.levels.them * 0.85})" class="them"></i>
          <i style:transform="scaleY({0.15 + glint.levels.you * 0.85})"></i>
        </span>
        <span class="time">{glint.listen === 'reconnecting' ? '…' : clock(now - glint.listenSince)}</span>
        <Icon name="stop" size={13} />
      {:else if glint.listen === 'connecting'}
        <Icon name="mic" size={15} /> …
      {:else}
        <Icon name="mic" size={15} /> Listen
      {/if}
    </button>

    <button class="btn primary" onclick={() => glint.ask('answer')} title="Answer now: conversation + screen">
      <Icon name="bolt" size={15} /> Answer
      <Keys accel={settings.bindings.answer} />
    </button>

    <button class="btn" onclick={() => glint.ask('screen')} title="Solve what's on screen ({keys('screen')})">
      <Icon name="screen" size={15} /> Screen
    </button>

    <button class="btn icon" onclick={() => glint.startTyping()} title="Type a question ({keys('type')})">
      <Icon name="keyboard" size={16} />
    </button>

    <div class="grow" data-drag></div>

    <button class="balance" class:low={glint.balanceNow(now) < 600} onclick={() => glint.buy()} title="Time left. Click to add hours.">
      <Icon name="clock" size={13} />
      {formatLeft(glint.balanceNow(now))}
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
  .grow {
    flex: 1;
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
  .time {
    font-variant-numeric: tabular-nums;
    min-width: 30px;
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
