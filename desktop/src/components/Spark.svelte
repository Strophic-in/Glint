<script lang="ts">
  // Glint mark: a four-point glint with a small companion sparkle.
  let { state = 'idle', size = 20 }: { state?: 'idle' | 'live' | 'thinking' | 'off'; size?: number } = $props();
  const id = `glint-${Math.random().toString(36).slice(2, 8)}`;
</script>

<span class="mark {state}" style:width="{size}px" style:height="{size}px">
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <defs>
      <linearGradient {id} x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0" stop-color="#FFEBB8" />
        <stop offset="0.5" stop-color="#F5B83D" />
        <stop offset="1" stop-color="#FF7A3D" />
      </linearGradient>
    </defs>
    <path d="M10.5 3.5Q11.8 12.2 20.5 13.5Q11.8 14.8 10.5 23.5Q9.2 14.8 0.5 13.5Q9.2 12.2 10.5 3.5Z" fill="url(#{id})" />
    <path d="M19.5 0.5Q19.9 3.6 23 4Q19.9 4.4 19.5 7.5Q19.1 4.4 16 4Q19.1 3.6 19.5 0.5Z" fill="url(#{id})" opacity="0.85" />
  </svg>
  {#if state === 'live'}<i class="dot"></i>{/if}
</span>

<style>
  .mark {
    position: relative;
    display: inline-grid;
    place-items: center;
    flex: none;
  }
  .mark.off svg {
    filter: grayscale(1) brightness(0.7);
  }
  .mark.thinking svg {
    animation: pulse 0.9s ease-in-out infinite;
  }
  .dot {
    position: absolute;
    right: -3px;
    bottom: 0;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--live);
    box-shadow: 0 0 0 2px var(--bg-solid);
    animation: pulse 1.4s ease-in-out infinite;
  }
</style>
