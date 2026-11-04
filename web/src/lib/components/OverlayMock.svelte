<script lang="ts">
  import { onMount } from 'svelte';

  const QUESTION = 'So how would you scale this to a million users?';
  const SAY =
    "I'd keep the API stateless and scale it horizontally, then attack the read path first — that's where most of the load is.";
  const POINTS = [
    ['Stateless API', 'behind a load balancer; autoscale on p95 latency'],
    ['Redis cache', 'for hot reads, Postgres read replicas behind it'],
    ['Queue writes', 'and heavy jobs (Kafka / SQS) so spikes never block users']
  ];

  let caption = $state(QUESTION);
  let said = $state(SAY);
  let shown = $state(POINTS.length);
  let phase = $state<'listening' | 'thinking' | 'answering' | 'done'>('done');
  let clock = $state(761);

  onMount(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick = setInterval(() => (clock += 1), 1000);
    if (reduce) return () => clearInterval(tick);

    let timers: ReturnType<typeof setTimeout>[] = [];
    let stopped = false;
    const wait = (ms: number) =>
      new Promise<void>((r) => {
        timers.push(setTimeout(r, ms));
      });

    async function loop() {
      while (!stopped) {
        phase = 'listening';
        caption = '';
        said = '';
        shown = 0;
        const words = QUESTION.split(' ');
        for (let i = 1; i <= words.length && !stopped; i++) {
          caption = words.slice(0, i).join(' ');
          await wait(150);
        }
        phase = 'thinking';
        await wait(650);
        phase = 'answering';
        const sayWords = SAY.split(' ');
        for (let i = 1; i <= sayWords.length && !stopped; i++) {
          said = sayWords.slice(0, i).join(' ');
          await wait(38);
        }
        for (let i = 1; i <= POINTS.length && !stopped; i++) {
          await wait(230);
          shown = i;
        }
        phase = 'done';
        await wait(4200);
      }
    }
    loop();

    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
      clearInterval(tick);
    };
  });

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
</script>

<div class="stage" aria-label="Preview of the Glint overlay answering a question during a video call" role="img">
  <!-- The "call" underneath -->
  <div class="call">
    <div class="titlebar">
      <span class="lights"><i></i><i></i><i></i></span>
      <span class="title">System design round · Meet</span>
    </div>
    <div class="tiles">
      <div class="tile speaking" class:active={phase === 'listening'}>
        <div class="avatar">PR</div>
        <span class="name">Priya · Interviewer</span>
      </div>
      <div class="tile">
        <div class="avatar you">YOU</div>
        <span class="name">You</span>
      </div>
    </div>
    <div class="callbar">
      <span></span><span></span><span class="end"></span><span></span>
    </div>
  </div>

  <!-- The Glint overlay -->
  <div class="overlay">
    <div class="pill">
      <span class="g">
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"
          ><path
            d="M12 1.5c.62 4.6 2.3 6.28 6.9 6.9-4.6.62-6.28 2.3-6.9 6.9-.62-4.6-2.3-6.28-6.9-6.9 4.6-.62 6.28-2.3 6.9-6.9Z"
            fill="currentColor"
          /></svg
        >
      </span>
      <span class="chip live">
        <span class="dot dot-pulse"></span>
        <span class="lbl">Listening</span>
        <span class="mono">{mmss(clock)}</span>
      </span>
      <span class="chip" class:hot={phase === 'thinking' || phase === 'answering'}>
        <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"
          ><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" fill="currentColor" /></svg
        >
        <span class="lbl">Answer</span>
        <span class="keys"><kbd>Ctrl</kbd><kbd>↵</kbd></span>
      </span>
      <span class="chip opt">
        <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"
          ><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg
        >
        <span class="lbl">Screen</span>
      </span>
      <span class="spacer"></span>
      <span class="bal mono">2h 41m</span>
    </div>

    <div class="panel">
      <div class="caption">
        <span class="who">Them</span>
        <span class="said">{caption}{#if phase === 'listening'}<span class="caret"></span>{/if}</span>
      </div>

      <div class="answer">
        <div class="meta">
          <span class="spark" class:spin={phase === 'thinking'}></span>
          {#if phase === 'thinking'}
            <span>Thinking…</span>
          {:else}
            <span>Answer</span><span class="faint">· 0.6s</span>
          {/if}
        </div>
        <p class="say">
          {#if said}<b>Say:</b> “{said}{phase === 'answering' && shown === 0 ? '' : '”'}{/if}{#if phase === 'answering' && shown === 0}<span
              class="caret"
            ></span>{/if}
        </p>
        <ul>
          {#each POINTS as [k, v], i}
            <li class:in={i < shown}><b>{k}</b> {v}</li>
          {/each}
        </ul>
        <div class="chips">
          <span>Shorter</span><span>More detail</span><span class="opt">Example</span><span>Follow-ups</span>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .stage {
    position: relative;
    width: 100%;
    max-width: 900px;
    margin: 0 auto;
    padding-top: 26px;
  }

  /* ---------- the video call ---------- */
  .call {
    position: relative;
    border-radius: 18px;
    border: 1px solid var(--border);
    background: linear-gradient(180deg, #151821, #0f1117);
    box-shadow: 0 40px 120px -40px rgba(0, 0, 0, 0.9);
    overflow: hidden;
  }
  .titlebar {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 38px;
    padding: 0 14px;
    border-bottom: 1px solid var(--border);
    font-size: 12.5px;
    color: var(--faint);
  }
  .lights {
    display: flex;
    gap: 6px;
  }
  .lights i {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #2a2e39;
  }
  .title {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tiles {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    padding: 14px;
    padding-top: clamp(220px, 46vw, 330px);
  }
  .tile {
    position: relative;
    aspect-ratio: 16 / 10;
    border-radius: 12px;
    background:
      radial-gradient(120% 90% at 30% 20%, rgba(120, 140, 255, 0.12), transparent 60%),
      linear-gradient(160deg, #1d2130, #141720);
    border: 1px solid var(--border);
    display: grid;
    place-items: center;
    transition: box-shadow 0.3s;
  }
  .tile.speaking.active {
    box-shadow: 0 0 0 2px rgba(61, 220, 151, 0.55);
  }
  .avatar {
    width: clamp(40px, 9vw, 64px);
    height: clamp(40px, 9vw, 64px);
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-weight: 700;
    font-size: clamp(12px, 2.2vw, 18px);
    background: #3b4466;
    color: #dfe4ff;
  }
  .avatar.you {
    background: #2c3a33;
    color: #c9f2dd;
    font-size: clamp(10px, 1.8vw, 14px);
  }
  .name {
    position: absolute;
    left: 10px;
    bottom: 8px;
    font-size: 11.5px;
    color: #c3c8d4;
    background: rgba(0, 0, 0, 0.35);
    padding: 2px 8px;
    border-radius: 6px;
    max-width: calc(100% - 20px);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .callbar {
    display: flex;
    justify-content: center;
    gap: 10px;
    padding: 4px 0 14px;
  }
  .callbar span {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: #232734;
  }
  .callbar .end {
    width: 50px;
    border-radius: 17px;
    background: #6b2326;
  }

  /* ---------- the overlay ---------- */
  .overlay {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: min(600px, calc(100% - 20px));
    font-family: 'Segoe UI Variable Text', var(--font);
    z-index: 2;
  }
  .pill {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 46px;
    padding: 0 8px 0 10px;
    border-radius: 999px;
    background: rgba(18, 19, 25, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.06) inset,
      0 18px 50px -12px rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    font-size: 13px;
    white-space: nowrap;
  }
  .g {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    color: var(--accent);
    background: var(--accent-soft);
    flex: none;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 10px;
    border-radius: 999px;
    color: #d8dbe1;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.06);
    transition: background 0.2s, color 0.2s, border-color 0.2s;
    flex: none;
  }
  .chip.live {
    color: var(--live);
    background: rgba(255, 90, 95, 0.1);
    border-color: rgba(255, 90, 95, 0.22);
  }
  .chip.live .mono {
    color: #ffb3b5;
  }
  .chip.hot {
    color: var(--accent-ink);
    background: var(--accent);
    border-color: var(--accent);
  }
  .chip.hot kbd {
    background: rgba(0, 0, 0, 0.12);
    border-color: rgba(0, 0, 0, 0.18);
    color: var(--accent-ink);
  }
  .keys {
    display: inline-flex;
    gap: 3px;
  }
  .chip kbd {
    height: 19px;
    min-width: 19px;
    padding: 0 5px;
    font-size: 10.5px;
    border-radius: 5px;
    border-bottom-width: 1px;
    background: rgba(255, 255, 255, 0.06);
    transition: inherit;
  }
  .mono {
    font-family: var(--mono);
    font-size: 12px;
  }
  .spacer {
    flex: 1;
    min-width: 0;
  }
  .bal {
    color: var(--muted);
    padding-right: 6px;
  }

  .panel {
    margin-top: 8px;
    border-radius: 16px;
    background: rgba(18, 19, 25, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.9);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    overflow: hidden;
    text-align: left;
  }
  .caption {
    display: flex;
    gap: 10px;
    align-items: baseline;
    padding: 11px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    font-size: 13.5px;
    color: #c7cbd3;
    min-height: 42px;
  }
  .who {
    flex: none;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ok);
  }
  .said {
    min-width: 0;
  }
  .answer {
    padding: 14px 16px 14px;
    font-size: 14px;
    line-height: 1.55;
    min-height: 196px;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 8px;
  }
  .faint {
    color: var(--faint);
    font-weight: 500;
  }
  .spark {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: var(--accent);
    transform: rotate(45deg);
  }
  .spark.spin {
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(405deg);
    }
  }
  .say {
    color: #eef0f3;
    min-height: 44px;
  }
  .say b {
    color: var(--accent);
    font-weight: 600;
  }
  ul {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  li {
    position: relative;
    padding-left: 16px;
    color: #c9ccd3;
    font-size: 13.5px;
    opacity: 0;
    transform: translateY(4px);
    transition: opacity 0.25s, transform 0.25s;
  }
  li.in {
    opacity: 1;
    transform: none;
  }
  li::before {
    content: '';
    position: absolute;
    left: 2px;
    top: 0.62em;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--accent);
  }
  li b {
    color: #f1f2f4;
    font-weight: 600;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 14px;
  }
  .chips span {
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 999px;
    color: var(--muted);
    border: 1px solid rgba(255, 255, 255, 0.09);
    background: rgba(255, 255, 255, 0.03);
  }
  .caret {
    display: inline-block;
    width: 2px;
    height: 1.05em;
    margin-left: 2px;
    vertical-align: -0.15em;
    background: var(--accent);
    animation: blink 1s steps(1) infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0;
    }
  }

  @media (max-width: 560px) {
    .opt {
      display: none !important;
    }
    .keys {
      display: none;
    }
    .pill {
      gap: 5px;
      padding: 0 6px 0 8px;
    }
    .chip {
      padding: 0 9px;
    }
    .answer {
      min-height: 250px;
      font-size: 13.5px;
    }
    .tiles {
      padding-top: 430px;
    }
  }
  @media (max-width: 380px) {
    .chip.live .lbl {
      display: none;
    }
  }
</style>
