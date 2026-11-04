<script lang="ts">
  import { DOWNLOAD_URL } from '$lib/config';

  let { size = 'lg', primary = true }: { size?: 'sm' | 'md' | 'lg'; primary?: boolean } = $props();

  const href = DOWNLOAD_URL || '/login?next=/dashboard';
  const external = /^https?:\/\//.test(href);
</script>

<a
  class="btn"
  class:btn-primary={primary}
  class:btn-lg={size === 'lg'}
  class:btn-sm={size === 'sm'}
  {href}
  rel={external ? 'noopener' : undefined}
>
  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="currentColor">
    <path d="M3 5.1 10.4 4v7.2H3V5.1Zm0 13.8 7.4 1.1v-7.1H3v6Zm8.3 1.2L21 21.5v-8.6h-9.7v7.2Zm0-16.2v7.3H21V2.5l-9.7 1.4Z" />
  </svg>
  Download for Windows
</a>
