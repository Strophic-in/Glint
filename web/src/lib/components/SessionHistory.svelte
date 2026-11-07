<script lang="ts">
  // The dashboard's session list: usage rows grouped into the sessions the user ran in the app,
  // each expandable into its timeline (listening periods, answers, time charged). Rows from app
  // versions that didn't tag sessions are grouped by time instead (gaps under 10 minutes).
  import type { UsageRow } from '$lib/api';
  import { formatDuration, toDate } from '$lib/format';

  let { rows }: { rows: UsageRow[] } = $props();

  type Session = {
    key: string;
    title: string;
    start: number;
    end: number;
    used: number;
    listened: number;
    answers: number;
    items: UsageRow[];
  };

  const GAP = 10 * 60_000;
  const ACTIONS: Record<string, string> = {
    answer: 'Answer',
    screen: 'Screen answer',
    ask: 'Typed question',
    shorter: 'Shorter version',
    expand: 'More detail',
    followups: 'Follow-up questions',
    recap: 'Recap',
    summary: 'Session review'
  };

  const ms = (t: number) => (t < 1e12 ? t * 1000 : t);

  function build(list: UsageRow[]): Session[] {
    const sorted = [...list].sort((a, b) => a.started_at - b.started_at);
    const tagged = new Map<string, Session>();
    const loose: Session[] = [];
    const make = (key: string, title: string, r: UsageRow): Session => ({
      key,
      title,
      start: ms(r.started_at),
      end: ms(r.ended_at ?? r.started_at),
      used: 0,
      listened: 0,
      answers: 0,
      items: []
    });
    for (const r of sorted) {
      let s: Session;
      if (r.session_id) {
        s = tagged.get(r.session_id) ?? make(r.session_id, r.session_title || 'Session', r);
        tagged.set(r.session_id, s);
        if (!s.title || s.title === 'Session') s.title = r.session_title || s.title;
      } else {
        const last = loose.at(-1);
        if (last && ms(r.started_at) - last.end < GAP) s = last;
        else loose.push((s = make(`t${r.started_at}`, '', r)));
      }
      s.items.push(r);
      s.start = Math.min(s.start, ms(r.started_at));
      s.end = Math.max(s.end, ms(r.ended_at ?? r.started_at));
      s.used += r.seconds;
      if (r.kind === 'live') s.listened += r.seconds;
      else if (r.action !== 'summary') s.answers += 1;
    }
    for (const s of loose) s.title = s.listened > 0 ? 'Session' : s.answers === 1 ? 'Quick answer' : 'Quick answers';
    return [...tagged.values(), ...loose].sort((a, b) => b.start - a.start);
  }

  const sessions = $derived(build(rows));
  let shown = $state(8);

  const day = (t: number) =>
    toDate(t)?.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) ?? '';
  const clock = (t: number) => toDate(t)?.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) ?? '';
  const span = (a: number, b: number) => formatDuration(Math.max(0, (b - a) / 1000));

  function label(r: UsageRow) {
    if (r.kind === 'live') return 'Listening';
    return ACTIONS[r.action ?? ''] ?? 'Answer';
  }
</script>

{#if sessions.length === 0}
  <p class="empty muted">
    No sessions yet. Press <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>L</kbd> in the app to start a session.
  </p>
{:else}
  <ul class="sessions">
    {#each sessions.slice(0, shown) as s (s.key)}
      <li>
        <details>
          <summary>
            <span class="title">{s.title}</span>
            <span class="when muted">{day(s.start)} · {clock(s.start)}</span>
            <span class="stats">
              {#if s.end - s.start >= 60_000}
                <span title="From the first to the last activity">{span(s.start, s.end)}</span>
                <span class="sep" aria-hidden="true">·</span>
              {/if}
              <span>{s.answers} answer{s.answers === 1 ? '' : 's'}</span>
              <span class="sep" aria-hidden="true">·</span>
              <span class="used" title="Time deducted from your balance">{s.used > 0 ? `${formatDuration(s.used)} used` : 'Free'}</span>
            </span>
          </summary>
          <ol class="timeline">
            {#each s.items as r, i (i)}
              <li class:live={r.kind === 'live'}>
                <span class="t muted">{clock(ms(r.started_at))}</span>
                <span class="what">
                  {label(r)}
                  {#if r.kind === 'live'}
                    <span class="muted">· {span(ms(r.started_at), ms(r.ended_at ?? r.started_at))}</span>
                  {/if}
                </span>
                <span class="cost muted">{r.seconds > 0 ? formatDuration(r.seconds) : 'Included'}</span>
              </li>
            {/each}
          </ol>
          <p class="note muted">
            What was said and answered is saved on your PC in <b>Documents\Glint Sessions</b>, not on our servers.
          </p>
        </details>
      </li>
    {/each}
  </ul>
  {#if sessions.length > shown}
    <button class="btn btn-sm more" onclick={() => (shown += 10)}>Show more sessions</button>
  {/if}
{/if}

<style>
  .sessions {
    list-style: none;
    margin: 0;
    padding: 0 8px;
    display: grid;
    gap: 6px;
  }
  details {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    overflow: hidden;
  }
  details[open] {
    border-color: var(--border-strong);
  }
  summary {
    list-style: none;
    cursor: pointer;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2px 16px;
    padding: 12px 40px 12px 14px;
    position: relative;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary::after {
    content: '';
    position: absolute;
    right: 16px;
    top: 50%;
    width: 7px;
    height: 7px;
    margin-top: -5px;
    border-right: 2px solid var(--muted);
    border-bottom: 2px solid var(--muted);
    transform: rotate(45deg);
    transition: transform 0.15s;
  }
  details[open] summary::after {
    transform: rotate(-135deg);
    margin-top: -1px;
  }
  summary:hover {
    background: var(--surface-2);
  }
  summary:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .title {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .when {
    grid-column: 1;
    font-size: 13px;
  }
  .stats {
    grid-column: 2;
    grid-row: 1 / span 2;
    align-self: center;
    display: flex;
    gap: 6px;
    font-size: 13.5px;
    white-space: nowrap;
  }
  .sep {
    color: var(--faint);
  }
  .used {
    color: var(--accent);
    font-weight: 600;
  }
  @media (max-width: 560px) {
    summary {
      grid-template-columns: 1fr;
    }
    .stats {
      grid-column: 1;
      grid-row: auto;
      flex-wrap: wrap;
      font-size: 13px;
    }
  }
  .timeline {
    list-style: none;
    margin: 0;
    padding: 4px 14px 6px;
    border-top: 1px solid var(--border);
  }
  .timeline li {
    display: grid;
    grid-template-columns: 76px minmax(0, 1fr) auto;
    gap: 10px;
    padding: 8px 0 8px 14px;
    font-size: 14px;
    position: relative;
    border-bottom: 1px dashed var(--border);
  }
  .timeline li:last-child {
    border-bottom: none;
  }
  .timeline li::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    width: 7px;
    height: 7px;
    margin-top: -3.5px;
    border-radius: 50%;
    background: var(--faint);
  }
  .timeline li.live::before {
    background: var(--live);
  }
  .t {
    font-variant-numeric: tabular-nums;
    font-size: 13px;
  }
  .cost {
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  .note {
    padding: 0 14px 12px;
    font-size: 12.5px;
  }
  .note b {
    color: var(--text);
    font-weight: 600;
  }
  .empty {
    padding: 4px 12px 14px;
  }
  .empty kbd {
    height: 22px;
    min-width: 22px;
    font-size: 11.5px;
  }
  .more {
    margin: 10px 8px 4px;
  }
</style>
