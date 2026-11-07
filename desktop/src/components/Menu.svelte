<script lang="ts">
  // ⋮ quick menu: account, dashboard, invisibility, zoom, settings, hide, sign out, quit.
  import { glint } from '../lib/store.svelte';
  import { settings } from '../lib/settings.svelte';
  import { ipc } from '../lib/ipc';
  import { formatLeft } from '../lib/time';
  import Icon from './Icon.svelte';
  import UnhideConfirm from './UnhideConfirm.svelte';
  import { updates } from '../lib/update.svelte';

  let confirmUnhide = $state(false);

  // Hiding is instant; showing Glint in screen shares asks first.
  function onProtectChange(e: Event) {
    const box = e.currentTarget as HTMLInputElement;
    if (box.checked) {
      settings.protected = true;
      confirmUnhide = false;
    } else {
      box.checked = true;
      confirmUnhide = true;
    }
  }

  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  function zoomBy(d: number) {
    settings.zoom = Math.round(Math.min(1.5, Math.max(0.7, settings.zoom + d)) * 10) / 10;
  }

  function run(fn: () => void) {
    glint.menuOpen = false;
    fn();
  }

  const initial = $derived((glint.user?.name || glint.user?.email || '?').trim()[0]?.toUpperCase() ?? '?');
</script>

<div class="wrap">
  <div class="menu panel" role="menu">
    <div class="who">
      {#if glint.user?.picture}
        <img src={glint.user.picture} alt="" referrerpolicy="no-referrer" />
      {:else}
        <span class="avatar">{initial}</span>
      {/if}
      <div class="id">
        <div class="name">{glint.user?.name || glint.user?.email}</div>
        <div class="sub">{glint.user?.email}</div>
      </div>
      <span class="left" class:low={glint.balanceNow(now) < 600}>{formatLeft(glint.balanceNow(now))} left</span>
    </div>

    <button class="item" onclick={() => run(() => ipc.openUrl(`${glint.webUrl}/dashboard`))}>
      <Icon name="grid" size={15} /> Dashboard <span class="ext"><Icon name="external" size={13} /></span>
    </button>
    <button class="item" onclick={() => run(() => glint.buy())}>
      <Icon name="clock" size={15} /> Add hours <span class="ext"><Icon name="external" size={13} /></span>
    </button>

    <label class="item">
      <Icon name="eye" size={15} /> Invisibility
      <input
        type="checkbox"
        class="switch"
        checked={settings.protected}
        onchange={onProtectChange}
        title="Hidden from screen share and recordings"
      />
    </label>
    {#if confirmUnhide}
      <UnhideConfirm
        oncancel={() => (confirmUnhide = false)}
        onconfirm={() => {
          settings.protected = false;
          confirmUnhide = false;
        }}
      />
    {/if}
    <div class="item static">
      <Icon name="zoom" size={15} /> Zoom
      <span class="zoom">
        <button onclick={() => zoomBy(-0.1)} aria-label="Zoom out" disabled={settings.zoom <= 0.7}><Icon name="minus" size={13} /></button>
        <span>{Math.round(settings.zoom * 100)}%</span>
        <button onclick={() => zoomBy(0.1)} aria-label="Zoom in" disabled={settings.zoom >= 1.5}><Icon name="plus" size={13} /></button>
      </span>
    </div>

    <div class="item static opacity">
      <Icon name="drop" size={15} /> Opacity
      <input
        type="range"
        min="0.12"
        max="1"
        step="0.02"
        bind:value={settings.opacity}
        aria-label="Overlay opacity"
        title={settings.solidOnHover ? 'Turns solid while your mouse is over Glint' : ''}
      />
      <span class="pct">{Math.round(settings.opacity * 100)}%</span>
    </div>

    <div class="sep"></div>
    {#if updates.status === 'available'}
      <button class="item update" onclick={() => run(() => (updates.dismissed = false))}>
        <Icon name="sparkle" size={15} /> Update to v{updates.version}
      </button>
    {/if}
    <button class="item" onclick={() => run(() => (glint.view = 'settings'))}><Icon name="gear" size={15} /> Settings</button>
    <button class="item" onclick={() => run(() => ipc.hide())}><Icon name="minus" size={15} /> Hide completely</button>
    <button class="item" onclick={() => run(() => glint.signOut())}><Icon name="logout" size={15} /> Sign out</button>
    <button class="item" onclick={() => run(() => ipc.quit())}><Icon name="power" size={15} /> Quit Glint</button>
  </div>
</div>

<style>
  .wrap {
    display: flex;
    justify-content: flex-end;
    margin-top: 6px;
  }
  .menu {
    width: 290px;
    padding: 6px;
    display: grid;
    gap: 1px;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 8px 10px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 4px;
  }
  .who img,
  .avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    flex: none;
  }
  .avatar {
    display: grid;
    place-items: center;
    background: linear-gradient(135deg, #f5b83d, #ff7a3d);
    color: var(--accent-ink);
    font-weight: 700;
  }
  .id {
    min-width: 0;
    flex: 1;
  }
  .name,
  .sub {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name {
    font-weight: 600;
  }
  .sub {
    font-size: 11.5px;
    color: var(--muted);
  }
  .left {
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    white-space: nowrap;
  }
  .left.low {
    color: var(--accent);
  }
  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 8px;
    border-radius: 8px;
    font-size: 13px;
    color: var(--text);
    cursor: pointer;
    text-align: left;
  }
  .item :global(svg) {
    color: var(--muted);
  }
  .item:hover:not(.static) {
    background: var(--raise-2);
  }
  .item.static {
    cursor: default;
  }
  .item.update {
    color: var(--accent);
    font-weight: 600;
  }
  .item.update :global(svg) {
    color: var(--accent);
  }
  .ext {
    margin-left: auto;
    display: grid;
  }
  .sep {
    height: 1px;
    background: var(--border);
    margin: 4px 0;
  }
  .switch {
    appearance: none;
    margin-left: auto;
    width: 32px;
    height: 18px;
    border-radius: 9px;
    background: var(--raise-2);
    border: 1px solid var(--border-strong);
    position: relative;
    padding: 0;
    cursor: pointer;
  }
  .switch::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--muted);
    transition: transform 0.15s;
  }
  .switch:checked {
    background: var(--accent);
    border-color: var(--accent);
  }
  .switch:checked::after {
    transform: translateX(14px);
    background: var(--accent-ink);
  }
  .zoom {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-variant-numeric: tabular-nums;
    font-size: 12.5px;
  }
  .zoom button {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    display: grid;
    place-items: center;
    background: var(--raise);
  }
  .zoom button:hover:not(:disabled) {
    background: var(--raise-2);
  }
  .zoom button:disabled {
    opacity: 0.4;
  }
  .opacity input {
    margin-left: auto;
    width: 118px;
    accent-color: var(--accent);
    cursor: pointer;
  }
  .pct {
    width: 34px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-size: 12.5px;
  }
</style>
