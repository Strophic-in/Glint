<script lang="ts">
  import { BRAND, SUPPORT_EMAIL } from '$lib/config';
  import { BUSINESS, OPERATOR, POLICY_UPDATED } from '$lib/legal';
</script>

<svelte:head>
  <title>Refund & Cancellation Policy · {BRAND}</title>
</svelte:head>

<article class="container prose page">
  <h1>Refund & Cancellation Policy</h1>
  <p class="muted">Last updated: {POLICY_UPDATED}</p>

  <p>
    {BRAND} sells prepaid hours, not subscriptions. There is nothing to cancel and you are never charged
    automatically.
  </p>

  <h2>Delivery</h2>
  <p>
    {BRAND} is a digital service; nothing is shipped. Hours are added to your account as soon as your payment is
    confirmed, usually within a minute, and you can use them straight away in the {BRAND} Windows app, downloadable
    from our website. If hours don't appear within 30 minutes of a successful payment, email us with your order ID
    and we will credit them or refund you.
  </p>

  <h2>When you can get a refund</h2>
  <p>You can request a full refund of a purchase if <b>both</b> of these are true:</p>
  <ul>
    <li>It is within <b>7 days</b> of the purchase, and</li>
    <li>You have used <b>less than 10%</b> of the hours from that purchase.</li>
  </ul>
  <p>The hours from a refunded purchase are removed from your balance.</p>

  <h2>Not refundable</h2>
  <ul>
    <li>The free trial and any promotional or bonus hours.</li>
    <li>Purchases older than 7 days, or where 10% or more of the hours have been used.</li>
    <li>Hours that have expired.</li>
  </ul>

  <h2>Failed or duplicate payments</h2>
  <p>
    If money left your account but no hours were added, or you were charged twice, email us with the payment
    reference. Failed payments are normally reversed automatically by your bank within 5–7 business days.
  </p>

  <h2>How to request a refund</h2>
  <p>
    Email <a class="link" href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a> from the email on your account with
    your order ID (shown on your dashboard). We reply within 2 business days. Approved refunds are issued to the
    original payment method via Cashfree and usually arrive within 5–7 business days.
  </p>

  <p class="muted">
    {OPERATOR}{#if BUSINESS.address} · {BUSINESS.address}{/if}{#if BUSINESS.cityStatePin}, {BUSINESS.cityStatePin}{/if}
  </p>
</article>

<style>
  .page {
    padding-top: 64px;
  }
</style>
