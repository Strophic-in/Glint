<script lang="ts">
  // Session setup: what kind of call this is, the details that make answers specific,
  // and documents (resume, notes) answers should be grounded in. Everything stays on this PC
  // until it's sent as context with an answer.
  import { onMount } from 'svelte';
  import { glint } from '../lib/store.svelte';
  import { settings, MODES, LANGUAGES } from '../lib/settings.svelte';
  import { ipc, errorMessage } from '../lib/ipc';
  import Icon from './Icon.svelte';
  import Keys from './Keys.svelte';
  import ModelPicker from './ModelPicker.svelte';

  let adding = $state(false);
  let docError = $state('');

  const mode = $derived(MODES.find((m) => m.id === settings.mode) ?? MODES[0]);
  const live = $derived(glint.listen === 'live' || glint.listen === 'connecting' || glint.listen === 'reconnecting');

  onMount(() => {
    glint.startTyping(false); // the form needs keyboard focus
    return () => glint.stopTyping();
  });

  async function addDoc(kind: 'resume' | 'doc') {
    docError = '';
    adding = true;
    try {
      const d = await ipc.pickDocument();
      if (!d) return;
      const doc = { id: crypto.randomUUID(), kind, name: d.name, text: d.text, chars: d.chars };
      // One resume at a time: a new one replaces the old.
      settings.docs = kind === 'resume' ? [doc, ...settings.docs.filter((x) => x.kind !== 'resume')] : [...settings.docs, doc];
      if (d.truncated) docError = `${d.name} is long, so Glint uses the first ${d.chars.toLocaleString()} characters.`;
    } catch (e) {
      docError = errorMessage(e);
    } finally {
      adding = false;
      glint.startTyping(false); // the file dialog took focus
    }
  }

  function removeDoc(id: string) {
    settings.docs = settings.docs.filter((d) => d.id !== id);
  }

  async function start() {
    glint.view = 'main';
    if (!live) await glint.toggleListen();
  }

  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<section class="panel session" onpointerdown={() => !glint.typing && glint.startTyping(false)}>
  <header>
    <button class="back" onclick={() => (glint.view = 'main')}><Icon name="back" size={15} /> Back</button>
    <h2>Session</h2>
  </header>

  <div class="scroll body">
    <div class="types" role="tablist">
      {#each MODES as m}
        <button role="tab" aria-selected={settings.mode === m.id} class:on={settings.mode === m.id} onclick={() => (settings.mode = m.id)}>
          <Icon name={m.icon} size={15} />
          {m.label}
        </button>
      {/each}
    </div>
    <p class="intro">{mode.intro}</p>

    {#if mode.fields.length}
      <div class="grid">
        {#each mode.fields as f}
          <label class="field" class:wide={f.long}>
            <span>{f.label} <em>optional</em></span>
            {#if f.long}
              <textarea rows="2" maxlength="1500" placeholder={f.placeholder} bind:value={settings.session[f.key]}></textarea>
            {:else}
              <input maxlength="120" placeholder={f.placeholder} bind:value={settings.session[f.key]} />
            {/if}
          </label>
        {/each}
      </div>
    {/if}

    <div class="grid">
      <label class="field">
        <span>Answer language</span>
        <select bind:value={settings.language}>
          {#each LANGUAGES as l}<option>{l}</option>{/each}
        </select>
      </label>
      <div class="field">
        <span>AI model</span>
        <ModelPicker />
      </div>
    </div>

    <div class="field">
      <span>
        {settings.mode === 'interview' ? 'Resume and reference docs' : 'Reference docs'}
        <em>PDF, DOCX, TXT · read on this PC</em>
      </span>
      {#if settings.docs.length}
        <ul class="docs">
          {#each settings.docs as d (d.id)}
            <li>
              <Icon name="file" size={15} />
              <span class="dname" title={d.name}>{d.name}</span>
              {#if d.kind === 'resume'}<span class="kind">Resume</span>{/if}
              <span class="size">{fmt(d.chars)} chars</span>
              <button onclick={() => removeDoc(d.id)} title="Remove" aria-label="Remove {d.name}"><Icon name="x" size={13} /></button>
            </li>
          {/each}
        </ul>
      {/if}
      <div class="row">
        {#if settings.mode === 'interview'}
          <button class="add" onclick={() => addDoc('resume')} disabled={adding}><Icon name="plus" size={14} /> {settings.docs.some((d) => d.kind === 'resume') ? 'Replace resume' : 'Add resume'}</button>
        {/if}
        <button class="add" onclick={() => addDoc('doc')} disabled={adding}><Icon name="plus" size={14} /> Add document</button>
      </div>
      {#if docError}<p class="note">{docError}</p>{/if}
    </div>

    <label class="field">
      <span>Notes for Glint <em>used in every answer</em></span>
      <textarea rows="3" maxlength="4000" placeholder={mode.placeholder} bind:value={settings.context}></textarea>
    </label>

    <button class="start" onclick={start}>
      {#if live}
        Done
      {:else}
        Start listening <Keys accel={settings.bindings.listen} />
      {/if}
    </button>
  </div>
</section>

<style>
  .session {
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
    max-height: 560px;
    padding: 14px 16px 16px;
    display: grid;
    gap: 14px;
  }
  .types {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 4px;
    padding: 3px;
    background: var(--raise);
    border: 1px solid var(--border);
    border-radius: 11px;
  }
  .types button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 7px 4px;
    border-radius: 8px;
    font-size: 12.5px;
    font-weight: 550;
    color: var(--muted);
  }
  .types button:hover:not(.on) {
    color: var(--text);
  }
  .types button.on {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .intro {
    margin: -6px 0 0;
    color: var(--muted);
    font-size: 12.5px;
    text-align: center;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    align-items: start;
  }
  .field {
    display: grid;
    gap: 6px;
  }
  .field.wide {
    grid-column: 1 / -1;
  }
  .field > span {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text);
  }
  .field em {
    font-style: normal;
    font-weight: 400;
    color: var(--faint);
    margin-left: 4px;
  }
  .docs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  .docs li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 8px;
    background: var(--raise);
    border: 1px solid var(--border);
    font-size: 12.5px;
  }
  .docs :global(svg) {
    color: var(--muted);
    flex: none;
  }
  .dname {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .kind {
    font-size: 10.5px;
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-soft);
    padding: 1px 7px;
    border-radius: 10px;
  }
  .size {
    margin-left: auto;
    color: var(--faint);
    white-space: nowrap;
  }
  .docs button {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    display: grid;
    place-items: center;
    color: var(--faint);
  }
  .docs button:hover {
    background: var(--raise-2);
    color: var(--text);
  }
  .row {
    display: flex;
    gap: 8px;
  }
  .add {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px dashed var(--border-strong);
    color: var(--muted);
    font-size: 12.5px;
  }
  .add:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--accent);
  }
  .note {
    margin: 0;
    font-size: 12px;
    color: var(--faint);
  }
  .start {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    height: 40px;
    border-radius: 11px;
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 650;
  }
  .start:hover {
    background: #ffc65a;
  }
  .start :global(kbd) {
    background: rgba(0, 0, 0, 0.12);
    border-color: rgba(0, 0, 0, 0.15);
    color: var(--accent-ink);
  }
</style>
