<script lang="ts">
  let { size = 22 }: { size?: number } = $props();
  const id = `lg-${Math.random().toString(36).slice(2, 8)}`;
</script>

<span class="logo" style:--s="{size}px">
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
  <span class="word">Glint</span>
</span>

<style>
  .logo {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-weight: 700;
    letter-spacing: -0.03em;
    font-size: calc(var(--s) * 0.95);
    line-height: 1;
  }
  .word {
    transform: translateY(-1px);
  }
</style>
