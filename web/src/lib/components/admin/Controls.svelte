<script lang="ts">
  import { onMount } from 'svelte';
  import { api, errorMessage, type CatalogModel, type RuntimeConfig } from '$lib/api';
  import { toasts } from '$lib/toast.svelte';

  let cfg = $state<RuntimeConfig | null>(null);
  let models = $state<CatalogModel[]>([]);
  let error = $state('');
  let saving = $state(false);
  // Edited in friendly units.
  let trialMin = $state(0);
  let answerSec = $state(0);
  let idleMin = $state(0);
  let message = $state('');

  function adopt(r: { config: RuntimeConfig; models: CatalogModel[] }) {
    cfg = r.config;
    models = r.models;
    trialMin = Math.round(r.config.trial_seconds / 60);
    answerSec = r.config.answer_seconds;
    idleMin = Math.round(r.config.idle_timeout_s / 60);
    message = r.config.maintenance_message;
  }

  async function save(patch: Partial<RuntimeConfig>, done = 'Saved.') {
    saving = true;
    try {
      adopt(await api.admin.setConfig(patch));
      toasts.ok(done);
    } catch (e) {
      toasts.error(errorMessage(e));
    } finally {
      saving = false;
    }
  }

  function toggleModel(id: string, on: boolean) {
    if (!cfg) return;
    const next = on ? [...new Set([...cfg.allowed_models, id])] : cfg.allowed_models.filter((m) => m !== id);
    if (!next.length) return toasts.error('Keep at least one model.');
    const patch: Partial<RuntimeConfig> = { allowed_models: next };
    if (!next.includes(cfg.default_model)) patch.default_model = next[0];
    save(patch);
  }

  onMount(async () => {
    try {
      adopt(await api.admin.config());
    } catch (e) {
      error = errorMessage(e);
    }
  });
</script>

{#if error}
  <p class="muted">{error}</p>
{:else if !cfg}
  <p class="muted">Loading…</p>
{:else}
  <div class="grid">
    <section class="card box" class:alert={cfg.maintenance}>
      <h3>Maintenance mode</h3>
      <p class="muted small">Stops answers and live sessions for everyone except admins and shows this message.</p>
      <textarea class="input area" rows="2" maxlength="500" bind:value={message}></textarea>
      <div class="row">
        {#if cfg.maintenance}
          <button class="btn btn-sm btn-primary" disabled={saving} onclick={() => save({ maintenance: false }, 'Glint is back on.')}>Turn off maintenance</button>
        {:else}
          <button class="btn btn-sm danger" disabled={saving} onclick={() => save({ maintenance: true, maintenance_message: message }, 'Maintenance mode on.')}>Turn on maintenance</button>
        {/if}
        <button class="btn btn-sm btn-ghost" disabled={saving || message === cfg.maintenance_message} onclick={() => save({ maintenance_message: message })}>Save message</button>
      </div>
    </section>

    <section class="card box">
      <h3>Sign-ups</h3>
      <p class="muted small">When closed, existing users can still sign in. New accounts are refused.</p>
      <div class="row">
        <span class="badge" class:badge-ok={cfg.signups_open}>{cfg.signups_open ? 'Open' : 'Closed'}</span>
        <button class="btn btn-sm" disabled={saving} onclick={() => save({ signups_open: !cfg!.signups_open })}>
          {cfg.signups_open ? 'Close sign-ups' : 'Open sign-ups'}
        </button>
      </div>
    </section>

    <section class="card box">
      <h3>Billing rules</h3>
      <label class="field">
        <span>Free trial for new users</span>
        <span class="row"><input class="input" type="number" min="0" max="600" bind:value={trialMin} /> minutes</span>
      </label>
      <label class="field">
        <span>Charge per answer outside a live session</span>
        <span class="row"><input class="input" type="number" min="0" max="600" bind:value={answerSec} /> seconds</span>
      </label>
      <label class="field">
        <span>Auto-pause after silence</span>
        <span class="row"><input class="input" type="number" min="1" max="120" bind:value={idleMin} /> minutes</span>
      </label>
      <button
        class="btn btn-sm btn-primary"
        disabled={saving}
        onclick={() => save({ trial_seconds: trialMin * 60, answer_seconds: answerSec, idle_timeout_s: idleMin * 60 })}
      >Save billing rules</button>
    </section>

    <section class="card box">
      <h3>AI models users can pick</h3>
      <ul class="models">
        {#each models as m}
          <li>
            <label>
              <input type="checkbox" checked={m.allowed} disabled={saving} onchange={(e) => toggleModel(m.id, e.currentTarget.checked)} />
              <span>{m.label}</span>
            </label>
            {#if !m.accessible}<span class="badge bad" title="The server's OpenAI project can't use this model yet">No OpenAI access</span>{/if}
            {#if cfg.default_model === m.id}
              <span class="badge badge-accent">Default</span>
            {:else if m.allowed && m.accessible}
              <button class="btn btn-sm btn-ghost" disabled={saving} onclick={() => save({ default_model: m.id })}>Make default</button>
            {/if}
          </li>
        {/each}
      </ul>
      <p class="muted small">Models without OpenAI access are hidden from users automatically.</p>
    </section>
  </div>
{/if}

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 14px;
  }
  .box {
    padding: 20px 22px;
    display: grid;
    gap: 12px;
    align-content: start;
  }
  .box.alert {
    border-color: rgba(255, 107, 107, 0.45);
  }
  h3 {
    font-size: 16px;
  }
  .small {
    font-size: 13.5px;
    margin: 0;
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .field {
    display: grid;
    gap: 6px;
    font-size: 14px;
  }
  .field .input {
    width: 110px;
    height: 38px;
  }
  .area {
    height: auto;
    padding: 10px 14px;
    resize: vertical;
    font: inherit;
  }
  .danger {
    background: rgba(255, 107, 107, 0.14);
    border-color: rgba(255, 107, 107, 0.35);
    color: var(--danger);
  }
  .models {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .models li {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .models label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 550;
    cursor: pointer;
  }
  .models input {
    accent-color: var(--accent);
    width: 16px;
    height: 16px;
  }
  .badge.bad {
    background: rgba(255, 107, 107, 0.12);
    border-color: rgba(255, 107, 107, 0.3);
    color: var(--danger);
  }
</style>
