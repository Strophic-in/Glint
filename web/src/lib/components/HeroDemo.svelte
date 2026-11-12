<script lang="ts">
  // The hero is the product running. Scroll is the interviewer: it speaks a sample line word by
  // word into Glint's captions, the same question detector the app ships highlights the question as
  // it forms, the auto-answer streams, and then a divider sweeps across to show what the other side
  // of the call sees (no Glint). All state below is computed from one progress value, p ∈ [0, 1].
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import { extractQuestion } from '$lib/question';

  let { copy }: { copy: Snippet } = $props();

  const LINE =
    'Okay, thanks for walking me through your resume. So, what actually happens when you type a URL into the browser? Take your time.';
  const SAY =
    'The browser finds the server with DNS, opens a secure connection, asks for the page over HTTP, then builds and paints what comes back.';
  const POINTS = [
    'DNS: browser cache, OS, then a resolver returns the IP',
    'TCP handshake, then TLS for HTTPS',
    'HTML in, DOM and CSSOM built, layout, then paint'
  ];
  const words = LINE.split(' ');

  // Timeline (fractions of the pinned scroll).
  const T = { speak: [0.04, 0.36], think: 0.4, say: [0.43, 0.58], points: [0.58, 0.66], wipe: [0.72, 0.9] } as const;

  let section: HTMLElement | undefined = $state();
  let p = $state(0);
  let reduced = $state(false);

  const ramp = (a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)));

  const heard = $derived(words.slice(0, Math.round(ramp(T.speak[0], T.speak[1]) * words.length)).join(' '));
  const q = $derived(extractQuestion(heard));
  const speaking = $derived(p > T.speak[0] && p < T.speak[1]);
  const thinking = $derived(p >= T.think && p < T.say[0]);
  const answered = $derived(p >= T.say[0]);
  const said = $derived(SAY.slice(0, Math.round(ramp(T.say[0], T.say[1]) * SAY.length)));
  const shownPoints = $derived(Math.round(ramp(T.points[0], T.points[1]) * POINTS.length));
  const wipe = $derived(ramp(T.wipe[0], T.wipe[1]));

  // Once the wipe has arrived, the divider is a before/after slider: drag it (or use the arrow
  // keys) to compare what you see with what the interviewer sees. Scrolling back before the wipe
  // hands control back to the scroll.
  let screenEl: HTMLDivElement | undefined = $state();
  let manual = $state<number | null>(null); // 0..1 from the left edge
  let dragging = $state(false);
  const split = $derived(manual ?? 1 - wipe * 0.5);
  const canSlide = $derived(wipe > 0.02);
  $effect(() => {
    if (!canSlide) manual = null;
  });
  const clampSplit = (v: number) => Math.min(0.98, Math.max(0.02, v));
  function slideTo(clientX: number) {
    if (!screenEl) return;
    const r = screenEl.getBoundingClientRect();
    manual = clampSplit((clientX - r.left) / r.width);
  }
  function onSlideDown(e: PointerEvent) {
    if (!canSlide || e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    slideTo(e.clientX);
  }
  function onSlideMove(e: PointerEvent) {
    if (dragging) slideTo(e.clientX);
  }
  function onSlideUp() {
    dragging = false;
  }
  function onSlideKey(e: KeyboardEvent) {
    const step = e.shiftKey ? 0.1 : 0.03;
    if (e.key === 'ArrowLeft') manual = clampSplit(split - step);
    else if (e.key === 'ArrowRight') manual = clampSplit(split + step);
    else if (e.key === 'Home') manual = 0.02;
    else if (e.key === 'End') manual = 0.98;
    else return;
    e.preventDefault();
  }
  const clock = $derived(724 + Math.round(p * 95));

  const status = $derived(
    wipe > 0.02
      ? 'Right side: the shared screen. Glint isn’t in it. Drag the slider to compare.'
      : answered
        ? 'Answered before you had to think about it.'
        : thinking
          ? 'Question detected. Answering…'
          : q
            ? 'Question detected.'
            : p > T.speak[0]
              ? 'Listening to both sides of the call…'
              : 'Scroll to play the sample interview.'
  );

  onMount(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduced = mq.matches;
    if (reduced) {
      p = 0.95; // the resolved state: question, answer and the split, no pinning
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      if (!section) return;
      const r = section.getBoundingClientRect();
      const travel = r.height - window.innerHeight;
      p = travel > 0 ? Math.min(1, Math.max(0, -r.top / travel)) : 0;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  });

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
</script>

{#snippet call(withGlint: boolean)}
  <div class="call">
    <div class="titlebar">
      <span class="lights" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="ttl">Frontend Engineer · interview</span>
      <span class="rec-ext" aria-hidden="true">● Recording</span>
    </div>
    <div class="tiles">
      <div class="tile them" class:talking={speaking}>
        <span class="avatar">AR</span>
        <span class="name">Interviewer</span>
      </div>
      <div class="tile you">
        <span class="avatar you">YOU</span>
        <span class="name">You</span>
      </div>
    </div>
    <div class="toolbar" aria-hidden="true"><i></i><i></i><i class="hang"></i><i></i></div>
    {#if !withGlint}<span class="seen-label">What the interviewer sees</span>{/if}
  </div>
{/snippet}

<section class="demo" class:reduced bind:this={section} aria-label="Glint, answering a sample interview question">
  <div class="stage" style:--p={p} style:--w={wipe}>
    <div class="glow" aria-hidden="true"></div>

    <div class="copy">
      {@render copy()}
      <p class="status" aria-live="polite"><span class="pulse" class:on={p > T.speak[0] && wipe < 0.02}></span>{status}</p>
    </div>

    <div class="screen" bind:this={screenEl}>
      <span class="sample" aria-hidden="true">Sample call · live demo</span>
      <div class="plane back" aria-hidden="true">{@render call(true)}</div>

      <!-- The Glint overlay, on its own plane above the call. -->
      <div class="plane overlay" aria-hidden="true">
        <div class="g-bar">
          <span class="spark" class:busy={thinking}></span>
          <span class="chip">Interview · Acme</span>
          <span class="rec"><i></i>{mmss(clock)}</span>
          <span class="meters"><i style:transform="scaleY({speaking ? 0.35 + (heard.length % 7) / 10 : 0.15})"></i><i></i></span>
          <span class="answer-btn">Answer</span>
          <span class="grow"></span>
          <span class="left">1h 42m</span>
        </div>
        <div class="g-panel">
          <p class="cap">
            <b>Them</b>
            {#if heard}
              {#if q}{heard.slice(0, q.start)}<mark>{heard.slice(q.start, q.end)}</mark>{heard.slice(q.end)}{:else}{heard}{/if}{#if speaking}<span class="caret"></span>{/if}
            {:else}
              <span class="dim">Listening…</span>
            {/if}
          </p>
          {#if thinking || answered}
            <div class="ans">
              <div class="ans-head"><span class="lbl">Answer · auto</span>{#if answered}<span class="ms">0.8s</span>{/if}</div>
              {#if q}<p class="asked"><span>Q</span>{q.text}</p>{/if}
              {#if thinking}
                <div class="skel"><i style:width="86%"></i><i style:width="60%"></i></div>
              {:else}
                <p class="say">{said}{#if said.length < SAY.length}<span class="caret"></span>{/if}</p>
                <ul>
                  {#each POINTS.slice(0, shownPoints) as pt (pt)}<li>{pt}</li>{/each}
                </ul>
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <!-- Foreground: what makes it safe, nearest to the viewer. -->
      <div class="plane fore" aria-hidden="true">
        <span class="pill">Never takes focus</span>
        <span class="pill hide">Hidden from screen share</span>
      </div>

      <!-- The peak: the shared screen, wiping in from the right. No overlay on it. -->
      <div class="plane shared" aria-hidden="true" style:clip-path="inset(0 0 0 {split * 100}%)">{@render call(false)}</div>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        class="divider"
        class:on={wipe > 0.01}
        class:live={canSlide}
        class:dragging
        style:left="{split * 100}%"
        role="slider"
        tabindex={canSlide ? 0 : -1}
        aria-label="Compare what you see with what the interviewer sees"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(split * 100)}
        aria-valuetext="{Math.round(split * 100)}% your view"
        onpointerdown={onSlideDown}
        onpointermove={onSlideMove}
        onpointerup={onSlideUp}
        onpointercancel={onSlideUp}
        onkeydown={onSlideKey}
      >
        <span class="tag l">You see</span><span class="tag r">They see</span>
        <span class="knob" aria-hidden="true"
          ><svg viewBox="0 0 24 24"><path d="M9 7l-5 5 5 5M15 7l5 5-5 5" /></svg></span
        >
      </div>
    </div>
  </div>
</section>

<style>
  .demo {
    position: relative;
    height: 380vh;
  }
  .demo.reduced {
    height: auto;
  }
  .stage {
    position: sticky;
    top: 0;
    height: 100vh;
    height: 100svh;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
    align-items: center;
    gap: clamp(28px, 4vw, 64px);
    padding: 72px max(var(--gutter), calc((100vw - 1240px) / 2)) 24px;
    overflow: hidden;
  }
  .reduced .stage {
    position: relative;
    height: auto;
    min-height: 100svh;
  }
  .glow {
    position: absolute;
    right: -10%;
    top: 8%;
    width: 70vw;
    height: 80vh;
    background: radial-gradient(closest-side, rgba(245, 184, 61, 0.16), transparent 70%);
    transform: translateY(calc(var(--p) * -60px)) scale(calc(1 + var(--p) * 0.1));
    pointer-events: none;
  }
  .copy {
    position: relative;
    z-index: 2;
    transform: translateY(calc(var(--p) * -18px));
  }
  .status {
    margin-top: 26px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    color: var(--muted);
    min-height: 1.5em;
  }
  .pulse {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--faint);
    flex: none;
  }
  .pulse.on {
    background: var(--live);
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }

  /* ── The screen and its planes ── */
  .screen {
    position: relative;
    z-index: 1;
    aspect-ratio: 16 / 11;
    width: 100%;
    max-height: calc(100svh - 120px);
    justify-self: center;
  }
  .sample {
    position: absolute;
    top: -26px;
    right: 0;
    font-size: 12px;
    color: var(--faint);
    letter-spacing: 0.02em;
    opacity: calc(1 - var(--w) * 5);
  }
  .plane {
    position: absolute;
    inset: 0;
  }
  /* Different rates are the depth: the call recedes, the overlay comes forward, chips come further. */
  .back {
    transform: scale(calc(1 - var(--p) * 0.035));
  }
  .overlay {
    inset: 46px 5% auto 5%;
    transform: translateY(calc(var(--p) * -14px)) scale(calc(1 + var(--p) * 0.03));
    z-index: 2;
  }
  .fore {
    z-index: 3;
    inset: auto -3% -5% auto;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    transform: translateY(calc(var(--p) * -46px));
    /* Out of the way before the wipe reaches them, so they never get sliced. */
    opacity: calc(1 - var(--w) * 5);
  }
  .shared {
    z-index: 4;
  }
  .call {
    position: absolute;
    inset: 0;
    border-radius: 14px;
    background: #15171d;
    border: 1px solid var(--border-strong);
    box-shadow: 0 30px 80px -30px rgba(0, 0, 0, 0.9);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .titlebar {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 34px;
    padding: 0 12px;
    font-size: 12px;
    color: var(--muted);
    border-bottom: 1px solid var(--border);
  }
  .lights {
    display: inline-flex;
    gap: 6px;
  }
  .lights i {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--surface-3);
  }
  .ttl {
    flex: 1;
  }
  .rec-ext {
    color: #ff8a8d;
    font-size: 11px;
  }
  .tiles {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 8px;
  }
  .tile {
    position: relative;
    border-radius: 10px;
    background: linear-gradient(160deg, #20242d, #191c23);
    display: grid;
    place-items: center;
    outline: 2px solid transparent;
    transition: outline-color 0.2s;
  }
  .tile.talking {
    outline-color: rgba(61, 220, 151, 0.7);
  }
  .avatar {
    width: 22%;
    aspect-ratio: 1;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: #2f3644;
    color: #cfd6e4;
    font-weight: 650;
    font-size: clamp(11px, 1.3vw, 18px);
  }
  .avatar.you {
    background: #3a3428;
    color: #f2d9a6;
    font-size: clamp(9px, 1vw, 13px);
  }
  .name {
    position: absolute;
    left: 10px;
    bottom: 8px;
    font-size: 11.5px;
    color: #cfd2d8;
  }
  .toolbar {
    display: flex;
    justify-content: center;
    gap: 10px;
    padding: 10px;
  }
  .toolbar i {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--surface-3);
  }
  .toolbar i.hang {
    background: #c9393e;
    width: 40px;
    border-radius: 14px;
  }
  .seen-label {
    position: absolute;
    right: 12px;
    top: 44px;
    font-size: 11.5px;
    font-weight: 600;
    color: #0e1a14;
    background: var(--ok);
    padding: 3px 9px;
    border-radius: 999px;
  }

  /* ── The Glint overlay (mirrors the app's look) ── */
  .g-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    padding: 0 10px;
    border-radius: 13px;
    background: rgba(14, 15, 20, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.45);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
  }
  .spark {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: conic-gradient(var(--accent), #ff7a3d, var(--accent));
    flex: none;
  }
  .spark.busy {
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .chip,
  .rec,
  .left {
    padding: 3px 8px;
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.06);
    color: #d6d9df;
  }
  .rec {
    color: #ff9ea1;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-variant-numeric: tabular-nums;
  }
  .rec i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--live);
  }
  .meters {
    display: inline-flex;
    align-items: flex-end;
    gap: 2px;
    height: 14px;
  }
  .meters i {
    width: 3px;
    height: 14px;
    border-radius: 2px;
    background: var(--ok);
    transform-origin: bottom;
    transform: scaleY(0.2);
    transition: transform 0.12s;
  }
  .answer-btn {
    padding: 4px 10px;
    border-radius: 8px;
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 650;
  }
  .grow {
    flex: 1;
  }
  .left {
    color: var(--muted);
  }
  .g-panel {
    margin-top: 6px;
    border-radius: 13px;
    background: rgba(14, 15, 20, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
    padding: 10px 12px;
    font-size: clamp(11.5px, 1.05vw, 13.5px);
    line-height: 1.5;
  }
  .cap {
    color: #e9eaee;
  }
  .cap b {
    color: #ffd27a;
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-right: 6px;
  }
  .cap .dim {
    color: var(--faint);
  }
  mark {
    color: #ffe14d;
    background: rgba(255, 225, 77, 0.16);
    font-weight: 600;
    border-radius: 4px;
    padding: 0 3px;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
  }
  .caret {
    display: inline-block;
    width: 6px;
    height: 1em;
    margin-left: 2px;
    vertical-align: -2px;
    background: var(--accent);
    animation: blink 1s steps(2) infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
  .ans {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .ans-head {
    display: flex;
    justify-content: space-between;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .ms {
    color: var(--faint);
    font-weight: 500;
    letter-spacing: 0;
  }
  .asked {
    margin: 6px 0;
    padding: 5px 9px;
    border-radius: 7px;
    background: rgba(255, 225, 77, 0.14);
    color: #ffe14d;
    font-weight: 600;
  }
  .asked span {
    font-size: 10px;
    font-weight: 800;
    opacity: 0.75;
    margin-right: 7px;
  }
  .say {
    font-weight: 600;
    color: #fff;
  }
  .ans ul {
    margin: 6px 0 0;
    padding-left: 16px;
    color: #c9ccd3;
  }
  .skel {
    display: grid;
    gap: 6px;
    padding: 6px 0;
  }
  .skel i {
    height: 9px;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.08);
  }
  .pill {
    font-size: 12.5px;
    font-weight: 600;
    padding: 7px 13px;
    border-radius: 999px;
    background: var(--surface-2);
    border: 1px solid var(--border-strong);
    box-shadow: 0 10px 24px -8px rgba(0, 0, 0, 0.7);
  }
  .pill.hide {
    color: var(--ok);
  }
  .divider {
    position: absolute;
    top: -14px;
    bottom: -14px;
    z-index: 5;
    width: 2px;
    margin-left: -1px;
    background: var(--accent);
    opacity: 0;
    transition: opacity 0.2s;
  }
  .divider.on {
    opacity: 1;
  }
  /* A wide invisible grab area around the 2 px line. */
  .divider::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: -14px;
    right: -14px;
  }
  .divider.live {
    cursor: ew-resize;
    touch-action: none;
  }
  .divider.live:focus-visible {
    outline: none;
  }
  .divider.live:focus-visible .knob {
    outline: 2px solid #fff;
    outline-offset: 3px;
  }
  .knob {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 38px;
    height: 38px;
    margin: -19px 0 0 -19px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--accent);
    color: var(--accent-ink);
    box-shadow: 0 6px 18px -4px rgba(0, 0, 0, 0.7);
    opacity: 0;
    transform: scale(0.6);
    transition:
      opacity 0.2s,
      transform 0.2s;
  }
  .divider.live .knob {
    opacity: 1;
    transform: scale(1);
  }
  .divider.dragging .knob {
    transform: scale(1.1);
  }
  .knob svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .tag {
    position: absolute;
    top: -12px;
    font-size: 11.5px;
    font-weight: 700;
    padding: 3px 9px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .tag.l {
    right: 8px;
    background: var(--accent);
    color: var(--accent-ink);
  }
  .tag.r {
    left: 8px;
    background: var(--ok);
    color: #0e1a14;
  }

  /* ── Phone: its own composition. Copy on top, the screen below, a shorter pin. ── */
  @media (max-width: 899px) {
    .demo {
      height: 300vh;
    }
    .stage {
      grid-template-columns: 1fr;
      align-content: start;
      gap: 18px;
      padding-top: 88px;
    }
    .screen {
      aspect-ratio: 4 / 5;
      max-height: none;
      max-width: 460px;
    }
    .tiles {
      grid-template-columns: 1fr;
    }
    .overlay {
      inset: 42px 3% auto 3%;
    }
    .g-bar .chip,
    .g-bar .left,
    .g-bar .meters {
      display: none;
    }
    .fore {
      inset: auto 2% -3% auto;
    }
    .status {
      margin-top: 12px;
    }
  }
  @media (max-width: 899px) and (max-height: 760px) {
    .screen {
      aspect-ratio: 1 / 1;
    }
  }
</style>
