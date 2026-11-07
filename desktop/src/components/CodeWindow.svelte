<script lang="ts">
  // Root mounted in the "code" window (see main.ts). It owns no app state of its own — the
  // overlay window broadcasts content, visibility and the settings slice it needs (App.svelte),
  // since the two windows are separate webviews with separate JS memory.
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { ipc, on, emit } from '../lib/ipc';
  import type { CodeBlock } from '../lib/markdown';
  import type { Settings } from '../lib/settings.svelte';
  import CodePanel from './CodePanel.svelte';

  let blocks = $state<CodeBlock[]>([]);
  let streaming = $state(false);
  let codePanel: CodePanel | undefined = $state();

  let width = $state(420);
  let height = $state(560);
  let dragSize = $state<{ w: number; h: number } | null>(null);
  let resizeMode = $state<'both' | 'x' | 'y'>('both');
  const w = $derived(dragSize?.w ?? width);
  const h = $derived(dragSize?.h ?? height);

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

  function startResize(e: PointerEvent, mode: 'both' | 'x' | 'y') {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    resizeMode = mode;
    document.documentElement.style.cursor = mode === 'x' ? 'ew-resize' : mode === 'y' ? 'ns-resize' : 'nwse-resize';
    dragSize = { w: width, h: height };
    ipc.resizeDrag();
  }

  // Drag from the header's empty areas, same convention as Bar.svelte (data-drag marks spacer/title
  // spans so the whole header reads as a handle, not just its literal background padding).
  function dragHeader(e: PointerEvent) {
    const t = e.target as HTMLElement;
    if (e.button !== 0 || (t !== e.currentTarget && !('drag' in t.dataset))) return;
    ipc.dragWindow();
  }

  // The webview is zoomed like the overlay, so CSS pixels x zoom = window pixels.
  let zoom = $state(1);
  $effect(() => {
    ipc.resize(Math.ceil(w * zoom), Math.ceil(h * zoom));
  });

  onMount(() => {
    const win = getCurrentWindow();
    document.documentElement.style.setProperty('--opacity', '0.94');
    const stops = Promise.all([
      on<{ blocks: CodeBlock[]; streaming: boolean }>('code-content', (e) => {
        blocks = e.blocks;
        streaming = e.streaming;
      }),
      on<boolean>('code-visible', (v) => {
        if (v) win.show();
        else win.hide();
      }),
      on<number>('code-reveal', (i) => codePanel?.reveal(i)),
      on<Pick<Settings, 'opacity' | 'zoom' | 'protected'>>('settings-sync', (s) => {
        document.documentElement.style.setProperty('--opacity', String(s.opacity));
        if (s.zoom !== zoom) {
          zoom = s.zoom;
          ipc.setZoom(s.zoom);
        }
        ipc.setProtected(s.protected);
      }),
      on<{ dx: number; dy: number; done: boolean }>('resize-drag', ({ dx, dy, done }) => {
        if (!dragSize) return;
        const k = window.devicePixelRatio || 1;
        const next = {
          w: resizeMode === 'y' ? width : clamp(width + dx / k, 320, 1200),
          h: resizeMode === 'x' ? height : clamp(height + dy / k, 240, 1400),
        };
        if (done) {
          width = next.w;
          height = next.h;
          dragSize = null;
          document.documentElement.style.cursor = '';
        } else {
          dragSize = next;
        }
      }),
    ]);
    emit('code-window-ready', null);
    return () => {
      stops.then((fns) => fns.forEach((f) => f()));
    };
  });
</script>

<div class="code-window" style:width={`${w}px`} style:height={`${h}px`}>
  <CodePanel bind:this={codePanel} {blocks} width={w} {streaming} onDrag={dragHeader} />
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="edge edge-r" class:active={!!dragSize && resizeMode === 'x'} onpointerdown={(e) => startResize(e, 'x')}></div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="edge edge-b" class:active={!!dragSize && resizeMode === 'y'} onpointerdown={(e) => startResize(e, 'y')}></div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="grip" class:active={!!dragSize && resizeMode === 'both'} onpointerdown={(e) => startResize(e, 'both')}></div>
</div>

<style>
  .code-window {
    position: relative;
  }
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
    top: 0;
    bottom: 0;
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
    left: 0;
    right: 12px;
    bottom: 0;
    height: 7px;
    cursor: ns-resize;
  }
  .edge-b::after {
    left: 0;
    right: 0;
    bottom: 1px;
    height: 3px;
  }
  .grip {
    position: absolute;
    z-index: 6;
    right: 0;
    bottom: 0;
    width: 14px;
    height: 14px;
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
