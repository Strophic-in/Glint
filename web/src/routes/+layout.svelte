<script lang="ts">
  import '../app.css';
  import { onMount, type Snippet } from 'svelte';
  import Header from '$lib/components/Header.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import Toasts from '$lib/components/Toasts.svelte';
  import { session } from '$lib/session.svelte';

  let { children }: { children: Snippet } = $props();

  onMount(() => {
    session.init();
  });
</script>

<Header />
<main>
  {@render children()}
</main>
<Footer />
<Toasts />

<style>
  main {
    min-height: calc(100vh - 64px - 240px);
  }
</style>
