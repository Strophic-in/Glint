<script lang="ts">
  import { BRAND, SUPPORT_EMAIL } from '$lib/config';
  import { BUSINESS, OPERATOR } from '$lib/legal';
</script>

<svelte:head>
  <title>Contact · {BRAND}</title>
</svelte:head>

<section class="container page">
  <div class="prose">
    <h1>Contact us</h1>
    <p class="muted">We usually reply within one business day.</p>
  </div>

  <div class="grid">
    <div class="card item">
      <h2>Support & billing</h2>
      <p class="muted">Questions about the app, your hours, payments or refunds.</p>
      <a class="btn btn-primary" href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a>
      {#if BUSINESS.phone}
        <p class="small phone">
          Phone: <a class="link" href="tel:{BUSINESS.phone.replace(/\s+/g, '')}">{BUSINESS.phone}</a>
        </p>
      {/if}
    </div>
    <div class="card item">
      <h2>Registered office</h2>
      <p>
        {OPERATOR}
        {#if BUSINESS.address}<br />{BUSINESS.address}{/if}
        {#if BUSINESS.cityStatePin}<br />{BUSINESS.cityStatePin}{/if}
        <br />India
      </p>
      {#if BUSINESS.gstin}<p class="muted small">GSTIN: {BUSINESS.gstin}</p>{/if}
    </div>
    <div class="card item">
      <h2>Grievance officer</h2>
      {#if BUSINESS.grievanceOfficer}<p>{BUSINESS.grievanceOfficer}</p>{/if}
      <p class="muted small">
        For privacy or data requests, email <a class="link" href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a> with
        "Grievance" in the subject.
      </p>
    </div>
  </div>
</section>

<style>
  .page {
    padding-top: 64px;
  }
  .grid {
    margin-top: 32px;
    display: grid;
    gap: 16px;
  }
  @media (min-width: 860px) {
    .grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  .item {
    padding: 24px;
    min-width: 0;
  }
  .item h2 {
    font-size: 18px;
    margin-bottom: 10px;
  }
  .item p + p {
    margin-top: 8px;
  }
  .item .btn {
    margin-top: 18px;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .small {
    font-size: 14px;
  }
  .phone {
    margin-top: 14px;
  }
</style>
