<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { session } from '$lib/session.svelte';
  import Overview from '$lib/components/admin/Overview.svelte';
  import Users from '$lib/components/admin/Users.svelte';
  import Live from '$lib/components/admin/Live.svelte';
  import Orders from '$lib/components/admin/Orders.svelte';
  import Coupons from '$lib/components/admin/Coupons.svelte';
  import Controls from '$lib/components/admin/Controls.svelte';
  import Log from '$lib/components/admin/Log.svelte';

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'users', label: 'Users' },
    { id: 'live', label: 'Live' },
    { id: 'orders', label: 'Orders' },
    { id: 'coupons', label: 'Coupons' },
    { id: 'controls', label: 'Controls' },
    { id: 'log', label: 'Audit log' }
  ] as const;
  type Tab = (typeof TABS)[number]['id'];

  const initial = (typeof location !== 'undefined' ? location.hash.slice(1) : '') as Tab;
  let tab = $state<Tab>(TABS.some((t) => t.id === initial) ? initial : 'overview');

  function select(t: Tab) {
    tab = t;
    history.replaceState(null, '', `#${t}`);
  }

  $effect(() => {
    if (!session.loading && !session.signedIn) goto('/login?next=/admin');
  });

  // Follow #hash links and back/forward between tabs.
  onMount(() => {
    const sync = () => {
      const h = location.hash.slice(1) as Tab;
      if (TABS.some((t) => t.id === h)) tab = h;
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  });
</script>

<svelte:head><title>Admin · Glint</title></svelte:head>

{#if session.loading}
  <section class="container pad"><p class="muted">Loading…</p></section>
{:else if session.signedIn && !session.me?.is_admin}
  <section class="container pad">
    <div class="card denied">
      <h1>Admins only</h1>
      <p class="muted">
        {session.me?.user.email} isn't an admin. Add it to <code>ADMIN_EMAILS</code> on the server.
      </p>
    </div>
  </section>
{:else if session.signedIn}
  <section class="container pad">
    <div class="head">
      <h1>Admin</h1>
      <span class="badge badge-accent">{session.me?.user.email}</span>
    </div>
    <nav class="tabs" aria-label="Admin sections">
      {#each TABS as t}
        <button class:on={tab === t.id} aria-current={tab === t.id ? 'page' : undefined} onclick={() => select(t.id)}>{t.label}</button>
      {/each}
    </nav>

    {#if tab === 'overview'}<Overview />{/if}
    {#if tab === 'users'}<Users />{/if}
    {#if tab === 'live'}<Live />{/if}
    {#if tab === 'orders'}<Orders />{/if}
    {#if tab === 'coupons'}<Coupons />{/if}
    {#if tab === 'controls'}<Controls />{/if}
    {#if tab === 'log'}<Log />{/if}
  </section>
{/if}

<style>
  .pad {
    padding-top: 36px;
    padding-bottom: 72px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    margin-bottom: 18px;
  }
  h1 {
    font-size: clamp(26px, 4vw, 34px);
  }
  .tabs {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    border-bottom: 1px solid var(--border);
    margin-bottom: 24px;
  }
  .tabs button {
    background: none;
    border: 0;
    color: var(--muted);
    font: inherit;
    font-size: 14.5px;
    font-weight: 600;
    padding: 10px 14px;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    white-space: nowrap;
  }
  .tabs button:hover {
    color: var(--text);
  }
  .tabs button.on {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
  .denied {
    padding: 28px;
    max-width: 560px;
  }
  .denied h1 {
    font-size: 24px;
    margin-bottom: 8px;
  }
</style>
