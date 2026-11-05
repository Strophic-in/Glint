// Session recording: from "Start session" until it ends, every caption and every answer is kept and
// written to Documents\Glint Sessions as a Markdown file (autosaved, so a crash loses seconds at most).
// Listening can be paused and resumed inside a session. Screenshots used for answers (a question on a
// shared screen, say) are saved in a folder next to the file and linked from it. Ending the session,
// or quitting Glint, adds an AI review: every question asked, ideal answers, how it went, follow-ups.
import { glint, sessionLabel, type Answer, type Turn } from './store.svelte';
import { settings } from './settings.svelte';
import { ipc, errorMessage } from './ipc';

const AUTOSAVE_MS = 10_000;

interface Entry {
  at: number;
  label: string;
  question: string;
  answer: string;
  auto: boolean;
  /** Screenshot the answer used, relative to the session file. */
  screen?: string;
}

interface Line {
  who: 'you' | 'them';
  text: string;
  at: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const stamp = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}`;
};
const minutes = (ms: number) => {
  const m = Math.max(1, Math.round(ms / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timed out')), ms))]);
}

class Recorder {
  active = $state(false);
  startedAt = $state(0);
  /** Writing the final file and the review. */
  finishing = $state(false);
  path = $state('');
  private endedAt = 0;
  private title = '';
  private file = '';
  private entries: Entry[] = [];
  private lines = new Map<string, Line>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private ending: Promise<string | null> | null = null;

  async start() {
    if (this.active || this.finishing) return;
    this.active = true;
    this.startedAt = Date.now();
    this.endedAt = 0;
    this.entries = [];
    this.lines = new Map();
    this.title = sessionLabel();
    this.file = `${stamp(this.startedAt)} ${this.title.replace(/ · /g, ' - ')}`;
    // Captions already on screen belong to this session too.
    for (const t of glint.turns) if (t.final) this.line(t);
    // Screenshots go into a folder named like the file (created only when the first one is saved).
    await ipc.setSessionAssets(this.file).catch(() => {});
    this.timer = setInterval(() => void this.save(), AUTOSAVE_MS);
    await this.save();
    if (glint.listen === 'off' || glint.listen === 'error') await glint.toggleListen();
  }

  /** Each finished caption line (kept even if the captions are cleared on screen). */
  line(t: Turn) {
    if (this.active && t.text.trim()) this.lines.set(t.id, { who: t.who, text: t.text.trim(), at: t.at });
  }

  /** Called when an answer finishes streaming. */
  record(a: Answer) {
    if (!this.active || !a.text.trim()) return;
    // A typed question is the question; "Solve screen" answers what's on screen; otherwise it's
    // what "Them" said last.
    const heard = [...glint.turns].reverse().find((t) => t.who === 'them' && t.final && t.text.trim());
    const question = a.question || (a.action === 'screen' ? 'Question on the screen' : heard?.text.trim() || '');
    this.entries.push({
      at: Date.now(),
      label: a.auto ? 'Auto-answer' : a.label,
      question,
      answer: a.text.trim(),
      auto: a.auto,
      screen: a.screenPath ? a.screenPath.split(/[\\/]/).slice(-2).join('/') : undefined,
    });
    void this.save();
  }

  /** End the session: save, stop listening, then add the AI review. `quick` = quitting, so the
   *  review only gets a few seconds. Resolves to the saved file's path. */
  end(quick = false): Promise<string | null> {
    return (this.ending ??= this.finish(quick).finally(() => (this.ending = null)));
  }

  private async finish(quick: boolean): Promise<string | null> {
    if (!this.active) return this.path || null;
    clearInterval(this.timer);
    this.snapshot();
    this.active = false;
    await ipc.setSessionAssets(null).catch(() => {});
    this.finishing = true;
    this.endedAt = Date.now();
    if (glint.listen !== 'off' && glint.listen !== 'error') await ipc.listenStop().catch(() => {});
    let path = await this.save('_Writing the review…_');
    if (!quick) glint.notify({ kind: 'info', message: 'Session saved. Writing your review…' }, 0);

    const transcript = this.transcript().map(({ who, text }) => ({ who, text }));
    if (transcript.length || this.entries.length) {
      try {
        const review = await withTimeout(
          ipc.sessionReview({
            action: 'summary',
            model: settings.model || undefined,
            transcript,
            // What Glint answered, including questions read off the screen, so the review covers them.
            question: this.entries
              .map((e, i) => `${i + 1}. [${e.label}] ${e.question || '(no question text)'}\n   Glint: ${e.answer.replace(/\s+/g, ' ').slice(0, 400)}`)
              .join('\n')
              .slice(-11_000),
            profile: {
              mode: settings.mode,
              context: settings.context,
              language: settings.language,
              session: settings.session,
              docs: settings.docs.map(({ name, text }) => ({ name, text })),
            },
          }),
          quick ? 6_000 : 120_000,
        );
        path = (await this.save(review.trim())) ?? path;
      } catch (e) {
        path = (await this.save(`_The review couldn't be written (${errorMessage(e)}). Everything else is below._`)) ?? path;
      }
    } else {
      path = (await this.save('_Nothing was heard in this session._')) ?? path;
    }
    this.finishing = false;
    if (!quick && path) {
      glint.notify({ kind: 'info', message: 'Session saved to Documents\\Glint Sessions.', action: 'reveal', path }, 20_000);
    }
    return path;
  }

  private snapshot() {
    for (const t of glint.turns) {
      if (t.final && t.text.trim()) this.lines.set(t.id, { who: t.who, text: t.text.trim(), at: t.at });
    }
  }

  private transcript(): Line[] {
    return [...this.lines.values()].sort((x, y) => x.at - y.at);
  }

  private async save(review?: string): Promise<string | null> {
    this.snapshot();
    try {
      this.path = await ipc.saveSession(this.file, this.markdown(review));
      return this.path;
    } catch (e) {
      glint.notify({ kind: 'error', message: `Couldn't save the session file: ${errorMessage(e)}` }, 8000);
      return null;
    }
  }

  private markdown(review?: string): string {
    const end = this.endedAt || Date.now();
    const date = new Date(this.startedAt).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const out: string[] = [
      `# ${this.title}`,
      '',
      `${date} · ${clock(this.startedAt)}–${clock(end)} (${minutes(end - this.startedAt)}) · ${this.active ? 'in progress' : 'Glint session'}`,
      '',
      '## Review',
      '',
      review ?? (this.active ? '_The review is written when the session ends._' : '_No review._'),
      '',
      `## Questions and answers (${this.entries.length})`,
      '',
    ];
    if (!this.entries.length) out.push('_No answers were requested in this session._', '');
    this.entries.forEach((e, i) => {
      out.push(`### ${i + 1}. ${e.question ? e.question.replace(/\s+/g, ' ').slice(0, 300) : e.label}`, '');
      out.push(`_${clock(e.at)} · ${e.label}_`, '');
      if (e.screen) out.push(`![Screen at ${clock(e.at)}](<${e.screen}>)`, '');
      out.push(e.answer, '');
    });
    const lines = this.transcript();
    out.push('## Transcript', '');
    if (!lines.length) out.push('_Nothing was transcribed._');
    for (const l of lines) out.push(`**[${clock(l.at)}] ${l.who === 'them' ? 'Them' : 'You'}:** ${l.text}`, '');
    return out.join('\n');
  }
}

export const recorder = new Recorder();
