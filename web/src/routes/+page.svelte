<script lang="ts">
  import { onMount } from 'svelte';
  import HeroDemo from '$lib/components/HeroDemo.svelte';
  import TryDetector from '$lib/components/TryDetector.svelte';
  import Pricing from '$lib/components/Pricing.svelte';
  import DownloadButton from '$lib/components/DownloadButton.svelte';
  import InstallHelp from '$lib/components/InstallHelp.svelte';
  import PromoBanner from '$lib/components/PromoBanner.svelte';
  import { api, type PlansResponse } from '$lib/api';
  import { FALLBACK_PLANS, paidPlans, perHour } from '$lib/plans';
  import { BRAND } from '$lib/config';
  import { formatDuration, formatINR } from '$lib/format';

  let plans = $state<PlansResponse>(FALLBACK_PLANS);
  const perHourFrom = $derived(Math.min(...paidPlans(plans).map(perHour)));
  const perHourPro = $derived(perHour(paidPlans(plans).find((p) => p.id === 'pro') ?? paidPlans(plans)[0]));

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
      body: 'One key sends what you are looking at (code, slides, a form) and you get the answer, not a summary.'
    },
    {
      icon: 'auto',
      title: 'Answers on its own',
      body: 'Glint spots the question inside everything they say, highlights it, and has the answer drafted before you press anything.'
    },
    {
      icon: 'hidden',
      title: 'Hidden from screen share',
      body: 'The overlay stays on your display only. It is excluded from screen shares and recordings.'
    },
    {
      icon: 'notes',
      title: 'Every call becomes a study note',
      body: 'Each session is saved on your PC with every question asked, what you said, and an AI review of how to answer better next time.'
    },
    {
      icon: 'lang',
      title: 'Speaks Hinglish',
      body: 'Transcribes English, Hindi and mixed Hinglish calls, and answers in the language you pick.'
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
    { action: 'Start a session · mic on / off', keys: [['Ctrl', 'Shift', 'L']] },
    { action: 'Answer now', keys: [['Ctrl', 'Enter']] },
    { action: 'Solve what’s on screen', keys: [['Ctrl', 'Shift', 'Enter']] },
    { action: 'Type a question', keys: [['Ctrl', 'Shift', 'Space']] },
    { action: 'Collapse to a bubble / expand', keys: [['Ctrl', '\\']] },
    { action: 'Scroll the answer', keys: [['Ctrl', '↑'], ['Ctrl', '↓']] },
    { action: 'See every shortcut', keys: [['Ctrl', 'Shift', '/']] }
  ];

  // Where Glint helps: one tab per use case, each with a realistic exchange.
  const uses = [
    {
      id: 'interview',
      label: 'Job interviews',
      title: 'Walk in with your best answers already written.',
      body: 'Add the company, the role and your resume. Glint answers as you, with your projects and your numbers, the moment the interviewer finishes the question.',
      points: ['Grounded in your resume and the job', 'STAR stories for behavioural rounds', 'An AI review after every interview'],
      them: 'Tell me about a time you disagreed with your manager.',
      say: 'On my last team I pushed back on shipping a checkout redesign before load testing…',
      bullets: ['Situation: big sale coming, 3× traffic expected', 'Action: proposed a 2-day test, showed the data', 'Result: caught a 40% latency spike before launch']
    },
    {
      id: 'sales',
      label: 'Sales calls',
      title: 'Handle every objection without breaking eye contact.',
      body: 'Tell Glint your product, pricing and proof points. When a prospect pushes back, the reply and the next question are already on your screen.',
      points: ['Objection handling, live', 'Next best question to keep the deal moving', 'Call notes saved automatically'],
      them: 'Honestly, your competitor is 20% cheaper.',
      say: 'Fair. Can I ask what that 20% is measured against?',
      bullets: ['Reframe on cost per closed deal, not seat price', 'Proof: onboarding in 2 days, not 3 weeks', 'Ask: “What would switching again in a year cost you?”']
    },
    {
      id: 'meeting',
      label: 'Meetings',
      title: 'Never be the one who missed what was said.',
      body: 'Live captions for both sides, an instant recap when you lose the thread, and clear answers when someone puts you on the spot.',
      points: ['Recap of the conversation, one click', 'Answers about your agenda, not generic advice', 'Questions, decisions and follow-ups saved'],
      them: 'Where are we on the Q3 migration timeline?',
      say: 'We’re on track for 15 September, with one risk on the data export.',
      bullets: ['Done: schema, staging dry run', 'Open: vendor export API rate limits', 'Ask: an owner for the fallback plan by Friday']
    },
    {
      id: 'tech',
      label: 'Technical discussions',
      title: 'Explain the code on screen like you wrote it.',
      body: 'Glint reads your screen: code, logs, diagrams, error messages. It explains the approach, the trade-offs and the complexity, with code in its own panel.',
      points: ['Code and diagrams in a side panel', 'Time and space complexity, every time', 'Works with any editor, browser or doc'],
      them: 'How would you make this endpoint handle 10× the traffic?',
      say: 'I’d cache the read path first. It’s 90% of requests and it’s idempotent.',
      bullets: ['Redis in front of /products, 60 s TTL', 'Move the PDF export to a queue', 'Then measure p95 before sharding anything']
    },
    {
      id: 'lang',
      label: 'Calls in English',
      title: 'Think in Hindi, speak in polished English.',
      body: 'For calls in a second language, Glint understands Hinglish and hands you a clear, natural sentence to say, so you sound like yourself on a good day.',
      points: ['Hinglish and Hindi transcription', 'Clear, natural phrasing to read out', 'Answers in the language you choose'],
      them: 'Could you walk us through your notice period?',
      say: 'My notice period is 60 days, and I can ask for an early release if needed.',
      bullets: ['Mention the exact date you could join', 'Offer to help with the handover', 'Keep it short, then pause']
    }
  ];
  let useId = $state('interview');
  const use = $derived(uses.find((u) => u.id === useId) ?? uses[0]);

  // Glint vs. the usual subscription copilot. Only claims about Glint we can stand behind.
  const compare: { what: string; glint: string; others: string }[] = [
    { what: 'How you pay', glint: 'Hour packs from ₹499 in rupees, billed per second while live', others: 'A monthly subscription in dollars, used or not' },
    { what: 'Who said what', glint: 'Both sides captioned and labelled separately', others: 'Often one mixed stream' },
    { what: 'Your focus', glint: 'Never takes focus from the app you are typing in', others: 'Can pull focus when you use it' },
    { what: 'After the call', glint: 'A saved session note with an AI review', others: 'Gone when you close it' },
    { what: 'Download', glint: 'A 5 MB installer, native Rust core', others: 'Often 100+ MB with a bundled browser' },
    { what: 'Forgot to stop?', glint: 'Auto-pauses after 5 minutes of silence', others: 'Keeps running' },
    { what: 'Your data', glint: 'No audio or transcripts stored on our servers', others: 'Check their policy' }
  ];

  const faqs = $derived([
    {
      q: 'What counts as usage?',
      a: `Time counts only while ${BRAND} is live, listening to your call. It is billed per second and pauses on its own after 5 minutes of silence, so a forgotten session never drains your hours. A quick question outside a live session uses 30 seconds.`
    },
    {
      q: 'Do hours expire?',
      a: `Hours are valid for ${plans.validity_days} days. Every top-up extends your whole remaining balance to ${plans.validity_days} days from that purchase.`
    },
    {
      q: 'Is my audio stored?',
      a: 'No. Audio is streamed to the speech model and discarded. Transcripts live only on your PC for the session. We keep your usage time and payment records, nothing else.'
    },
    {
      q: 'Which Windows versions are supported?',
      a: 'Windows 10 version 2004 or newer, and Windows 11. The installer is under 5 MB and uses Microsoft Edge WebView2, which is already on most PCs.'
    },
    {
      q: 'Why does my browser or Windows warn me about the installer?',
      a: `${BRAND} is new, so Chrome, Edge and Windows SmartScreen haven't seen many downloads of it yet and flag it as uncommon. It's a reputation check, not a detected threat. In Chrome, open Downloads (Ctrl+J) and choose Keep; in Edge choose Keep, then Keep anyway; on the blue "Windows protected your PC" screen click More info, then Run anyway.`
    },
    {
      q: 'Does it work with Zoom, Meet and Teams?',
      a: `Yes. ${BRAND} listens to your system audio, so it works with any app that plays sound: desktop clients and browser calls alike.`
    },
    {
      q: 'What do I get after a session?',
      a: `A note saved on your PC (Documents\\Glint Sessions) with everything said, every answer, any screenshots used, and an AI review: the questions you were asked, stronger ways to answer them, and what to prepare next. The file stays on your computer; we never store it.`
    },
    {
      q: 'I use headphones. Will it still hear the other person?',
      a: `Yes. In Settings → Audio, pick the headphones as the system audio device. ${BRAND} also tells you within a minute if it can't hear the other side of the call.`
    },
    {
      q: 'Which languages does it understand?',
      a: 'English, Hindi and mixed Hinglish, plus Spanish, French, German and Portuguese. Answers can be in any of these, and in Arabic or Japanese too.'
    },
    {
      q: 'Can I get a refund?',
      a: 'Try it free on a real or practice call before you buy. After buying, you can get a full refund within 7 days if you have used less than 10% of the hours. Hours never renew or charge you automatically.'
    },
    {
      q: 'Can people see it when I share my screen?',
      a: 'No. On Windows 10 2004+ the overlay is excluded from screen capture, so it does not show up in shares or recordings. You can switch this off in settings if you want to demo it.'
    }
  ]);
</script>

<svelte:head>
  <title>{BRAND} · Answers before they finish asking</title>
  <meta
    name="description"
    content="{BRAND} is a real-time AI copilot for Windows. It hears both sides of your call, sees your screen, and streams answers into a private overlay in under a second."
  />
</svelte:head>

<!-- Hero: the product running. Scroll plays a sample interview (see HeroDemo). -->
<HeroDemo>
  {#snippet copy()}
    <span class="kicker">Real-time AI copilot for Windows</span>
    <h1>Answers before they finish asking.</h1>
    <p class="lede">
      {BRAND} hears both sides of your call, catches the question the moment it's asked and puts the answer in a
      private overlay that screen shares can't see. Interviews, sales calls, meetings. Pay by the hour, in rupees.
    </p>
    <div class="hctas">
      <DownloadButton />
      <a class="btn btn-lg" href="/login?next=/dashboard">Start free · {formatDuration(plans.trial_seconds)}</a>
    </div>
    <p class="fine muted hero-fine">Windows 10 2004+ / 11 · ~5 MB · No card needed</p>
  {/snippet}
</HeroDemo>

<section class="after-hero">
  <div class="container">
    <InstallHelp />
    <dl class="proof">
      <div><dt>&lt; 1 s</dt><dd>to the first word</dd></div>
      <div><dt>0</dt><dd>apps it takes focus from</dd></div>
      <div><dt>{formatINR(perHourFrom)}/hr</dt><dd>lowest price, no subscription</dd></div>
      <div><dt>0 bytes</dt><dd>of your audio stored</dd></div>
    </dl>
    <div class="works">
      <span class="muted">Works with</span>
      <span>Zoom</span><span>Google Meet</span><span>Microsoft Teams</span><span>Webex</span><span>Slack huddles</span><span
        >any app with sound</span
      >
    </div>
  </div>
</section>

<!-- Use cases -->
<section id="use-cases" class="section">
  <div class="container">
    <div class="head">
      <span class="eyebrow">Where it helps</span>
      <h2>One copilot for every call that matters.</h2>
      <p class="muted">Pick a session type and {BRAND} changes how it answers: as a candidate, a seller, a teammate or an engineer.</p>
    </div>
    <div class="tabs" role="tablist" aria-label="Use cases">
      {#each uses as u (u.id)}
        <button role="tab" aria-selected={useId === u.id} class:on={useId === u.id} onclick={() => (useId = u.id)}>{u.label}</button>
      {/each}
    </div>
    <div class="use card" role="tabpanel">
      <div class="use-copy">
        <h3>{use.title}</h3>
        <p class="muted">{use.body}</p>
        <ul class="ticks">
          {#each use.points as pt (pt)}<li>{pt}</li>{/each}
        </ul>
      </div>
      <div class="use-demo" aria-label="Example">
        <div class="bubble them"><span class="who">Them</span>{use.them}</div>
        <div class="reply">
          <span class="who accent">Say</span>
          <p class="say">{use.say}</p>
          <ul>
            {#each use.bullets as b (b)}<li>{b}</li>{/each}
          </ul>
        </div>
      </div>
    </div>
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
            {:else if f.icon === 'notes'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
                ><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg
              >
            {:else if f.icon === 'lang'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
                ><path d="M4 5h8M8 3v2M6 5c0 4 3 7 6 8M10 5c0 3-2 6-6 8" /><path d="m13 21 4-9 4 9M14.5 18h5" /></svg
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

<!-- Comparison -->
<section id="compare" class="section">
  <div class="container">
    <div class="head">
      <span class="eyebrow">Why people switch</span>
      <h2>Built for how you actually use a copilot.</h2>
      <p class="muted">You have a few important calls a month, not a call every hour. So you pay for those hours, not for a subscription.</p>
    </div>
    <div class="compare card">
      <div class="crow chead">
        <span></span><span class="cg">{BRAND}</span><span class="co">Typical subscription copilot</span>
      </div>
      {#each compare as c (c.what)}
        <div class="crow">
          <span class="cw">{c.what}</span>
          <span class="cg"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>{c.glint}</span>
          <span class="co">{c.others}</span>
        </div>
      {/each}
    </div>
    <p class="cost muted">
      One interview is about an hour. On Pro that is {formatINR(perHourPro)}, less than a single coaching session.
    </p>
  </div>
</section>

<!-- How it works -->
<section class="section">
  <div class="container">
    <div class="head">
      <span class="eyebrow">How it works</span>
      <h2>Set up once. Then it just works.</h2>
    </div>
    <ol class="steps">
      <li class="card">
        <span class="num">1</span>
        <h3>Install & sign in</h3>
        <p class="muted">Download the 5 MB installer and sign in with Google. You get 20 free minutes.</p>
      </li>
      <li class="card">
        <span class="num">2</span>
        <h3>Start a session</h3>
        <p class="muted">Add your company, role and resume. Join the call and press <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>L</kbd>. Captions appear for both sides.</p>
      </li>
      <li class="card">
        <span class="num">3</span>
        <h3>Get the answer</h3>
        <p class="muted">Questions are answered as they land, or press <kbd>Ctrl</kbd> <kbd>Enter</kbd>. End the session and get a review to learn from.</p>
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
      <p class="muted">Try the detector, then install in under a minute. The first 20 minutes are on us.</p>
      <div class="try-wrap"><TryDetector /></div>
      <div class="ctas">
        <DownloadButton />
        <a class="btn btn-lg" href="/#pricing">See pricing</a>
      </div>
      <p class="fine muted">Windows 10 2004+ / 11 · ~5 MB · Signed in with Google</p>
      <InstallHelp />
    </div>
  </div>
</section>

<style>
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
  /* Hero copy (rendered inside HeroDemo's stage, styled here). Lead-anchored, not centred. */
  .kicker {
    display: inline-block;
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
    letter-spacing: 0.01em;
  }
  h1 {
    margin-top: 16px;
    font-size: clamp(34px, 5.2vw, 68px);
    font-weight: 700;
    letter-spacing: -0.04em;
    line-height: 1.02;
    color: #f4f4f6;
    text-wrap: balance;
  }
  .lede {
    margin-top: 20px;
    max-width: 34rem;
    font-size: clamp(16px, 1.4vw, 18px);
    line-height: 1.6;
    color: #b9bdc6;
    text-wrap: pretty;
  }
  .hctas {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 28px;
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
  @media (max-width: 899px) {
    h1 {
      font-size: clamp(30px, 8.6vw, 40px);
    }
    .lede,
    .hero-fine {
      display: none;
    }
    .hctas {
      margin-top: 16px;
    }
  }
  .after-hero {
    position: relative;
    padding: 40px 0 0;
    text-align: center;
  }
  .after-hero .proof {
    margin-inline: auto;
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

  .proof {
    margin: 36px 0 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    width: 100%;
    max-width: 760px;
  }
  @media (min-width: 720px) {
    .proof {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
  .proof div {
    padding: 14px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: rgba(255, 255, 255, 0.02);
  }
  .proof dt {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--text);
  }
  .proof dd {
    margin: 2px 0 0;
    font-size: 12.5px;
    color: var(--muted);
  }
  .tabs {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 4px;
    margin-bottom: 14px;
    scrollbar-width: none;
    justify-content: flex-start;
  }
  @media (min-width: 900px) {
    .tabs {
      justify-content: center;
    }
  }
  .tabs button {
    flex: none;
    height: 38px;
    padding: 0 16px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--border);
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 14px;
    font-weight: 550;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .tabs button:hover {
    color: var(--text);
    border-color: var(--border-strong);
  }
  .tabs button.on {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-ink);
  }
  .use {
    display: grid;
    gap: 28px;
    padding: 26px 22px;
  }
  @media (min-width: 900px) {
    .use {
      grid-template-columns: 1fr 1.1fr;
      padding: 40px;
      align-items: center;
    }
  }
  .use h3 {
    font-size: clamp(22px, 3vw, 28px);
    letter-spacing: -0.025em;
    line-height: 1.2;
  }
  .use-copy > p {
    margin-top: 12px;
    font-size: 16px;
  }
  .ticks {
    list-style: none;
    padding: 0;
    margin: 18px 0 0;
    display: grid;
    gap: 9px;
  }
  .ticks li {
    position: relative;
    padding-left: 26px;
    font-size: 15px;
  }
  .ticks li::before {
    content: '';
    position: absolute;
    left: 2px;
    top: 4px;
    width: 12px;
    height: 7px;
    border-left: 2px solid var(--accent);
    border-bottom: 2px solid var(--accent);
    transform: rotate(-45deg);
  }
  .use-demo {
    display: grid;
    gap: 10px;
    padding: 18px;
    border-radius: 14px;
    background: var(--bg);
    border: 1px solid var(--border);
    min-width: 0;
  }
  .who {
    display: block;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--faint);
    margin-bottom: 4px;
  }
  .who.accent {
    color: var(--accent);
  }
  .bubble.them {
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--surface-2);
    font-size: 15px;
  }
  .reply {
    padding: 14px;
    border-radius: 12px;
    border: 1px solid rgba(245, 184, 61, 0.25);
    background: var(--accent-soft);
  }
  .say {
    font-size: 16px;
    font-weight: 600;
    line-height: 1.45;
  }
  .reply ul {
    margin: 10px 0 0;
    padding-left: 18px;
    display: grid;
    gap: 4px;
    font-size: 14px;
    color: #cfd2d8;
  }
  .compare {
    padding: 6px 0;
    overflow: hidden;
  }
  .crow {
    display: grid;
    grid-template-columns: 1fr;
    gap: 4px;
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
    font-size: 14.5px;
  }
  .crow:last-child {
    border-bottom: none;
  }
  @media (min-width: 760px) {
    .crow {
      grid-template-columns: 0.7fr 1.4fr 1.2fr;
      gap: 18px;
      align-items: center;
    }
  }
  .chead {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  @media (max-width: 759px) {
    .chead {
      display: none;
    }
    .co::before {
      content: 'Others: ';
      color: var(--faint);
    }
  }
  .chead .cg {
    color: var(--accent);
  }
  .cw {
    font-weight: 600;
  }
  .cg {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    color: var(--text);
  }
  .cg svg {
    flex: none;
    width: 16px;
    height: 16px;
    margin-top: 3px;
    fill: none;
    stroke: var(--ok);
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .co {
    color: var(--muted);
  }
  .cost {
    margin-top: 18px;
    text-align: center;
    font-size: 15px;
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
  .try-wrap {
    width: 100%;
    max-width: 640px;
    margin: 28px auto 0;
    position: relative;
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
    .ctas {
      width: 100%;
      flex-direction: column;
    }
    .ctas :global(.btn) {
      width: 100%;
    }
    .hctas :global(.btn) {
      flex: 1 1 auto;
    }
    .section {
      padding-top: 72px;
    }
  }
</style>
