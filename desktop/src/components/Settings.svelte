<script lang="ts">
  import { onMount } from 'svelte';
  import { glint } from '../lib/store.svelte';
  import { settings, DEFAULT_BINDINGS } from '../lib/settings.svelte';
  import { ipc } from '../lib/ipc';
  import { accelFromEvent } from '../lib/keys';
  import { formatLeft } from '../lib/time';
  import Icon from './Icon.svelte';
  import Keys from './Keys.svelte';

  let mics = $state<string[]>([]);
  let outputs = $state<string[]>([]);
  let recording = $state<string | null>(null);

  const SHORTCUTS: { key: string; label: string }[] = [
    { key: 'answer', label: 'Answer now' },
    { key: 'screen', label: 'Solve screen' },
    { key: 'listen', label: 'Start / stop listening' },
    { key: 'type', label: 'Type a question' },
    { key: 'toggle', label: 'Collapse / expand Glint' },
    { key: 'scroll_up', label: 'Scroll answer up' },
    { key: 'scroll_down', label: 'Scroll answer down' },
  ];

  onMount(() => {
    ipc.listMics().then((m) => (mics = m));
    ipc.listOutputs().then((o) => (outputs = o));
    glint.startTyping(false); // settings needs keyboard focus
    return () => {
      stopRecording();
      glint.stopTyping();
    };
  });

  async function record(key: string) {
    recording = key;
    await ipc.suspendShortcuts(true);
  }

  async function stopRecording() {
    if (recording === null) return;
    recording = null;
    await ipc.suspendShortcuts(false);
  }

  function onKeydown(e: KeyboardEvent) {
    if (!recording) {
      if (e.key === 'Escape') glint.view = 'main';
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') return stopRecording();
    const accel = accelFromEvent(e);
    if (!accel) return;
    settings.bindings = { ...settings.bindings, [recording]: accel };
    stopRecording();
  }

  function fmtDate(ms: number | null) {
    return ms ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  }

</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<section class="panel settings" onpointerdown={() => !glint.typing && glint.startTyping(false)}>
  <header>
    <button class="back" onclick={() => (glint.view = 'main')}><Icon name="back" size={15} /> Back</button>
    <h2>Settings</h2>
    <span class="ver">v{glint.version}</span>
  </header>

  <div class="scroll body">
    <div class="group">
      <h3>Answers</h3>
      <button class="ghost wide-btn" onclick={() => (glint.view = 'session')}>
        <Icon name="briefcase" size={14} /> Session type, company, resume, model and language →
      </button>
      <label class="toggle">
        <input type="checkbox" bind:checked={settings.autoAnswer} />
        <span><b>Auto-answer</b> when the other person asks a question</span>
      </label>
      <label class="toggle">
        <input type="checkbox" bind:checked={settings.screen} />
        <span><b>Include my screen</b> with Answer and typed questions</span>
      </label>
    </div>

    <div class="group">
      <h3>Audio</h3>
      <label class="toggle">
        <input type="checkbox" bind:checked={settings.system} />
        <span><b>System audio</b> · the other side of the call (Zoom, Meet, Teams, browser)</span>
      </label>
      {#if settings.system}
        <select class="wide" bind:value={settings.speakerDevice} title="Pick the device your call app plays through">
          <option value="">Default speakers / headphones</option>
          {#each outputs as o}<option value={o}>{o}</option>{/each}
        </select>
      {/if}
      <label class="toggle">
        <input type="checkbox" bind:checked={settings.mic} />
        <span><b>My microphone</b> · so answers know what you already said</span>
      </label>
      {#if settings.mic}
        <select class="wide" bind:value={settings.micDevice}>
          <option value="">Default microphone</option>
          {#each mics as m}<option value={m}>{m}</option>{/each}
        </select>
      {/if}
      {#if glint.listen === 'live'}<p class="note">Changes apply next time you start listening.</p>{/if}
    </div>

    <div class="group">
      <h3>Privacy & look</h3>
      <label class="toggle">
        <input type="checkbox" bind:checked={settings.protected} />
        <span><b>Hide Glint from screen share</b> and recordings</span>
      </label>
      <label class="slider">
        <span>Opacity</span>
        <input type="range" min="0.6" max="1" step="0.02" bind:value={settings.opacity} />
        <span class="val">{Math.round(settings.opacity * 100)}%</span>
      </label>
    </div>

    <div class="group">
      <h3>Shortcuts <button class="link" onclick={() => (settings.bindings = { ...DEFAULT_BINDINGS })}>Reset</button></h3>
      <ul class="keys">
        {#each SHORTCUTS as s}
          <li>
            <span>{s.label}</span>
            <button class="bind" class:rec={recording === s.key} onclick={() => record(s.key)}>
              {#if recording === s.key}Press keys… (Esc to cancel){:else}<Keys accel={settings.bindings[s.key]} />{/if}
            </button>
            {#if glint.shortcutErrors[s.key]}<em class="bad" title={glint.shortcutErrors[s.key]}>In use by another app</em>{/if}
          </li>
        {/each}
      </ul>
    </div>

    <div class="group account">
      <h3>Account</h3>
      <div class="who">
        {#if glint.user?.picture}<img src={glint.user.picture} alt="" referrerpolicy="no-referrer" />{/if}
        <div>
          <div>{glint.user?.email}</div>
          <div class="sub">{formatLeft(glint.balance)} left · valid till {fmtDate(glint.expiresAt)}</div>
        </div>
      </div>
      <div class="row">
        <button class="primary" onclick={() => glint.buy()}>Add hours</button>
        <button class="ghost" onclick={() => glint.signOut()}><Icon name="logout" size={14} /> Sign out</button>
        <button class="ghost" onclick={() => ipc.quit()}><Icon name="power" size={14} /> Quit Glint</button>
      </div>
    </div>
  </div>
</section>

<style>
  .settings {
    margin-top: 6px;
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
  }
  h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 650;
  }
  .ver {
    margin-left: auto;
    color: var(--faint);
    font-size: 11px;
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    font-size: 12.5px;
    padding: 4px 8px;
    border-radius: 8px;
  }
  .back:hover {
    background: var(--raise-2);
    color: var(--text);
  }
  .body {
    max-height: 520px;
    padding: 6px 16px 16px;
  }
  .group {
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
    display: grid;
    gap: 9px;
  }
  .group:last-child {
    border-bottom: 0;
  }
  h3 {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--faint);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    color: var(--muted);
    cursor: pointer;
  }
  .toggle b {
    color: var(--text);
    font-weight: 600;
  }
  .toggle input {
    appearance: none;
    flex: none;
    width: 32px;
    height: 18px;
    border-radius: 9px;
    background: var(--raise-2);
    border: 1px solid var(--border-strong);
    position: relative;
    padding: 0;
    cursor: pointer;
    transition: background 0.15s;
  }
  .toggle input::after {
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
  .toggle input:checked {
    background: var(--accent);
    border-color: var(--accent);
  }
  .toggle input:checked::after {
    transform: translateX(14px);
    background: var(--accent-ink);
  }
  .wide {
    width: 100%;
  }
  .wide-btn {
    justify-content: flex-start;
    border: 1px solid var(--border);
  }
  .note {
    margin: 0;
    font-size: 12px;
    color: var(--faint);
  }
  .slider {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--muted);
  }
  .slider input {
    flex: 1;
    padding: 0;
    accent-color: var(--accent);
    background: none;
    border: 0;
  }
  .val {
    width: 38px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .keys {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  .keys li {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }
  .keys li > span {
    width: 170px;
    color: var(--muted);
  }
  .bind {
    min-width: 130px;
    padding: 4px 8px;
    border-radius: 8px;
    border: 1px solid var(--border);
    text-align: left;
  }
  .bind:hover {
    border-color: var(--border-strong);
  }
  .bind.rec {
    border-color: var(--accent);
    color: var(--accent);
    font-size: 12px;
  }
  .bad {
    font-style: normal;
    font-size: 12px;
    color: #ff9ea1;
  }
  .link {
    text-transform: none;
    letter-spacing: 0;
    font-weight: 550;
    color: var(--accent);
    font-size: 12px;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .who img {
    width: 32px;
    height: 32px;
    border-radius: 50%;
  }
  .sub {
    color: var(--muted);
    font-size: 12.5px;
  }
  .primary {
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 650;
    padding: 6px 14px;
    border-radius: 9px;
  }
  .ghost {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    padding: 6px 12px;
    border-radius: 9px;
  }
  .ghost:hover {
    background: var(--raise-2);
    color: var(--text);
  }
</style>
