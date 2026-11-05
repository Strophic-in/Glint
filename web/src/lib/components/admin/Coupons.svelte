<script lang="ts">
  import { onMount } from 'svelte';
  import { api, errorMessage, type AdminCoupon } from '$lib/api';
  import { toasts } from '$lib/toast.svelte';
  import { formatDate, formatINR } from '$lib/format';
  import { FALLBACK_PLANS } from '$lib/plans';

  let coupons = $state<AdminCoupon[] | null>(null);
  let error = $state('');
  let busy = $state(false);

  // New coupon form
  let code = $state('');
  let kind = $state<'percent' | 'flat'>('percent');
  let value = $state(20);
  let maxUses = $state<number | null>(null);
  let oncePerUser = $state(true);
  let planIds = $state<string[]>([]);
  let expires = $state('');
  let note = $state('');
  let isPublic = $state(false);
  let publicText = $state('');

  const PLANS = FALLBACK_PLANS.plans;

  async function load() {
    try {
      coupons = (await api.admin.coupons()).coupons;
      error = '';
    } catch (e) {
      error = errorMessage(e);
    }
  }

  async function create(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    try {
      await api.admin.createCoupon({
        code: code.trim().toUpperCase(),
        kind,
        // Flat amounts are entered in rupees, stored in paise.
        value: kind === 'flat' ? Math.round(Number(value) * 100) : Number(value),
        max_uses: maxUses || null,
        once_per_user: oncePerUser,
        plan_ids: planIds.length ? planIds : null,
        expires_at: expires ? new Date(`${expires}T23:59:59`).getTime() : null,
        note: note.trim() || null,
        public: isPublic,
        public_text: isPublic ? publicText.trim() || null : null
      });
      toasts.ok(`Coupon ${code.trim().toUpperCase()} created.`);
      code = '';
      note = '';
      expires = '';
      maxUses = null;
      planIds = [];
      isPublic = false;
      publicText = '';
      await load();
    } catch (err) {
      toasts.error(errorMessage(err));
    } finally {
      busy = false;
    }
  }

  async function toggle(c: AdminCoupon) {
    try {
      await api.admin.updateCoupon(c.code, { active: !c.active });
      toasts.ok(`${c.code} ${c.active ? 'disabled' : 'enabled'}.`);
      await load();
    } catch (e) {
      toasts.error(errorMessage(e));
    }
  }

  async function togglePublic(c: AdminCoupon) {
    try {
      await api.admin.updateCoupon(c.code, { public: !c.public });
      toasts.ok(c.public ? `${c.code} is no longer shown on the website.` : `${c.code} is now shown on the website.`);
      await load();
    } catch (e) {
      toasts.error(errorMessage(e));
    }
  }

  // Edit the banner text in place.
  let editing = $state<string | null>(null);
  let editText = $state('');
  async function saveText(c: AdminCoupon) {
    try {
      await api.admin.updateCoupon(c.code, { public_text: editText.trim() || null });
      toasts.ok('Banner text saved.');
      editing = null;
      await load();
    } catch (e) {
      toasts.error(errorMessage(e));
    }
  }

  let confirmDelete = $state<string | null>(null);
  async function remove(c: AdminCoupon) {
    if (confirmDelete !== c.code) {
      confirmDelete = c.code;
      return;
    }
    try {
      await api.admin.deleteCoupon(c.code);
      toasts.ok(`${c.code} deleted.`);
      confirmDelete = null;
      await load();
    } catch (e) {
      toasts.error(errorMessage(e));
    }
  }

  const label = (c: AdminCoupon) => (c.kind === 'percent' ? `${c.value}% off` : `${formatINR(c.value / 100)} off`);
  const planNames = (ids: string[] | null) =>
    ids?.length ? ids.map((id) => PLANS.find((p) => p.id === id)?.name ?? id).join(', ') : 'All plans';
  const expired = (c: AdminCoupon) => !!c.expires_at && c.expires_at < Date.now();

  onMount(load);
</script>

<form class="card new" onsubmit={create}>
  <h3>New coupon</h3>
  <div class="fields">
    <label class="f">
      <span>Code</span>
      <input class="input mono" bind:value={code} placeholder="LAUNCH20" required pattern="[A-Za-z0-9_\-]{'{'}3,32{'}'}" maxlength="32" />
    </label>
    <label class="f">
      <span>Type</span>
      <select class="input" bind:value={kind}>
        <option value="percent">Percent off</option>
        <option value="flat">Flat ₹ off</option>
      </select>
    </label>
    <label class="f">
      <span>{kind === 'percent' ? 'Percent' : 'Rupees'}</span>
      <input class="input" type="number" min="1" max={kind === 'percent' ? 100 : 100000} step="1" bind:value required />
    </label>
    <label class="f">
      <span>Max uses <em>(blank = unlimited)</em></span>
      <input class="input" type="number" min="1" bind:value={maxUses} />
    </label>
    <label class="f">
      <span>Expires <em>(optional)</em></span>
      <input class="input" type="date" bind:value={expires} />
    </label>
    <label class="f">
      <span>Note <em>(only you see it)</em></span>
      <input class="input" bind:value={note} maxlength="200" placeholder="Launch campaign" />
    </label>
  </div>
  <div class="opts">
    <span class="muted">Plans:</span>
    {#each PLANS as p}
      <label class="chk"><input type="checkbox" value={p.id} bind:group={planIds} /> {p.name}</label>
    {/each}
    <span class="muted hint">{planIds.length ? '' : '(none ticked = all plans)'}</span>
    <label class="chk once"><input type="checkbox" bind:checked={oncePerUser} /> Once per user</label>
  </div>
  <div class="public">
    <label class="chk"><input type="checkbox" bind:checked={isPublic} /> <b>Show on website</b> <span class="muted">(pricing and dashboard banner)</span></label>
    {#if isPublic}
      <input class="input" bind:value={publicText} maxlength="140" placeholder="Dussehra Sale: 30% off every plan" />
    {/if}
  </div>
  <button class="btn btn-sm btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create coupon'}</button>
</form>

{#if error}
  <p class="muted">{error}</p>
{:else if !coupons}
  <p class="muted">Loading…</p>
{:else}
  <div class="card">
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr><th>Code</th><th>Discount</th><th>Plans</th><th>Used</th><th>Given away</th><th>Expires</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {#each coupons as c (c.code)}
            <tr class:off={!c.active || expired(c)}>
              <td>
                <span class="mono code">{c.code}</span>
                {#if c.public}<span class="badge badge-ok pub">On website</span>{/if}
                {#if c.note}<div class="muted small">{c.note}</div>{/if}
                {#if c.public}
                  {#if editing === c.code}
                    <div class="edit-text">
                      <input class="input" bind:value={editText} maxlength="140" placeholder="Banner text" />
                      <button class="btn btn-sm btn-primary" onclick={() => saveText(c)}>Save</button>
                      <button class="btn btn-sm btn-ghost" onclick={() => (editing = null)}>Cancel</button>
                    </div>
                  {:else}
                    <button class="banner-text" onclick={() => { editing = c.code; editText = c.public_text ?? ''; }} title="Edit banner text">
                      “{c.public_text || label(c)}” ✎
                    </button>
                  {/if}
                {/if}
              </td>
              <td>{label(c)}{c.once_per_user ? '' : ' · reusable'}</td>
              <td>{planNames(c.plan_ids)}</td>
              <td class="num">{c.uses}{c.max_uses ? ` / ${c.max_uses}` : ''}</td>
              <td class="num">{formatINR(c.discount_total_paise / 100)}</td>
              <td>{c.expires_at ? formatDate(c.expires_at) : '—'}</td>
              <td>
                {#if expired(c)}<span class="badge">Expired</span>
                {:else if c.active}<span class="badge badge-ok">Active</span>
                {:else}<span class="badge">Disabled</span>{/if}
              </td>
              <td class="actions">
                <button class="btn btn-sm btn-ghost" onclick={() => togglePublic(c)}>{c.public ? 'Hide from site' : 'Show on site'}</button>
                <button class="btn btn-sm btn-ghost" onclick={() => toggle(c)}>{c.active ? 'Disable' : 'Enable'}</button>
                <button class="btn btn-sm btn-ghost del" onclick={() => remove(c)}>{confirmDelete === c.code ? 'Confirm delete' : 'Delete'}</button>
              </td>
            </tr>
          {:else}
            <tr><td colspan="8" class="muted empty">No coupons yet. Create one above.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{/if}

<style>
  .new {
    padding: 20px 22px;
    display: grid;
    gap: 14px;
    margin-bottom: 16px;
  }
  h3 {
    font-size: 16px;
  }
  .fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 12px;
  }
  .f {
    display: grid;
    gap: 6px;
    font-size: 13.5px;
    font-weight: 600;
  }
  .f em {
    font-style: normal;
    font-weight: 400;
    color: var(--faint);
  }
  .f .input {
    height: 40px;
    font-weight: 400;
  }
  .opts {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    align-items: center;
    font-size: 14px;
  }
  .chk {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    cursor: pointer;
  }
  .chk input {
    accent-color: var(--accent);
  }
  .once {
    margin-left: auto;
  }
  .hint {
    font-size: 13px;
  }
  .public {
    display: grid;
    gap: 8px;
    font-size: 14px;
  }
  .public .input {
    height: 40px;
    max-width: 520px;
  }
  .pub {
    margin-left: 6px;
  }
  .banner-text {
    display: block;
    margin-top: 4px;
    font-size: 12.5px;
    color: var(--accent);
    text-align: left;
    cursor: pointer;
  }
  .edit-text {
    display: flex;
    gap: 6px;
    margin-top: 6px;
  }
  .edit-text .input {
    height: 32px;
    min-width: 200px;
  }
  .new .btn {
    justify-self: start;
  }
  .mono {
    font-family: var(--mono);
  }
  .code {
    font-weight: 600;
    letter-spacing: 0.04em;
  }
  .small {
    font-size: 12.5px;
  }
  .num {
    font-variant-numeric: tabular-nums;
  }
  tr.off td {
    opacity: 0.55;
  }
  .actions {
    white-space: nowrap;
    text-align: right;
  }
  .del {
    color: var(--danger);
  }
  .empty {
    text-align: center;
    padding: 28px;
  }
</style>
