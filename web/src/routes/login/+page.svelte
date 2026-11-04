<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import LoginPanel from '$lib/components/LoginPanel.svelte';
  import { session } from '$lib/session.svelte';
  import { safeNext } from '$lib/format';
  import { BRAND } from '$lib/config';

  const next = $derived(safeNext(page.url.searchParams.get('next')));

  // Covers both "already signed in" and "just signed in".
  $effect(() => {
    if (!session.loading && session.signedIn) goto(next, { replaceState: true });
  });
</script>

<svelte:head>
  <title>Sign in · {BRAND}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<section class="wrap container">
  {#if session.loading || session.signedIn}
    <p class="muted">Loading…</p>
  {:else}
    <LoginPanel title="Sign in to {BRAND}" />
  {/if}
</section>

<style>
  .wrap {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 72px;
    padding-bottom: 24px;
  }
</style>
