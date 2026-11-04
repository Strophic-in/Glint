<script lang="ts">
  import { page } from '$app/state';
  import Logo from './Logo.svelte';
  import { session } from '$lib/session.svelte';

  let open = $state(false);

  // Close the mobile menu whenever the route changes.
  $effect(() => {
    void page.url.pathname;
    open = false;
  });
</script>

<header class="header">
  <div class="container bar">
    <a href="/" class="brand" aria-label="Glint home"><Logo /></a>

    <button
      class="menu-btn"
      aria-label={open ? 'Close menu' : 'Open menu'}
      aria-expanded={open}
      aria-controls="site-nav"
      onclick={() => (open = !open)}
    >
      <span class:x={open}></span>
    </button>

    <nav id="site-nav" class:open>
      <a href="/#features">Features</a>
      <a href="/#pricing">Pricing</a>
      <a href="/#download">Download</a>
      {#if session.signedIn}
        {#if session.me?.is_admin}<a href="/admin">Admin</a>{/if}
        <a href="/dashboard" class="btn btn-sm btn-primary cta">Dashboard</a>
      {:else}
        <a href="/login" class="btn btn-sm cta">Sign in</a>
      {/if}
    </nav>
  </div>
</header>

<style>
  .header {
    position: sticky;
    top: 0;
    z-index: 50;
    background: rgba(11, 12, 16, 0.72);
    backdrop-filter: saturate(140%) blur(14px);
    -webkit-backdrop-filter: saturate(140%) blur(14px);
    border-bottom: 1px solid var(--border);
  }
  .bar {
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .brand {
    display: inline-flex;
    padding: 6px 0;
  }
  nav {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  nav a:not(.btn) {
    padding: 8px 12px;
    border-radius: 8px;
    color: var(--muted);
    font-size: 15px;
    font-weight: 500;
    transition: color 0.15s;
  }
  nav a:not(.btn):hover {
    color: var(--text);
  }
  .cta {
    margin-left: 8px;
  }

  .menu-btn {
    display: none;
    width: 40px;
    height: 40px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    cursor: pointer;
    position: relative;
  }
  .menu-btn span,
  .menu-btn span::before,
  .menu-btn span::after {
    position: absolute;
    left: 50%;
    width: 18px;
    height: 2px;
    margin-left: -9px;
    background: var(--text);
    border-radius: 2px;
    transition: transform 0.2s, background 0.2s;
  }
  .menu-btn span {
    top: 50%;
    margin-top: -1px;
  }
  .menu-btn span::before,
  .menu-btn span::after {
    content: '';
    left: 0;
    margin-left: 0;
  }
  .menu-btn span::before {
    top: -6px;
  }
  .menu-btn span::after {
    top: 6px;
  }
  .menu-btn span.x {
    background: transparent;
  }
  .menu-btn span.x::before {
    transform: translateY(6px) rotate(45deg);
  }
  .menu-btn span.x::after {
    transform: translateY(-6px) rotate(-45deg);
  }

  @media (max-width: 719px) {
    .menu-btn {
      display: inline-block;
    }
    nav {
      position: absolute;
      top: 64px;
      left: 0;
      right: 0;
      flex-direction: column;
      align-items: stretch;
      gap: 2px;
      padding: 10px var(--gutter) 16px;
      background: var(--bg);
      border-bottom: 1px solid var(--border);
      display: none;
    }
    nav.open {
      display: flex;
    }
    nav a:not(.btn) {
      padding: 12px 4px;
      font-size: 16px;
    }
    .cta {
      margin: 8px 0 0;
      height: 44px;
    }
  }
</style>
