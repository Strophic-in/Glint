<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import Pricing from '$lib/components/Pricing.svelte';
  import DownloadButton from '$lib/components/DownloadButton.svelte';
  import InstallHelp from '$lib/components/InstallHelp.svelte';
  import { session } from '$lib/session.svelte';
  import { toasts } from '$lib/toast.svelte';
  import { loadScript } from '$lib/script';
  import AccountSettings from '$lib/components/AccountSettings.svelte';
  import {
    api,
    ApiError,
    errorMessage,
    type CouponQuote,
    type Plan,
    type PlansResponse,
    type UsageResponse
  } from '$lib/api';
  import { FALLBACK_PLANS } from '$lib/plans';
  import { formatBalance, formatDate, formatDateTime, formatDuration, formatINR } from '$lib/format';
  import { BRAND } from '$lib/config';

  let plans = $state<PlansResponse>(FALLBACK_PLANS);
  let usage = $state<UsageResponse | null>(null);
  let usageError = $state('');
  let busyId = $state<string | null>(null);

  const me = $derived(session.me);
  const balance = $derived(me?.balance_seconds ?? 0);
  const firstName = $derived((me?.user.name ?? '').split(' ')[0] || me?.user.email.split('@')[0] || '');
  const low = $derived(balance < 10 * 60);

  // Gate: signed-out visitors go to login and come back here.
  $effect(() => {
    if (!session.loading && !session.signedIn) goto('/login?next=/dashboard', { replaceState: true });
  });

  // Load usage once per signed-in user.
  let loadedFor = '';
  $effect(() => {
    const id = session.me?.user.id;
    if (id && id !== loadedFor) {
      loadedFor = id;
      loadUsage();
    }
  });

  async function loadUsage() {
    usageError = '';
    try {
      usage = await api.usage();
    } catch (e) {
      usageError = errorMessage(e);
    }
  }

  onMount(() => {
    session.refresh();
    api
      .plans()
      .then((p) => {
        if (p?.plans?.length) plans = p;
      })
      .catch(() => {});

    // Back from a redirect-based payment (some UPI apps): confirm it, then tidy the URL.
    const returned = new URLSearchParams(location.search).get('order_id');
    if (returned) {
      history.replaceState(null, '', location.pathname + location.hash);
      confirm(returned);
    }

    // Coming back from the app or checkout: show the fresh balance.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && session.signedIn) session.refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });

  // ── Coupon + mobile number ──
  let couponInput = $state('');
  let quote = $state<CouponQuote | null>(null);
  let couponError = $state('');
  let couponBusy = $state(false);
  let phone = $state('');
  let phoneError = $state('');
  $effect(() => {
    if (!phone && session.me?.user.phone) phone = session.me.user.phone;
  });

  async function applyCoupon(e?: SubmitEvent) {
    e?.preventDefault();
    if (!couponInput.trim()) return;
    couponBusy = true;
    couponError = '';
    try {
      quote = await api.previewCoupon(couponInput.trim());
      couponInput = quote.code;
    } catch (err) {
      quote = null;
      couponError = errorMessage(err);
    } finally {
      couponBusy = false;
    }
  }

  function clearCoupon() {
    quote = null;
    couponInput = '';
    couponError = '';
  }

  async function afterPurchase() {
    await session.refresh();
    loadUsage();
  }

  /** The server asks Cashfree for the real status; hours are credited only when it's PAID. */
  async function confirm(orderId: string, plan?: Plan, closed = false) {
    try {
      const v = await api.verifyPayment(orderId);
      if (v.ok) {
        toasts.ok(`Payment received. ${plan ? formatDuration(plan.seconds) : 'Your hours'} added.`);
        clearCoupon();
      } else if (v.status === 'active') {
        toasts.info(closed ? 'Checkout closed. You have not been charged.' : 'Payment not completed yet.');
      } else {
        toasts.error(`Payment ${v.status.replace(/_/g, ' ')}. Contact support if money was taken.`);
      }
    } catch {
      toasts.info('We will update your balance as soon as the payment is confirmed.');
    } finally {
      await afterPurchase();
    }
  }

  async function buy(plan: Plan) {
    busyId = plan.id;
    phoneError = '';
    try {
      const coupon = quote?.plans.some((p) => p.plan_id === plan.id && p.eligible) ? quote.code : undefined;
      const order = await api.createOrder(plan.id, { coupon, phone: phone.trim() || undefined });
      if (order.free) {
        toasts.ok(`Coupon applied. ${formatDuration(plan.seconds)} added for free.`);
        clearCoupon();
        await afterPurchase();
        return;
      }
      await loadScript('https://sdk.cashfree.com/js/v3/cashfree.js');
      if (!window.Cashfree || !order.payment_session_id) {
        throw new Error('Checkout failed to load. Disable your ad blocker and try again.');
      }
      const result = await window
        .Cashfree({ mode: order.mode ?? 'sandbox' })
        .checkout({ paymentSessionId: order.payment_session_id, redirectTarget: '_modal' });
      if (result.redirect) return; // continues on Cashfree's page; checked when they return here
      await confirm(order.order_id, plan, !!result.error);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'phone_required') {
        phoneError = e.message;
        document.getElementById('phone')?.focus();
      } else {
        toasts.error(errorMessage(e));
      }
    } finally {
      busyId = null;
    }
  }

  async function signOut() {
    await session.logout();
    goto('/', { replaceState: true });
  }

  const planName = (id: string) =>
    plans.plans.find((p) => p.id === id)?.name ?? (id === 'trial' ? 'Free trial' : id);

  const kindLabel = (k: string) =>
    k === 'live' ? 'Live session' : k === 'answer' ? 'Quick answer' : k.charAt(0).toUpperCase() + k.slice(1);
</script>

<svelte:head>
  <title>Dashboard · {BRAND}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#if !me}
  <section class="container pad"><p class="muted">Loading…</p></section>
{:else}
  <section class="container pad">
    <div class="top">
      <div class="hello">
        {#if me.user.picture}
          <img src={me.user.picture} alt="" width="44" height="44" referrerpolicy="no-referrer" />
        {/if}
        <div>
          <h1>Hi{firstName ? `, ${firstName}` : ''}</h1>
          <p class="muted email">{me.user.email}</p>
        </div>
      </div>
      <button class="btn btn-sm btn-ghost" onclick={signOut}>Sign out</button>
    </div>

    <div class="overview">
      <article class="card balance" class:low>
        <div class="row">
          <span class="label">Time left</span>
          {#if me.live}
            <span class="badge badge-live"><span class="dot dot-pulse"></span> Live now</span>
          {/if}
        </div>
        <div class="big" aria-live="polite">{formatBalance(balance)}</div>
        <p class="muted">
          {#if me.expires_at && balance > 0}
            Valid until {formatDate(me.expires_at)}
          {:else if balance > 0}
            Ready when you are
          {:else}
            Top up to go live
          {/if}
        </p>
        {#if low}
          <p class="warn">{balance > 0 ? 'Running low — top up before your next call.' : 'You are out of time.'}</p>
        {/if}
        <a class="btn btn-primary" href="#buy">Buy hours</a>
      </article>

      <article class="card get">
        <span class="label">Get the app</span>
        <h2>{BRAND} for Windows</h2>
        <p class="muted">Windows 10 2004+ / 11 · ~2.5 MB</p>
        <ol>
          <li>Install and open {BRAND}.</li>
          <li>Click <b>Sign in with Google</b> and approve in your browser.</li>
          <li>Press <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>L</kbd> to go live, <kbd>Ctrl</kbd> <kbd>Enter</kbd> to answer.</li>
        </ol>
        <DownloadButton size="md" primary={false} />
        <InstallHelp align="left" />
      </article>
    </div>
  </section>

  <section id="buy" class="container pad">
    <div class="sec-head">
      <h2>Buy hours</h2>
      <p class="muted">
        Billed per second, only while live. Each top-up keeps your whole balance valid for
        {plans.validity_days} days. Prices include GST.
      </p>
    </div>
    <div class="checkout card">
      <form class="field" onsubmit={applyCoupon}>
        <label for="coupon">Coupon code</label>
        <div class="row">
          {#if quote}
            <span class="applied"><span class="badge badge-ok">{quote.code}</span> {quote.label} applied</span>
            <button type="button" class="btn btn-sm btn-ghost" onclick={clearCoupon}>Remove</button>
          {:else}
            <input id="coupon" class="input" placeholder="e.g. LAUNCH20" bind:value={couponInput} autocomplete="off" />
            <button class="btn btn-sm" disabled={couponBusy || !couponInput.trim()}>{couponBusy ? 'Checking…' : 'Apply'}</button>
          {/if}
        </div>
        {#if couponError}<p class="err">{couponError}</p>{/if}
      </form>
      <div class="field">
        <label for="phone">Mobile number <span class="muted">· for the payment receipt</span></label>
        <input id="phone" class="input" inputmode="tel" placeholder="10-digit mobile" bind:value={phone} maxlength="16" />
        {#if phoneError}<p class="err">{phoneError}</p>{/if}
      </div>
    </div>
    <Pricing data={plans} mode="buy" onbuy={buy} {busyId} showTrial={false} {quote} />
  </section>

  <section id="account" class="container pad">
    <div class="sec-head">
      <h2>Account</h2>
    </div>
    <AccountSettings />
  </section>

  <section class="container pad">
    <div class="sec-head">
      <h2>Recent usage</h2>
    </div>
    {#if usageError}
      <p class="muted">{usageError} <button class="btn btn-sm" onclick={loadUsage}>Retry</button></p>
    {:else if !usage}
      <p class="muted">Loading…</p>
    {:else}
      <div class="tables">
        <div class="card">
          <h3>Sessions</h3>
          {#if usage.usage.length === 0}
            <p class="empty muted">
              No sessions yet. Press <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>L</kbd> in the app to go live.
            </p>
          {:else}
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr><th>Type</th><th>Duration</th><th>Started</th><th>Ended</th></tr>
                </thead>
                <tbody>
                  {#each usage.usage as u, i (i)}
                    <tr>
                      <td>{kindLabel(u.kind)}</td>
                      <td>{u.seconds > 0 ? formatDuration(u.seconds) : 'Included'}</td>
                      <td class="muted">{formatDateTime(u.started_at)}</td>
                      <td class="muted">{u.ended_at ? formatDateTime(u.ended_at) : 'Live'}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>

        <div class="card">
          <h3>Purchases</h3>
          {#if usage.orders.length === 0}
            <p class="empty muted">No purchases yet.</p>
          {:else}
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr><th>Date</th><th>Plan</th><th>Time</th><th>Amount</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {#each usage.orders as o (o.id)}
                    <tr>
                      <td class="muted">{formatDate(o.created_at)}</td>
                      <td>{planName(o.plan_id)}</td>
                      <td>{formatDuration(o.seconds)}</td>
                      <td>{formatINR(o.amount_paise / 100)}</td>
                      <td>
                        {#if o.status === 'paid'}
                          <span class="badge badge-ok">Paid</span>
                        {:else if o.status === 'created'}
                          <span class="badge">Pending</span>
                        {:else}
                          <span class="badge">{o.status}</span>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </section>
{/if}

<style>
  .pad {
    padding-top: 48px;
  }
  .pad + .pad {
    padding-top: 64px;
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .hello {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }
  .hello img {
    border-radius: 50%;
    flex: none;
  }
  .hello > div {
    min-width: 0;
  }
  h1 {
    font-size: clamp(26px, 4vw, 34px);
  }
  .email {
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .overview {
    margin-top: 28px;
    display: grid;
    gap: 16px;
  }
  @media (min-width: 860px) {
    .overview {
      grid-template-columns: 1.1fr 1fr;
    }
  }
  .card {
    padding: 26px 24px;
    min-width: 0;
  }
  .label {
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .balance {
    background:
      radial-gradient(90% 80% at 0% 0%, rgba(245, 184, 61, 0.12), transparent 60%),
      var(--surface);
  }
  .big {
    margin-top: 10px;
    font-size: clamp(48px, 10vw, 72px);
    font-weight: 700;
    letter-spacing: -0.045em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .balance .muted {
    margin-top: 10px;
  }
  .warn {
    margin-top: 10px;
    color: var(--accent);
    font-size: 14px;
    font-weight: 500;
  }
  .balance .btn {
    margin-top: 22px;
  }
  .get h2 {
    margin-top: 10px;
    font-size: 22px;
  }
  .get > .muted {
    margin-top: 4px;
    font-size: 14px;
  }
  .get ol {
    margin: 16px 0 22px;
    padding-left: 20px;
    display: grid;
    gap: 8px;
    font-size: 14.5px;
    color: #c9ccd2;
    line-height: 1.8;
  }
  .get kbd,
  .empty kbd {
    height: 22px;
    min-width: 22px;
    font-size: 11.5px;
  }

  .checkout {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 16px 24px;
    padding: 18px 20px;
    margin-bottom: 18px;
  }
  .checkout .field {
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  .checkout label {
    font-size: 14px;
    font-weight: 600;
  }
  .checkout .row {
    display: flex;
    gap: 8px;
    align-items: center;
    min-height: 44px;
  }
  .checkout .input {
    height: 42px;
  }
  .applied {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    font-size: 14.5px;
  }
  .err {
    margin: 0;
    color: var(--danger);
    font-size: 13.5px;
  }
  .sec-head {
    margin-bottom: 22px;
  }
  .sec-head h2 {
    font-size: 26px;
  }
  .sec-head p {
    margin-top: 8px;
    max-width: 640px;
  }

  .tables {
    display: grid;
    gap: 16px;
  }
  .tables .card {
    padding: 20px 8px 8px;
  }
  .tables h3 {
    font-size: 16px;
    padding: 0 14px 10px;
  }
  .empty {
    padding: 4px 14px 16px;
    font-size: 14.5px;
    line-height: 1.9;
  }
</style>
