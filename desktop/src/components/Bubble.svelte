<script lang="ts">
  // Collapsed Glint: a floating logo you can drag anywhere. Tap to open (like iOS AssistiveTouch).
  import { glint } from '../lib/store.svelte';
  import { ipc } from '../lib/ipc';
  import { settings } from '../lib/settings.svelte';
  import { keyParts } from '../lib/keys';
  import Spark from './Spark.svelte';

  let start: { x: number; y: number } | null = null;
  let dragging = false;

  const live = $derived(glint.listen === 'live' || glint.listen === 'reconnecting');
  const busy = $derived(glint.answer?.status === 'thinking' || glint.answer?.status === 'streaming');

  function down(e: PointerEvent) {
    start = { x: e.screenX, y: e.screenY };
    dragging = false;
    // Keep receiving moves even if a quick flick leaves the 48 px bubble before the drag starts.
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function move(e: PointerEvent) {
    if (!start || dragging) return;
    if (Math.hypot(e.screenX - start.x, e.screenY - start.y) > 4) {
      dragging = true;
      ipc.dragWindow();
    }
  }

  function up() {
    if (start && !dragging) glint.expand();
    start = null;
  }
</script>

<button
  class="bubble"
  class:live
  class:busy
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  title="Open Glint ({keyParts(settings.bindings.toggle).join('+')}). Drag to move."
  aria-label="Open Glint"
>
  <span class="ring" aria-hidden="true"></span>
  <Spark state={glint.phase === 'ready' ? 'idle' : 'off'} size={24} />
  {#if glint.unread}<i class="badge" aria-label="New answer"></i>{/if}
</button>

<style>
  .bubble {
    position: relative;
    width: 48px;
    height: 48px;
    margin: 4px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: radial-gradient(circle at 35% 30%, rgba(40, 42, 54, var(--opacity)), rgba(12, 13, 18, var(--opacity)));
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow:
      0 6px 18px rgba(0, 0, 0, 0.45),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
    cursor: pointer;
    transition: transform 0.15s ease;
  }
  .bubble:hover {
    transform: scale(1.06);
  }
  .bubble:active {
    transform: scale(0.96);
  }
  .ring {
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    pointer-events: none;
  }
  .live .ring {
    border: 2px solid var(--live);
    animation: pulse 1.6s ease-in-out infinite;
  }
  .busy .ring {
    border: 2px solid transparent;
    background: conic-gradient(from 0deg, transparent 0 55%, var(--accent) 100%) border-box;
    -webkit-mask:
      linear-gradient(#000 0 0) padding-box,
      linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask:
      linear-gradient(#000 0 0) padding-box,
      linear-gradient(#000 0 0);
    mask-composite: exclude;
    animation: spin 0.9s linear infinite;
  }
  .badge {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 2px var(--bg-solid);
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
