<script lang="ts">
  import { BRAND, SUPPORT_EMAIL } from '$lib/config';
</script>

<svelte:head>
  <title>Privacy Policy · {BRAND}</title>
</svelte:head>

<article class="container prose page">
  <h1>Privacy Policy</h1>
  <p class="muted">Last updated: 4 November 2026</p>

  <p>
    This policy explains what {BRAND} ("we", "us"), operated by [Your Company Legal Name], collects when you use
    the {BRAND} website and Windows app, why, and what control you have. We process personal data in line with
    India's Digital Personal Data Protection Act, 2023.
  </p>

  <h2>The short version</h2>
  <ul>
    <li>We do <b>not</b> store your audio, transcripts, screenshots, questions or answers.</li>
    <li>We store your Google account basics, your usage time, and your payment records.</li>
    <li>We never sell your data.</li>
  </ul>

  <h2>What we collect</h2>
  <ul>
    <li>
      <b>Account data</b> — your name, email address, profile picture and Google account ID, received when you
      sign in with Google. We request only the basic <code>openid</code>, <code>email</code> and
      <code>profile</code> scopes.
    </li>
    <li>
      <b>Usage data</b> — when live sessions start and end, seconds used, number of answers, and AI token counts.
      We use this to bill you accurately and to understand costs.
    </li>
    <li>
      <b>Payment data</b> — order IDs, amounts, plan and payment status. Card, UPI and bank details are entered
      directly with our payment processor, Cashfree Payments; we never see or store them.
    </li>
    <li>
      <b>Technical data</b> — IP address, app version and error logs, kept for up to 30 days for security and
      debugging.
    </li>
  </ul>

  <h2>Audio, screen and conversation content</h2>
  <p>
    When you go live, the app streams speech from your microphone and system audio to our server, which relays it
    to our AI provider to produce live transcription. When you ask for an answer, the recent transcript and (if
    enabled) a screenshot are sent the same way. This content is processed in memory to serve your request and is
    not written to our database or logs. Transcripts are kept only on your PC for the current session.
  </p>
  <p>
    Our AI provider (OpenAI) processes this content under its API terms, which do not allow it to train models on
    API data by default. It may retain request data for a limited period (typically up to 30 days) solely for
    abuse monitoring.
  </p>

  <h2>How we use data</h2>
  <ul>
    <li>To provide the service, sign you in and keep your account secure.</li>
    <li>To meter usage, process payments, and send receipts.</li>
    <li>To respond to support requests and prevent fraud or abuse.</li>
  </ul>

  <h2>Who we share it with</h2>
  <p>Only service providers that help us run {BRAND}, each bound by their own data-protection terms:</p>
  <ul>
    <li>Google — sign-in.</li>
    <li>OpenAI — transcription and answers.</li>
    <li>Cashfree Payments — payments.</li>
    <li>Oracle Cloud and Vercel — hosting.</li>
  </ul>
  <p>We may disclose data if required by law or to protect our users and service.</p>

  <h2>Retention</h2>
  <p>
    Account, usage and payment records are kept while your account is active and for as long as tax and accounting
    law requires afterwards (generally 8 years for payment records in India). Technical logs are deleted after 30
    days.
  </p>

  <h2>Your rights</h2>
  <p>
    You can ask to access, correct or delete your personal data, or withdraw consent, by emailing
    <a class="link" href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a>. We respond within 30 days. Deleting your
    account forfeits any remaining balance.
  </p>

  <h2>Security</h2>
  <p>
    All traffic is encrypted in transit (TLS). Session tokens are stored hashed. Access to production systems is
    restricted to authorised staff.
  </p>

  <h2>Children</h2>
  <p>{BRAND} is not intended for anyone under 18, and we do not knowingly collect their data.</p>

  <h2>Changes</h2>
  <p>
    If we make material changes, we will update this page and notify you by email or in the app before they take
    effect.
  </p>

  <h2>Grievance officer</h2>
  <p>
    [Grievance Officer Name], [Your Company Legal Name], [Registered Address]. Email:
    <a class="link" href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a>.
  </p>
</article>

<style>
  .page {
    padding-top: 64px;
  }
  code {
    font-family: var(--mono);
    font-size: 0.88em;
    color: var(--accent);
  }
</style>
