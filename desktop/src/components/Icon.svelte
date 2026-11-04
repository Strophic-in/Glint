<script lang="ts">
  let { name, size = 16 }: { name: string; size?: number } = $props();

  const PATHS: Record<string, string> = {
    mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z M19 11a7 7 0 0 1-14 0 M12 18v3',
    stop: 'M7 7h10v10H7z',
    bolt: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
    screen: 'M3 5h18v11H3z M8 20h8 M12 16v4',
    keyboard: 'M3 7h18v10H3z M7 11h.01 M11 11h.01 M15 11h.01 M7 14h10',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
    x: 'M6 6l12 12 M18 6 6 18',
    minus: 'M5 12h14',
    copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
    check: 'M5 12l5 5L20 7',
    send: 'M5 12h14 M13 6l6 6-6 6',
    back: 'M19 12H5 M11 6l-6 6 6 6',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 7v5l3 2',
    logout: 'M9 21H5V3h4 M16 17l5-5-5-5 M21 12H9',
    power: 'M12 2v10 M18.4 6.6a9 9 0 1 1-12.8 0',
    trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
    list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
    refresh: 'M21 12a9 9 0 1 1-2.6-6.4L21 8 M21 3v5h-5',
    briefcase: 'M3 8h18v12H3z M8 8V5h8v3 M3 13h18',
    phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
    target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M12 12h.01',
    code: 'M8 7l-5 5 5 5 M16 7l5 5-5 5',
    sparkle: 'M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6Z',
    dots: 'M12 5h.01 M12 12h.01 M12 19h.01',
    chevron: 'M6 9l6 6 6-6',
    external: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    plus: 'M12 5v14 M5 12h14',
    file: 'M14 3H6v18h12V7Z M14 3v4h4 M9 13h6 M9 17h6',
    collapse: 'M4 14h6v6 M20 10h-6V4 M14 10l7-7 M3 21l7-7',
    grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  };
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.9"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#each (PATHS[name] ?? '').split(' M') as d, i}
    <path d={i === 0 ? d : 'M' + d} />
  {/each}
</svg>
