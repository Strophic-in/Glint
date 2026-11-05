<script lang="ts">
  // Offers the admin marked "Show on website": banner text, the code to copy, and (on the
  // dashboard) a one-click Apply. Renders nothing when there is no live offer.
  import { onMount } from 'svelte';
  import { api, type PublicCoupon } from '$lib/api';
  import { formatDate } from '$lib/format';
  import { FALLBACK_PLANS } from '$lib/plans';

  let { onapply, applied = '' }: { onapply?: (code: string) => void; applied?: string } = $props();

  let coupons = $state<PublicCoupon[]>([]);
  let copied = $state('');

  onMount(() => {
    api
      .publicCoupons()
      .then((r) => (coupons = r.coupons))
      .catch(() => {}); // offers are a bonus; the page works without them
  });

  function copy(code: string) {
    navigator.clipboard?.writeText(code);
    copied = code;
    setTimeout(() => copied === code && (copied = ''), 1500);
  }

  const plansText = (ids: string[] | null) =>
    ids?.length
      ? `on ${ids.map((id) => FALLBACK_PLANS.plans.find((p) => p.id === id)?.name ?? id).join(' & ')}`
      : '';
</script>

{#each coupons as c (c.code)}
  <div class="promo" role="note">
    <span class="spark" aria-hidden="true">✦</span>
    <div class="text">
      <b>{c.text}</b>
      <span class="meta">
        {c.label}
        {plansText(c.plan_ids)}{c.expires_at ? ` · ends ${formatDate(c.expires_at)}` : ''}
      </span>
    </div>
    <div class="actions">
      <button class="code" onclick={() => copy(c.code)} title="Copy code">
        <span class="mono">{c.code}</span>
        <span class="copy">{copied === c.code ? 'Copied' : 'Copy'}</span>
      </button>
      {#if onapply}
        <button class="btn btn-sm btn-primary" disabled={applied === c.code} onclick={() => onapply(c.code)}>
          {applied === c.code ? 'Applied' : 'Apply'}
        </button>
      {/if}
    </div>
  </div>
{/each}

<style>
  .promo {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    margin: 0 auto 18px;
    padding: 14px 16px;
    border-radius: var(--radius);
    border: 1px solid rgba(245, 184, 61, 0.45);
    background: linear-gradient(100deg, rgba(245, 184, 61, 0.16), rgba(245, 184, 61, 0.04) 70%);
  }
  .spark {
    color: var(--accent);
    font-size: 20px;
    line-height: 1;
  }
  .text {
    flex: 1;
    min-width: 200px;
    display: grid;
    gap: 2px;
  }
  .text b {
    font-size: 16px;
    color: var(--text);
  }
  .meta {
    font-size: 13px;
    color: var(--muted);
  }
  .actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .code {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    height: 34px;
    padding: 0 6px 0 12px;
    border-radius: var(--radius-sm);
    border: 1px dashed var(--accent);
    background: var(--bg);
    color: var(--text);
    cursor: pointer;
  }
  .mono {
    font-family: var(--mono);
    font-weight: 600;
    letter-spacing: 0.06em;
  }
  .copy {
    font-size: 12px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 6px;
    background: var(--accent-soft);
    color: var(--accent);
  }
</style>
