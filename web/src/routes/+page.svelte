<script lang="ts">
  import { onMount } from 'svelte';
  import OverlayMock from '$lib/components/OverlayMock.svelte';
  import Pricing from '$lib/components/Pricing.svelte';
  import DownloadButton from '$lib/components/DownloadButton.svelte';
  import InstallHelp from '$lib/components/InstallHelp.svelte';
  import PromoBanner from '$lib/components/PromoBanner.svelte';
  import { api, type PlansResponse } from '$lib/api';
  import { FALLBACK_PLANS } from '$lib/plans';
  import { BRAND } from '$lib/config';
  import { formatDuration } from '$lib/format';

  let plans = $state<PlansResponse>(FALLBACK_PLANS);

  onMount(() => {
    api
      .plans()
      .then((p) => {
        if (p?.plans?.length) plans = p;
      })
      .catch(() => {
        /* keep the static copy */
      });
  });

  const features = [
    {
      icon: 'ears',
      title: 'Hears both sides',
      body: 'Your mic and the call audio are transcribed live and kept apart, so Glint knows who asked what.'
    },
    {
      icon: 'screen',
      title: 'Sees your screen',
      body: 'One key sends what you are looking at — code, slides, a form — and you get the answer, not a summary.'
    },
    {
      icon: 'auto',
      title: 'Answers on its own',
      body: 'When the other side asks a question, a reply is drafted before you press anything.'
    },
    {
      icon: 'hidden',
      title: 'Hidden from screen share',
      body: 'The overlay stays on your display only. It is excluded from screen shares and recordings.'
    },
    {
      icon: 'focus',
      title: 'Never steals focus',
      body: 'Answers appear without pulling you out of the call, the doc, or the editor you are typing in.'
    },
    {
      icon: 'feather',
      title: 'Tiny and native',
      body: 'A 2.5 MB installer and a Rust core that uses about 6 MB of RAM. No bundled Chromium, no Node runtime.'
    },
    {
      icon: 'clock',
      title: 'Pay per hour',
      body: 'No subscription. Billed per second, only while Glint is live on a call.'
    },
    {
      icon: 'lock',
      title: 'Private by design',
      body: 'No audio or transcripts are stored on our servers. Only usage time, for billing.'
    }
  ];

  const shortcuts: { action: string; keys: string[][] }[] = [
    { action: 'Show / hide', keys: [['Ctrl', '\\']] },
    { action: 'Answer now', keys: [['Ctrl', 'Enter']] },
    { action: 'Solve what’s on screen', keys: [['Ctrl', 'Shift', 'Enter']] },
    { action: 'Start / stop listening', keys: [['Ctrl', 'Shift', 'L']] },
    { action: 'Type a question', keys: [['Ctrl', 'Shift', 'Space']] },
    { action: 'Scroll the answer', keys: [['Ctrl', '↑'], ['Ctrl', '↓']] }
  ];

  const faqs = $derived([
    {
      q: 'What counts as usage?',
      a: `Time counts only while ${BRAND} is live — listening to your call. It is billed per second and pauses on its own after 5 minutes of silence, so a forgotten session never drains your hours. A quick question outside a live session uses 30 seconds.`
    },
    {
      q: 'Do hours expire?',
      a: `Hours are valid for ${plans.validity_days} days. Every top-up extends your whole remaining balance to ${plans.validity_days} days from that purchase.`
    },
    {
      q: 'Is my audio stored?',
      a: 'No. Audio is streamed to the speech model and discarded. Transcripts live only on your PC for the session. We keep your usage time and payment records — nothing else.'
    },
    {
      q: 'Which Windows versions are supported?',
      a: 'Windows 10 version 2004 or newer, and Windows 11. The installer is about 2.5 MB and uses Microsoft Edge WebView2, which is already on most PCs.'
    },
    {
      q: 'Why does my browser or Windows warn me about the installer?',
      a: `${BRAND} is new, so Chrome, Edge and Windows SmartScreen haven't seen many downloads of it yet and flag it as uncommon. It's a reputation check, not a detected threat. In Chrome, open Downloads (Ctrl+J) and choose Keep; in Edge choose Keep, then Keep anyway; on the blue "Windows protected your PC" screen click More info, then Run anyway.`
    },
    {
      q: 'Does it work with Zoom, Meet and Teams?',
      a: `Yes. ${BRAND} listens to your system audio, so it works with any app that plays sound — desktop clients and browser calls alike.`
    },
    {
      q: 'Can people see it when I share my screen?',
      a: 'No. On Windows 10 2004+ the overlay is excluded from screen capture, so it does not show up in shares or recordings. You can switch this off in settings if you want to demo it.'
    }
  ]);
</script>

<svelte:head>
  <title>{BRAND} — Answers before they finish asking</title>
  <meta
    name="description"
    content="{BRAND} is a real-time AI copilot for Windows. It hears both sides of your call, sees your screen, and streams answers into a private overlay in under a second."
  />
</svelte:head>

<!-- Hero -->
<section class="hero">
  <div class="glow" aria-hidden="true"></div>
  <div class="container hero-inner">
    <span class="badge badge-accent pill-badge">
      <span class="dot"></span> Real-time AI copilot for Windows
    </span>
    <h1>Answers before they<br class="br" /> finish asking.</h1>
    <p class="lede">
      {BRAND} listens to both sides of your call, sees your screen, and streams the right words into a
      private overlay — in under a second. For calls, meetings, sales and prep.
    </p>
    <div class="ctas">
      <DownloadButton />
      <a class="btn btn-lg" href="/login?next=/dashboard">Start free — {formatDuration(plans.trial_seconds)}</a>
    </div>
    <p class="fine muted">Windows 10 2004+ / 11 · ~2.5 MB · No card needed</p>
    <InstallHelp />
  </div>

  <div class="container mock-wrap">
    <OverlayMock />
  </div>

  <div class="container works">
    <span class="muted">Works with</span>
    <span>Zoom</span><span>Google Meet</span><span>Microsoft Teams</span><span>Webex</span><span>Slack huddles</span><span
      >any app with sound</span
    >
  </div>
</section>

<!-- Features -->
<section id="features" class="section">
  <div class="container">
    <div class="head">
      <span class="eyebrow">Why {BRAND}</span>
      <h2>Built for the moment someone asks you something.</h2>
      <p class="muted">Every millisecond between the question and your answer is designed out.</p>
    </div>

    <div class="features">
      {#each features as f (f.title)}
        <article class="feature card">
          <div class="ficon" aria-hidden="true">
            {#if f.icon === 'ears'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
                ><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg
              >
            {:else if f.icon === 'screen'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
                ><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg
              >
            {:else if f.icon === 'auto'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"
                ><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></svg
              >
            {:else if f.icon === 'hidden'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
                ><path d="M3 3l18 18" /><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3 3.9M6.6 6.6C3.9 8.4 2.5 12 2.5 12S6 19 12 19a9.8 9.8 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg
              >
            {:else if f.icon === 'focus'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
                ><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><circle cx="12" cy="12" r="2.5" /></svg
              >
            {:else if f.icon === 'feather'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
                ><path d="M20.2 3.8a6 6 0 0 0-8.5 0L5 10.5V19h8.5l6.7-6.7a6 6 0 0 0 0-8.5Z" /><path d="M16 8 2 22M17.5 15H9" /></svg
              >
            {:else if f.icon === 'clock'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
                ><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg
              >
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
                ><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg
              >
            {/if}
          </div>
          <h3>{f.title}</h3>
          <p class="muted">{f.body}</p>
        </article>
      {/each}
    </div>
  </div>
</section>

<!-- How it works -->
<section class="section">
  <div class="container">
    <div class="head">
      <span class="eyebrow">How it works</span>
      <h2>Three keys. That's the whole manual.</h2>
    </div>
    <ol class="steps">
      <li class="card">
        <span class="num">1</span>
        <h3>Install & sign in</h3>
        <p class="muted">Download the 2.5 MB installer and sign in with Google. You get 20 free minutes.</p>
      </li>
      <li class="card">
        <span class="num">2</span>
        <h3>Go live</h3>
        <p class="muted">Join your call and press <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>L</kbd>. Live captions appear for both sides.</p>
      </li>
      <li class="card">
        <span class="num">3</span>
        <h3>Get the answer</h3>
        <p class="muted">Press <kbd>Ctrl</kbd> <kbd>Enter</kbd> — or let auto-answer handle questions as they land.</p>
      </li>
    </ol>
  </div>
</section>

<!-- Shortcuts -->
<section class="section" aria-labelledby="shortcuts-title">
  <div class="container">
    <div class="shortcuts card">
      <div class="sc-head">
        <span class="eyebrow">Keyboard first</span>
        <h2 id="shortcuts-title">Works from any app. Rebind anything.</h2>
        <p class="muted">
          Shortcuts are global, so your hands never leave the keyboard. Scroll keys only activate while an
          answer is open, so they never fight your other apps.
        </p>
      </div>
      <ul class="sc-list">
        {#each shortcuts as s (s.action)}
          <li>
            <span>{s.action}</span>
            <span class="combo">
              {#each s.keys as combo, ci}
                {#if ci > 0}<span class="slash">/</span>{/if}
                {#each combo as k, ki}
                  {#if ki > 0}<span class="plus">+</span>{/if}<kbd>{k}</kbd>
                {/each}
              {/each}
            </span>
          </li>
        {/each}
      </ul>
    </div>
  </div>
</section>

<!-- Pricing -->
<section id="pricing" class="section">
  <div class="container">
    <div class="head">
      <span class="eyebrow">Pricing</span>
      <h2>Pay for the hours you use. Nothing else.</h2>
      <p class="muted">
        No subscription. Time is billed per second, only while {BRAND} is live. Prices include GST.
      </p>
    </div>
    <PromoBanner />
    <Pricing data={plans} />
  </div>
</section>

<!-- FAQ -->
<section class="section" aria-labelledby="faq-title">
  <div class="container faq-wrap">
    <div class="head left">
      <span class="eyebrow">FAQ</span>
      <h2 id="faq-title">Questions, answered.</h2>
    </div>
    <div class="faq">
      {#each faqs as f (f.q)}
        <details class="card">
          <summary>{f.q}</summary>
          <p class="muted">{f.a}</p>
        </details>
      {/each}
    </div>
  </div>
</section>

<!-- Final CTA -->
<section id="download" class="section">
  <div class="container">
    <div class="final card">
      <div class="glow small" aria-hidden="true"></div>
      <h2>Your next call, with backup.</h2>
      <p class="muted">Install in under a minute. The first 20 minutes are on us.</p>
      <div class="ctas">
        <DownloadButton />
        <a class="btn btn-lg" href="/#pricing">See pricing</a>
      </div>
      <p class="fine muted">Windows 10 2004+ / 11 · ~2.5 MB · Signed in with Google</p>
      <InstallHelp />
    </div>
  </div>
</section>

<style>
  .hero {
    position: relative;
    padding: 72px 0 24px;
    overflow: hidden;
  }
  .glow {
    position: absolute;
    left: 50%;
    top: -260px;
    width: 1100px;
    height: 820px;
    transform: translateX(-50%);
    background: radial-gradient(closest-side, rgba(245, 184, 61, 0.2), rgba(245, 184, 61, 0.05) 55%, transparent 75%);
    pointer-events: none;
  }
  .hero-inner {
    position: relative;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .pill-badge {
    height: 30px;
    padding: 0 14px;
    font-size: 13px;
  }
  h1 {
    margin-top: 22px;
    font-size: clamp(38px, 8.4vw, 76px);
    font-weight: 700;
    letter-spacing: -0.045em;
    line-height: 1.02;
    background: linear-gradient(180deg, #fff 30%, #c9cbd1);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .lede {
    margin-top: 22px;
    max-width: 640px;
    font-size: clamp(16px, 2.2vw, 19px);
    color: #b9bdc6;
  }
  .ctas {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 12px;
    margin-top: 32px;
  }
  .fine {
    margin-top: 14px;
    font-size: 13px;
  }
  .mock-wrap {
    position: relative;
    margin-top: 56px;
  }
  .works {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px 22px;
    margin-top: 40px;
    font-size: 14px;
    color: #c3c7cf;
    font-weight: 500;
  }

  .section {
    padding: 96px 0 0;
    scroll-margin-top: 64px;
  }
  .head {
    text-align: center;
    max-width: 680px;
    margin: 0 auto 44px;
  }
  .head.left {
    text-align: left;
    margin: 0;
  }
  .head h2 {
    margin-top: 12px;
    font-size: clamp(28px, 4.6vw, 44px);
    letter-spacing: -0.035em;
  }
  .head p {
    margin-top: 14px;
    font-size: 17px;
  }

  .features {
    display: grid;
    gap: 14px;
    grid-template-columns: 1fr;
  }
  @media (min-width: 600px) {
    .features {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (min-width: 1000px) {
    .features {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
  .feature {
    padding: 22px;
  }
  .ficon {
    width: 40px;
    height: 40px;
    border-radius: 11px;
    display: grid;
    place-items: center;
    color: var(--accent);
    background: var(--accent-soft);
    border: 1px solid rgba(245, 184, 61, 0.2);
  }
  .ficon svg {
    width: 20px;
    height: 20px;
  }
  .feature h3 {
    margin-top: 16px;
    font-size: 17px;
    font-weight: 600;
  }
  .feature p {
    margin-top: 8px;
    font-size: 14.5px;
  }

  .steps {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 14px;
  }
  @media (min-width: 800px) {
    .steps {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  .steps li {
    padding: 24px;
  }
  .num {
    display: inline-grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    font-size: 14px;
  }
  .steps h3 {
    margin-top: 16px;
    font-size: 18px;
    font-weight: 600;
  }
  .steps p {
    margin-top: 8px;
    font-size: 15px;
    line-height: 1.9;
  }
  .steps kbd {
    height: 22px;
    min-width: 22px;
    font-size: 11.5px;
  }

  .shortcuts {
    display: grid;
    gap: 28px;
    padding: 32px 24px;
  }
  @media (min-width: 900px) {
    .shortcuts {
      grid-template-columns: 1fr 1.15fr;
      padding: 44px;
      align-items: center;
    }
  }
  .sc-head h2 {
    margin-top: 12px;
    font-size: clamp(26px, 3.6vw, 36px);
    letter-spacing: -0.03em;
  }
  .sc-head p {
    margin-top: 12px;
  }
  .sc-list {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--bg);
  }
  .sc-list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    padding: 13px 16px;
    font-size: 15px;
    border-bottom: 1px solid var(--border);
  }
  .sc-list li:last-child {
    border-bottom: none;
  }
  .combo {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
  }
  .plus,
  .slash {
    color: var(--faint);
    font-size: 12px;
    padding: 0 1px;
  }
  .slash {
    padding: 0 6px;
  }

  .faq-wrap {
    display: grid;
    gap: 28px;
  }
  @media (min-width: 900px) {
    .faq-wrap {
      grid-template-columns: 0.8fr 1.6fr;
      gap: 48px;
    }
  }
  .faq {
    display: grid;
    gap: 10px;
  }
  details {
    padding: 0;
    overflow: hidden;
  }
  summary {
    cursor: pointer;
    list-style: none;
    padding: 18px 52px 18px 20px;
    font-weight: 600;
    position: relative;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary::after {
    content: '';
    position: absolute;
    right: 22px;
    top: 50%;
    width: 9px;
    height: 9px;
    margin-top: -7px;
    border-right: 2px solid var(--muted);
    border-bottom: 2px solid var(--muted);
    transform: rotate(45deg);
    transition: transform 0.2s;
  }
  details[open] summary::after {
    transform: rotate(-135deg);
    margin-top: -2px;
  }
  details p {
    padding: 0 20px 20px;
    font-size: 15px;
  }

  .final {
    position: relative;
    overflow: hidden;
    text-align: center;
    padding: 64px 20px;
  }
  .glow.small {
    top: auto;
    bottom: -520px;
    width: 900px;
    height: 700px;
  }
  .final h2 {
    position: relative;
    font-size: clamp(28px, 5vw, 46px);
    letter-spacing: -0.035em;
  }
  .final p {
    position: relative;
  }
  .final > p.muted:not(.fine) {
    margin-top: 12px;
    font-size: 17px;
  }
  .final .ctas {
    position: relative;
  }

  @media (max-width: 520px) {
    .br {
      display: none;
    }
    .ctas {
      width: 100%;
      flex-direction: column;
    }
    .ctas :global(.btn) {
      width: 100%;
    }
    .hero {
      padding-top: 48px;
    }
    .section {
      padding-top: 72px;
    }
  }
</style>
