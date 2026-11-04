<script lang="ts">
  import type { CouponQuote, Plan, PlansResponse } from '$lib/api';
  import { formatDuration, formatINR } from '$lib/format';
  import { paidPlans, perHour } from '$lib/plans';

  let {
    data,
    mode = 'link',
    onbuy,
    busyId = null,
    showTrial = true,
    quote = null
  }: {
    data: PlansResponse;
    mode?: 'link' | 'buy';
    onbuy?: (plan: Plan) => void;
    busyId?: string | null;
    showTrial?: boolean;
    /** Applied coupon: eligible plans show the discounted price. */
    quote?: CouponQuote | null;
  } = $props();

  const plans = $derived(paidPlans(data));
  const cols = $derived(plans.length + (showTrial ? 1 : 0));
</script>

<div class="grid" style:--cols={cols}>
  {#if showTrial}
    <article class="plan card">
      <header>
        <h3>Free trial</h3>
      </header>
      <div class="price">
        <span class="amt">₹0</span>
      </div>
      <p class="time">{formatDuration(data.trial_seconds)} included</p>
      <p class="tag muted">Try it on a real call. No card needed.</p>
      <ul>
        <li>Everything in paid plans</li>
        <li>Google sign-in, 30 seconds to set up</li>
      </ul>
      <a class="btn btn-block" href="/login?next=/dashboard">Start free</a>
    </article>
  {/if}

  {#each plans as plan (plan.id)}
    {@const q = quote?.plans.find((p) => p.plan_id === plan.id && p.eligible)}
    <article class="plan card" class:featured={!!plan.badge && plan.id === 'pro'}>
      <header>
        <h3>{plan.name}</h3>
        {#if plan.badge}<span class="badge badge-accent">{plan.badge}</span>{/if}
      </header>
      <div class="price">
        {#if q}
          <span class="amt">{formatINR(q.final_paise / 100)}</span>
          <s class="was muted">{formatINR(plan.price_inr)}</s>
          <span class="badge badge-ok">{quote?.code}</span>
        {:else}
          <span class="amt">{formatINR(plan.price_inr)}</span>
        {/if}
      </div>
      <p class="time">{formatDuration(plan.seconds)} <span class="muted">· {formatINR(perHour(plan))}/hr</span></p>
      <p class="tag muted">{plan.tagline}</p>
      <ul>
        <li>Live captions for both sides</li>
        <li>Screen-aware answers</li>
        <li>Billed per second, only while live</li>
        <li>Valid {data.validity_days} days</li>
      </ul>
      {#if mode === 'buy'}
        <button
          class="btn btn-block"
          class:btn-primary={plan.id === 'pro'}
          disabled={busyId !== null}
          onclick={() => onbuy?.(plan)}
        >
          {busyId === plan.id ? 'Opening checkout…' : `Buy ${formatDuration(plan.seconds)}`}
        </button>
      {:else}
        <a class="btn btn-block" class:btn-primary={plan.id === 'pro'} href="/login?next=/dashboard">
          Get {plan.name}
        </a>
      {/if}
    </article>
  {/each}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
  }
  @media (min-width: 640px) {
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (min-width: 1000px) {
    .grid {
      grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    }
  }
  .plan {
    display: flex;
    flex-direction: column;
    padding: 24px 22px;
    min-width: 0;
  }
  .plan.featured {
    border-color: rgba(245, 184, 61, 0.45);
    background:
      radial-gradient(120% 60% at 50% 0%, rgba(245, 184, 61, 0.1), transparent 70%),
      var(--surface);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 26px;
  }
  h3 {
    font-size: 17px;
    font-weight: 600;
  }
  .price {
    margin-top: 16px;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 8px;
  }
  .was {
    font-size: 16px;
  }
  .amt {
    font-size: 38px;
    font-weight: 700;
    letter-spacing: -0.03em;
  }
  .time {
    margin-top: 2px;
    font-weight: 600;
  }
  .time .muted {
    font-weight: 500;
  }
  .tag {
    margin-top: 10px;
    font-size: 14px;
    min-height: 2.6em;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 18px 0 22px;
    display: grid;
    gap: 9px;
    font-size: 14px;
    color: #c9ccd2;
    flex: 1;
  }
  li {
    position: relative;
    padding-left: 22px;
  }
  li::before {
    content: '';
    position: absolute;
    left: 2px;
    top: 0.42em;
    width: 10px;
    height: 6px;
    border-left: 2px solid var(--accent);
    border-bottom: 2px solid var(--accent);
    transform: rotate(-45deg);
  }
</style>
