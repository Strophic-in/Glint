<script lang="ts">
  import { BRAND, SUPPORT_EMAIL } from '$lib/config';
  import { BUSINESS, OPERATOR, POLICY_UPDATED } from '$lib/legal';

  const contents = [
    ['collect', 'Information we collect'],
    ['content', 'Audio, screen and conversation content'],
    ['use', 'How we use your information'],
    ['basis', 'Consent and legal basis'],
    ['google', 'Google user data'],
    ['sharing', 'Who we share data with'],
    ['transfers', 'Where your data is stored'],
    ['cookies', 'Cookies and local storage'],
    ['retention', 'How long we keep data'],
    ['security', 'Security'],
    ['rights', 'Your rights and choices'],
    ['children', 'Children'],
    ['third-party', 'Third-party services'],
    ['changes', 'Changes to this policy'],
    ['contact', 'Contact and grievance officer']
  ];
</script>

<svelte:head>
  <title>Privacy Policy · {BRAND}</title>
  <meta
    name="description"
    content="How {BRAND} collects, uses, shares and protects your personal data, and how to exercise your rights."
  />
</svelte:head>

<article class="container prose page">
  <h1>Privacy Policy</h1>
  <p class="muted">Last updated: {POLICY_UPDATED}</p>

  <p>
    This Privacy Policy explains how
    {#if BUSINESS.legalName}{BUSINESS.legalName} ("{BRAND}", "we", "us" or "our"){:else}{BRAND} ("we", "us" or
      "our"){/if}
    collects, uses, shares, stores and protects personal data when you use the {BRAND} website, the {BRAND} Windows
    app and the services behind them (together, the "Service"). It also explains your rights and how to contact us.
  </p>
  <p>
    We process personal data in accordance with the Information Technology Act, 2000 and the rules made under it,
    and the Digital Personal Data Protection Act, 2023 (the "DPDP Act") and the Digital Personal Data Protection
    Rules, 2025. For the purposes of the DPDP Act, we are the Data Fiduciary for the personal data described in
    this policy. By signing in to or using the Service, you agree to this policy. If you do not agree, please do not
    use the Service.
  </p>

  <div class="summary">
    <h2>The short version</h2>
    <ul>
      <li>
        We do <b>not</b> store your audio, transcripts, screenshots, questions, answers or documents on our servers.
      </li>
      <li>We store your Google account basics, your mobile number, your usage time and your payment records.</li>
      <li>Card, UPI and bank details go directly to our payment processor, Cashfree. We never see them.</li>
      <li>We never sell your data, show you ads, or use your content to train AI models.</li>
      <li>You can edit your details, sign out devices or delete your account yourself, at any time.</li>
    </ul>
  </div>

  <nav class="toc" aria-label="Contents">
    <h2>Contents</h2>
    <ol>
      {#each contents as [id, title]}
        <li><a class="link" href="#{id}">{title}</a></li>
      {/each}
    </ol>
  </nav>

  <h2 id="collect">1. Information we collect</h2>
  <p><b>Account information from Google sign-in.</b>
    When you sign in with Google, Google shares your name, email address, profile picture and a unique Google account
    identifier with us. We request only the basic <code>openid</code>, <code>email</code> and <code>profile</code>
    permissions. We never receive your Google password, and we cannot access your Gmail, Drive, contacts or any other
    Google data.
  </p>
  <p><b>Mobile number.</b>
    Our payment processor requires a mobile number to create a payment. We save it to your account so you don't have
    to enter it again. You can change it in your account settings.
  </p>
  <p><b>Purchase and payment information.</b>
    Order ID, plan, amount, any coupon applied, payment status, the payment reference from Cashfree, and timestamps.
    Card numbers, UPI IDs, bank account details and other payment credentials are entered on Cashfree's secure
    checkout and are never sent to or stored by us.
  </p>
  <p><b>Usage and balance information.</b>
    Your remaining hours and their validity, hours added (purchases, the free trial and any adjustments), when live
    sessions start and end, seconds used, number of answers and their type (for example "screen answer"), the AI
    model used and the amount of text processed (token counts), and which app session each belongs to (a random
    ID and the session's title as shown in the app, such as "Interview · Acme"), so your dashboard can list your
    sessions. We need this to meter your balance accurately and to bill you correctly. We never store what was
    said or answered.
  </p>
  <p><b>Sign-in sessions and devices.</b>
    For each browser or device you sign in on: a session token stored only in hashed (one-way encrypted) form,
    whether it is the website or the app, a short browser or device description (user agent), and when the session
    was created and last used. When you connect the Windows app to your account, a temporary pairing code links the
    two and expires within 10 minutes.
  </p>
  <p><b>Technical information.</b>
    IP address, request details (time, address requested, response status) and error logs, recorded by our servers
    and network providers for security, fraud prevention and troubleshooting.
  </p>
  <p><b>Support communications.</b>
    If you email us, we keep the correspondence so we can resolve your request.
  </p>
  <p><b>Free-trial record.</b>
    To make sure the free trial is granted only once per email address, we keep a one-way hash of your email
    address. It cannot be turned back into your email address.
  </p>

  <h2 id="content">2. Audio, screen and conversation content</h2>
  <p>
    To work, {BRAND} handles content from your computer: microphone audio, system audio (which can include the voices
    of other people on your call or meeting), live transcripts, screenshots of your screen when you ask {BRAND} to
    read it, questions you type, the session details you enter (for example a company, role or notes), and text from
    documents you attach (for example your resume). This is how that content is handled:
  </p>
  <ul>
    <li>It is captured only while a live session is running, or when you ask for an answer.</li>
    <li>
      It is sent over an encrypted connection to our server, which passes it to our AI provider, OpenAI, to produce
      the transcription and the answer, and sends the result back to your app.
    </li>
    <li>
      It is processed in memory only. We do <b>not</b> save audio, transcripts, screenshots, questions, answers,
      session details or document text in our database or logs.
    </li>
    <li>
      Documents you attach are read on your PC. Only their text is kept, in the app's settings on your PC, and it is
      sent with your questions so answers can use it. You can remove a document in the app at any time.
    </li>
    <li>Transcripts are kept in the app on your PC for the current session only.</li>
    <li>
      OpenAI processes this content as our service provider under its API data policies: data sent through its API
      is not used to train OpenAI's models, and may be retained by OpenAI for up to 30 days solely to monitor for
      abuse before it is deleted.
    </li>
  </ul>
  <p>
    <b>Other people's voices.</b> Because system audio can include other participants, you are responsible for
    telling them and obtaining their consent wherever the law or the rules of the meeting or platform require it.
    See section 3 of our <a class="link" href="/terms">Terms of Service</a>.
  </p>

  <h2 id="use">3. How we use your information</h2>
  <ul>
    <li>
      <b>To provide the Service</b>: create and secure your account, sign you in on the website and the app, and
      produce transcriptions and answers.
    </li>
    <li>
      <b>To meter and bill</b>: track your balance and usage, process payments, apply coupons and show your history.
    </li>
    <li><b>To support you</b>: answer questions, and handle refund requests and grievances.</li>
    <li>
      <b>To keep the Service safe</b>: detect and prevent fraud, abuse, payment disputes and breaches of our Terms,
      including by suspending accounts.
    </li>
    <li>
      <b>To operate and improve the Service</b>: monitor reliability, speed and costs using aggregated usage data.
    </li>
    <li><b>To meet legal obligations</b>: tax, accounting and other legal duties, and lawful requests.</li>
  </ul>
  <p>
    We do <b>not</b> sell or rent your personal data, use it for advertising, build advertising profiles, or use your
    audio, screen or conversation content to train AI models.
  </p>

  <h2 id="basis">4. Consent and legal basis</h2>
  <p>
    We process your personal data on the basis of the consent you give when you sign in to and use the Service, for
    the purposes described in this policy. Some processing is necessary for uses the DPDP Act permits without
    consent, such as complying with the law (for example, keeping payment records for tax purposes). You can
    withdraw your consent at any time, as described in <a class="link" href="#rights">section 11</a>. Withdrawal
    does not affect processing that happened before it. Because the Service cannot work without some personal data,
    withdrawing consent may mean closing your account.
  </p>

  <h2 id="google">5. Google user data</h2>
  <ul>
    <li>
      <b>What we access</b>: only your basic Google profile (name, email address, profile picture and Google account
      ID), through Google Sign-In.
    </li>
    <li>
      <b>How we use it</b>: only to create and identify your {BRAND} account, sign you in, show your name and picture
      in the website and app, and contact you about your account or purchases.
    </li>
    <li>
      <b>Sharing</b>: we do not share it, except where needed to provide the Service (for example, your name and
      email go to Cashfree when you make a payment) or where the law requires it. We never sell it, use it for
      advertising, or use it to train AI models.
    </li>
    <li>
      <b>Storage and deletion</b>: it is stored in our database in India and erased when you delete your account.
    </li>
  </ul>
  <p>
    {BRAND}'s use and transfer of information received from Google APIs adheres to the
    <a class="link" href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener"
      >Google API Services User Data Policy</a
    >, including the Limited Use requirements. You can remove {BRAND}'s access at any time from your
    <a class="link" href="https://myaccount.google.com/permissions" rel="noopener">Google Account permissions</a>.
  </p>

  <h2 id="sharing">6. Who we share data with</h2>
  <p>
    We share personal data only with service providers that process it on our behalf to run the Service, under terms
    that require them to protect it, and only as much as each one needs:
  </p>
  <div class="table-wrap">
    <table class="providers">
      <thead>
        <tr><th>Provider</th><th>Purpose</th><th>Data involved</th><th>Location</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>Oracle Cloud Infrastructure</td>
          <td>Hosting our servers and database</td>
          <td>The account, usage and payment records we store</td>
          <td>India (Hyderabad)</td>
        </tr>
        <tr>
          <td>OpenAI</td>
          <td>Live transcription and AI answers</td>
          <td>Audio, transcripts, screenshots, questions, session details and document text</td>
          <td>United States</td>
        </tr>
        <tr>
          <td>Cashfree Payments India Pvt. Ltd.</td>
          <td>Payment processing</td>
          <td>Name, email, mobile number, order ID and amount</td>
          <td>India</td>
        </tr>
        <tr>
          <td>Google</td>
          <td>Sign-in, and fonts on our website</td>
          <td>Sign-in details; your IP address when fonts load</td>
          <td>United States and global</td>
        </tr>
        <tr>
          <td>Vercel</td>
          <td>Hosting our website</td>
          <td>IP address and request logs when you visit the website</td>
          <td>Global</td>
        </tr>
        <tr>
          <td>Cloudflare</td>
          <td>DNS, network security and delivery of traffic to our servers</td>
          <td>IP address and traffic in transit</td>
          <td>Global</td>
        </tr>
      </tbody>
    </table>
  </div>
  <p>We may also disclose personal data:</p>
  <ul>
    <li>when required by law, a court order or a lawful request from a government authority;</li>
    <li>to protect the rights, property or safety of our users, the public or us, including to prevent fraud;</li>
    <li>
      as part of a merger, acquisition or sale of our business, in which case we will notify you and the new owner
      will be bound by this policy; or
    </li>
    <li>with your consent.</li>
  </ul>

  <h2 id="transfers">7. Where your data is stored</h2>
  <p>
    The account, usage and payment records we keep are stored on servers in India (Oracle Cloud, Hyderabad region).
    Some of our service providers, including OpenAI, Google, Vercel and Cloudflare, may process data outside India,
    including in the United States. The DPDP Act permits such transfers except to countries the Government of India
    has restricted, and we rely on our providers' contractual and security safeguards to protect your data.
  </p>

  <h2 id="cookies">8. Cookies and local storage</h2>
  <ul>
    <li>We do not use advertising or analytics cookies, and we do not use third-party trackers.</li>
    <li>
      <b>Website</b>: your sign-in token is saved in your browser's local storage so you stay signed in. Signing out
      removes it.
    </li>
    <li>
      Google Sign-In and Cashfree checkout may set their own strictly necessary cookies when you use them, under their
      own privacy policies.
    </li>
    <li>
      <b>Windows app</b>: your sign-in token is stored on your PC, encrypted with Windows Data Protection (DPAPI) so
      only your Windows account can read it. Your settings, session details and attached document text are stored
      locally by the app. Signing out or uninstalling removes them.
    </li>
  </ul>

  <h2 id="retention">9. How long we keep data</h2>
  <div class="table-wrap">
    <table class="retention">
      <thead>
        <tr><th>Data</th><th>How long we keep it</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>Account information (name, email, picture, mobile number)</td>
          <td>While your account is active. Erased when you delete your account.</td>
        </tr>
        <tr>
          <td>Sign-in sessions</td>
          <td>Until you sign out or revoke them, and at most 60 days from sign-in.</td>
        </tr>
        <tr>
          <td>App pairing codes</td>
          <td>Expire after 10 minutes and are deleted within a day.</td>
        </tr>
        <tr>
          <td>Usage and balance records</td>
          <td>
            While your account is active. After deletion, kept only in de-identified form for accounting and
            statistics.
          </td>
        </tr>
        <tr>
          <td>Orders and payment records</td>
          <td>
            As long as tax and accounting laws require (generally up to 8 years), including after account deletion.
          </td>
        </tr>
        <tr>
          <td>Free-trial hash</td>
          <td>Kept to prevent repeat trials. It cannot identify you.</td>
        </tr>
        <tr>
          <td>Server logs (including IP addresses)</td>
          <td>Overwritten automatically as new logs are written, and kept only for a limited period.</td>
        </tr>
        <tr>
          <td>Support emails</td>
          <td>As long as needed to resolve your request and any follow-up.</td>
        </tr>
        <tr>
          <td>Audio, screenshots, transcripts, questions, answers and documents</td>
          <td>
            Not stored on our servers. On your PC: transcripts for the current session; settings and documents until
            you remove them or uninstall the app. OpenAI may keep API data for up to 30 days for abuse monitoring.
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <h2 id="security">10. Security</h2>
  <p>We use reasonable security practices to protect personal data, including:</p>
  <ul>
    <li>encryption in transit (TLS/HTTPS) for all connections to the website, the app and our servers;</li>
    <li>
      storing session tokens only as one-way hashes, and encrypting the app's sign-in token on your PC with Windows
      Data Protection;
    </li>
    <li>leaving all payment credentials to Cashfree, a PCI DSS compliant payment processor;</li>
    <li>
      password-protected database access, restricted administrative access, and a log of administrative actions.
    </li>
  </ul>
  <p>
    No system is completely secure. If a personal data breach occurs, we will inform the Data Protection Board of
    India and affected users as the law requires.
  </p>

  <h2 id="rights">11. Your rights and choices</h2>
  <p>Under the DPDP Act, you have the right to:</p>
  <ul>
    <li>
      <b>Access</b>: get a summary of the personal data we process about you, the processing we do, and who we have
      shared it with;
    </li>
    <li><b>Correction</b>: correct, complete or update your personal data;</li>
    <li><b>Erasure</b>: have your personal data erased, unless we must keep it by law;</li>
    <li><b>Withdraw consent</b>: as easily as you gave it;</li>
    <li><b>Grievance redressal</b>: have your complaints about our handling of your data addressed; and</li>
    <li>
      <b>Nominate</b>: nominate another person to exercise these rights for you in the event of your death or
      incapacity.
    </li>
  </ul>
  <p><b>How to exercise them.</b></p>
  <ul>
    <li>
      <b>Yourself, at any time</b>: on the website, open your <a class="link" href="/dashboard">dashboard</a> to
      edit your name and mobile number, see and sign out your devices, or delete your account.
    </li>
    <li>
      <b>By email</b>: write to <a class="link" href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a> from the email
      address on your account. We may ask you to confirm your identity, and we respond within 30 days.
    </li>
  </ul>
  <p>
    Deleting your account signs you out everywhere and erases your name, email address, picture and mobile number.
    Any remaining hours are forfeited. Payment records are kept as described in
    <a class="link" href="#retention">section 9</a>. If you are not satisfied with our response to a grievance, you
    may complain to the Data Protection Board of India.
  </p>

  <h2 id="children">12. Children</h2>
  <p>
    The Service is not intended for anyone under 18, and we do not knowingly collect personal data from children. If
    we learn that we have, we will delete it. If you believe a child has given us personal data, please contact us.
  </p>

  <h2 id="third-party">13. Third-party services</h2>
  <p>
    Google Sign-In, Cashfree checkout and other third-party services you use through {BRAND} are governed by their
    own privacy policies, including those of
    <a class="link" href="https://policies.google.com/privacy" rel="noopener">Google</a>,
    <a class="link" href="https://www.cashfree.com/privacypolicy/" rel="noopener">Cashfree Payments</a> and
    <a class="link" href="https://openai.com/policies/privacy-policy/" rel="noopener">OpenAI</a>.
  </p>

  <h2 id="changes">14. Changes to this policy</h2>
  <p>
    We may update this policy as the Service changes. We will change the "Last updated" date above and, for material
    changes, notify you by email or in the app before they take effect.
  </p>

  <h2 id="contact">15. Contact and grievance officer</h2>
  <p>For questions, requests or complaints about your personal data, contact our Grievance Officer:</p>
  <address>
    {#if BUSINESS.grievanceOfficer}{BUSINESS.grievanceOfficer}, Grievance Officer<br />{/if}
    {OPERATOR}<br />
    {#if BUSINESS.address}{BUSINESS.address}<br />{/if}
    {#if BUSINESS.cityStatePin}{BUSINESS.cityStatePin}, India<br />{/if}
    Email: <a class="link" href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a> (subject "Privacy" or "Grievance")
    {#if BUSINESS.phone}<br />Phone: <a class="link" href="tel:{BUSINESS.phone.replace(/\s+/g, '')}">{BUSINESS.phone}</a>{/if}
  </address>
  <p>We acknowledge grievances within 2 business days and aim to resolve them within 30 days.</p>
</article>

<style>
  .page {
    padding-top: 64px;
    padding-bottom: 32px;
  }
  code {
    font-family: var(--mono);
    font-size: 0.88em;
    color: var(--accent);
  }
  .summary,
  .toc {
    margin-top: 28px;
    padding: 4px 22px 18px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .summary h2,
  .toc h2 {
    margin-top: 18px;
    font-size: 17px;
  }
  .toc ol {
    margin: 10px 0 0;
    padding-left: 22px;
    columns: 2 220px;
    column-gap: 28px;
  }
  .toc li {
    break-inside: avoid;
  }
  h2[id] {
    scroll-margin-top: 80px;
  }
  .table-wrap {
    margin: 14px 0;
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14.5px;
  }
  th,
  td {
    text-align: left;
    vertical-align: top;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    color: #c9ccd2;
  }
  th {
    color: inherit;
    font-weight: 600;
    white-space: nowrap;
  }
  /* Phones: each row becomes a small card with its column names as labels. */
  @media (max-width: 640px) {
    thead {
      display: none;
    }
    table,
    tbody,
    tr,
    td {
      display: block;
      width: 100%;
    }
    tr {
      padding: 12px 0;
      border-bottom: 1px solid var(--border);
    }
    td {
      padding: 2px 0;
      border: none;
    }
    td:first-child {
      color: var(--text);
      font-weight: 600;
    }
    td:not(:first-child)::before {
      display: block;
      margin-top: 6px;
      font-size: 11.5px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--faint);
    }
    .providers td:nth-child(2)::before {
      content: 'Purpose';
    }
    .providers td:nth-child(3)::before {
      content: 'Data involved';
    }
    .providers td:nth-child(4)::before {
      content: 'Location';
    }
    .retention td:nth-child(2)::before {
      content: 'Kept for';
    }
  }
  address {
    margin-top: 10px;
    font-style: normal;
    line-height: 1.7;
    color: #c9ccd2;
  }
</style>
