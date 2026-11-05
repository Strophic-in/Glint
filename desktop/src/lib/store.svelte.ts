import { tick } from 'svelte';
import { errorMessage, ipc, on, type ApiError, type Me, type User } from './ipc';
import { isQuestion } from './question';
import { MODES, settings } from './settings.svelte';

export type Action = 'answer' | 'screen' | 'ask' | 'shorter' | 'expand' | 'followups' | 'recap';
export type ListenState = 'off' | 'connecting' | 'live' | 'reconnecting' | 'error';

export interface Turn {
  id: string;
  who: 'you' | 'them';
  text: string;
  final: boolean;
  at: number;
}

export interface Answer {
  id: number;
  action: Action;
  label: string;
  text: string;
  status: 'thinking' | 'streaming' | 'done' | 'error';
  auto: boolean;
  question: string;
  startedAt: number;
  firstMs: number;
  error?: string;
}

export interface Notice {
  kind: 'info' | 'warn' | 'error' | 'balance';
  message: string;
  action?: 'buy' | 'retry' | 'signin' | 'reveal';
  /** File to show in Explorer for action 'reveal'. */
  path?: string;
}

const LABELS: Record<Action, string> = {
  answer: 'Answer',
  screen: 'Screen',
  ask: 'You asked',
  shorter: 'Shorter',
  expand: 'More detail',
  followups: 'Follow-up questions',
  recap: 'Recap',
};

const MAX_TURNS = 300;

/** Only send the session fields the current mode uses. */
function sessionForMode() {
  const mode = MODES.find((m) => m.id === settings.mode);
  const out: Record<string, string> = {};
  for (const f of mode?.fields ?? []) {
    const v = settings.session[f.key]?.trim();
    if (v) out[f.key] = v;
  }
  return out;
}

/** Short label for the bar's session chip, e.g. "Interview · Google". */
export function sessionLabel() {
  const mode = MODES.find((m) => m.id === settings.mode);
  if (!mode) return 'Session';
  const first = mode.fields[0] ? settings.session[mode.fields[0].key]?.trim() : '';
  return first ? `${mode.label} · ${first}` : mode.label;
}

class Glint {
  phase = $state<'boot' | 'offline' | 'signedOut' | 'ready'>('boot');
  bootError = $state('');
  signin = $state<{ code: string; url: string } | null>(null);
  signinError = $state('');
  user = $state<User | null>(null);
  balance = $state(0);
  /** When alance was last reported by the server (for the local per-second countdown). */
  balanceAt = $state(Date.now());
  expiresAt = $state<number | null>(null);
  webUrl = $state('');
  version = $state('');

  listen = $state<ListenState>('off');
  listenSince = $state(0);
  levels = $state({ you: 0, them: 0 });
  turns = $state<Turn[]>([]);
  answer = $state<Answer | null>(null);
  notice = $state<Notice | null>(null);
  hint = $state(false);

  shortcutErrors = $state<Record<string, string>>({});
  view = $state<'main' | 'settings' | 'session'>('main');
  /** Collapsed to the floating logo bubble. */
  collapsed = $state(false);
  /** An answer arrived while collapsed. */
  unread = $state(false);
  menuOpen = $state(false);
  typing = $state(false);
  visible = $state(true);
  showTranscript = $state(false);

  private seq = 0;
  private lastAnswer: { question: string; text: string } | null = null;
  /** Session recording hooks in here (see recorder.svelte.ts). */
  onAnswerDone: ((a: Answer) => void) | null = null;
  private autoTimer: ReturnType<typeof setTimeout> | undefined;
  private autoAnsweredId = '';
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  scrollBy: (dy: number) => void = () => {};
  focusAsk: () => void = () => {};

  async init() {
    await Promise.all([
      on<{ id: number; kind: string; data: any }>('answer', (e) => this.onAnswer(e)),
      on<{ state: ListenState | 'off'; message?: string }>('listen:state', (e) => this.onListenState(e)),
      on<any>('listen:msg', (m) => this.onListenMsg(m)),
      on<{ src: 'you' | 'them'; level: number }>('listen:level', ({ src, level }) => {
        this.levels[src] = Math.max(level, this.levels[src] * 0.6);
      }),
      on<string>('shortcut', (a) => this.onShortcut(a)),
      on<boolean>('visibility', (v) => (this.visible = v)),
      on<{ kind: 'ok' | 'error'; me?: Me; message?: string }>('auth', (e) => this.onAuth(e)),
    ]);
    const cfg = await ipc.config();
    this.webUrl = cfg.web_url;
    this.version = cfg.version;
    await this.restore();
  }

  async restore() {
    this.phase = 'boot';
    try {
      const me = await ipc.authStatus();
      if (me) this.setMe(me);
      else this.phase = 'signedOut';
    } catch (e) {
      this.bootError = errorMessage(e);
      this.phase = 'offline';
    }
  }

  private setMe(me: Me) {
    this.user = me.user;
    this.setBalance(me.balance_seconds);
    this.expiresAt = me.expires_at;
    this.phase = 'ready';
  }

  setBalance(seconds: number) {
    this.balance = seconds;
    this.balanceAt = Date.now();
  }

  /** Balance right now: while live, count down locally between the server's 10 s updates. */
  balanceNow(now: number) {
    const live = this.listen === 'live' || this.listen === 'reconnecting';
    return live ? Math.max(0, this.balance - Math.floor((now - this.balanceAt) / 1000)) : this.balance;
  }

  async refreshMe() {
    try {
      this.setMe(await ipc.me());
    } catch (e) {
      if ((e as ApiError).status === 401) this.phase = 'signedOut';
    }
  }

  // ── Auth ────────────────────────────────────────────────
  async beginSignin() {
    this.signinError = '';
    try {
      const r = await ipc.authBegin();
      this.signin = { code: r.user_code, url: r.verify_url };
    } catch (e) {
      this.signinError = errorMessage(e);
    }
  }

  cancelSignin() {
    ipc.authCancel();
    this.signin = null;
  }

  private onAuth(e: { kind: 'ok' | 'error'; me?: Me; message?: string }) {
    this.signin = null;
    if (e.kind === 'ok' && e.me) this.setMe(e.me);
    else if (e.kind === 'ok') this.restore();
    else this.signinError = e.message ?? 'Sign-in failed.';
  }

  async signOut() {
    await ipc.logout();
    this.user = null;
    this.turns = [];
    this.answer = null;
    this.view = 'main';
    this.phase = 'signedOut';
  }

  buy() {
    ipc.openUrl(`${this.webUrl}/dashboard#buy`);
  }

  // ── Notices ─────────────────────────────────────────────
  notify(n: Notice, ms = 6000) {
    this.notice = n;
    clearTimeout(this.noticeTimer);
    if (ms) this.noticeTimer = setTimeout(() => (this.notice = null), ms);
  }

  // ── Listening ───────────────────────────────────────────
  async toggleListen() {
    if (this.phase !== 'ready') return;
    if (this.listen === 'off' || this.listen === 'error') {
      if (this.balance <= 0) return this.outOfTime();
      this.listen = 'connecting';
      try {
        await ipc.listenStart(
          settings.mic,
          settings.system,
          settings.micDevice || null,
          settings.speakerDevice || null,
          settings.speechLanguage || 'en',
        );
      } catch (e) {
        this.listen = 'error';
        this.notify({ kind: 'error', message: errorMessage(e) }, 8000);
      }
    } else {
      await ipc.listenStop();
    }
  }

  private onListenState(e: { state: ListenState | 'off'; message?: string }) {
    this.listen = e.state;
    if (e.state === 'live' && !this.listenSince) this.listenSince = Date.now();
    if (e.state === 'off' || e.state === 'error') {
      this.listenSince = 0;
      this.levels = { you: 0, them: 0 };
    }
    if (e.message) {
      const out = /out of time/i.test(e.message);
      this.notify({ kind: out ? 'balance' : 'warn', message: e.message, action: out ? 'buy' : undefined }, out ? 0 : 9000);
    }
  }

  private onListenMsg(m: any) {
    switch (m?.type) {
      case 'ready':
      case 'balance':
        if (typeof m.balance_seconds === 'number') this.setBalance(m.balance_seconds);
        break;
      case 'delta':
        this.upsertTurn(m.id, m.src, m.text, false);
        if (m.src === 'them') clearTimeout(this.autoTimer); // still talking
        break;
      case 'final':
        this.upsertTurn(m.id, m.src, m.text, true);
        if (m.src === 'them') this.considerAutoAnswer(m.id);
        break;
      case 'notice':
        this.notify({ kind: 'warn', message: m.message }, 6000);
        break;
    }
  }

  private upsertTurn(id: string, who: 'you' | 'them', text: string, final: boolean) {
    const t = this.turns.findLast((x) => x.id === id);
    if (t) {
      t.text = final ? text : t.text + text;
      t.final = final;
      t.at = Date.now();
    } else {
      this.turns.push({ id, who, text, final, at: Date.now() });
      if (this.turns.length > MAX_TURNS) this.turns.splice(0, this.turns.length - MAX_TURNS);
    }
    if (final && !text.trim()) this.turns = this.turns.filter((x) => x.id !== id);
  }

  private considerAutoAnswer(id: string) {
    const recent = this.turns.filter((t) => t.who === 'them' && t.final).slice(-2);
    const last = recent.at(-1);
    if (!last || last.id !== id) return;
    // A question can span two quick segments: include the previous one if it ended < 3 s ago.
    const prev = recent.length === 2 && last.at - recent[0].at < 3000 ? recent[0].text + ' ' : '';
    if (!isQuestion(prev + last.text)) return;
    if (!settings.autoAnswer) {
      this.hint = true;
      return;
    }
    const busy = this.answer && !this.answer.auto && (this.answer.status === 'thinking' || this.answer.status === 'streaming');
    if (busy || this.autoAnsweredId === id) return;
    clearTimeout(this.autoTimer);
    this.autoTimer = setTimeout(() => {
      this.autoAnsweredId = id;
      this.ask('answer', { auto: true });
    }, 350);
  }

  clearTranscript() {
    this.turns = [];
    this.hint = false;
  }

  // ── Answers ─────────────────────────────────────────────
  private transcript() {
    return this.turns
      .filter((t) => t.text.trim())
      .slice(-80)
      .map(({ who, text }) => ({ who, text }));
  }

  async ask(action: Action, opts: { question?: string; auto?: boolean } = {}) {
    if (this.phase !== 'ready') return;
    if (this.balance <= 0) return this.outOfTime();
    const transcript = this.transcript();
    const followup = action === 'shorter' || action === 'expand' || action === 'followups';
    if (followup && !this.lastAnswer) return;
    // Smart default: with nothing heard yet, the screen is the only context, so always include it.
    // Auto-answers include it too when enabled, so they see whatever is being shared in the call.
    const withScreen =
      action === 'screen' ||
      ((action === 'answer' || action === 'ask') &&
        (opts.auto ? settings.screen && settings.screenAuto : settings.screen || transcript.length === 0));
    const id = ++this.seq;
    const question = opts.question?.trim() ?? '';
    this.answer = {
      id,
      action,
      label: LABELS[action],
      text: '',
      status: 'thinking',
      auto: !!opts.auto,
      question,
      startedAt: performance.now(),
      firstMs: 0,
    };
    this.hint = false;
    this.view = 'main';
    const history =
      followup && this.lastAnswer
        ? [
            { role: 'user', content: this.lastAnswer.question || 'Answer the latest question.' },
            { role: 'assistant', content: this.lastAnswer.text },
          ]
        : [];
    try {
      await ipc.ask(
        id,
        {
          action,
          model: settings.model || undefined,
          question,
          transcript,
          history,
          auto: !!opts.auto,
          profile: {
            mode: settings.mode,
            context: settings.context,
            language: settings.language,
            session: sessionForMode(),
            // Resume first: it matters most and keeps the cached prompt prefix stable.
            docs: [...settings.docs]
              .sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'resume' ? -1 : 1))
              .map(({ name, text }) => ({ name, text })),
          },
        },
        withScreen,
      );
    } catch (e) {
      this.failAnswer(id, e as ApiError);
    }
  }

  private failAnswer(id: number, e: ApiError) {
    if (this.answer?.id !== id) return;
    this.answer.status = 'error';
    this.answer.error = e?.message ?? 'Something went wrong.';
    if (e?.error === 'no_balance') this.outOfTime();
    if (e?.status === 401) this.phase = 'signedOut';
  }

  private onAnswer({ id, kind, data }: { id: number; kind: string; data: any }) {
    const a = this.answer;
    if (!a || a.id !== id) return;
    switch (kind) {
      case 'delta':
        if (!a.firstMs) a.firstMs = Math.round(performance.now() - a.startedAt);
        a.status = 'streaming';
        a.text += data?.t ?? '';
        break;
      case 'done':
        a.status = 'done';
        if (this.collapsed) this.unread = true;
        if (typeof data?.balance_seconds === 'number') this.setBalance(data.balance_seconds);
        this.lastAnswer = { question: a.question || a.label, text: a.text };
        this.onAnswerDone?.(a);
        break;
      case 'error':
        this.failAnswer(id, data);
        break;
      case 'notice':
        this.notify({ kind: 'warn', message: data?.message ?? '' }, 5000);
        break;
    }
  }

  dismissAnswer() {
    ipc.askCancel();
    this.answer = null;
  }

  outOfTime() {
    this.notify({ kind: 'balance', message: 'You are out of time. Add hours to keep going.', action: 'buy' }, 0);
  }

  // ── Typing ──────────────────────────────────────────────
  /** Take keyboard focus. `forAsk` also opens the main view and focuses the question box. */
  async startTyping(forAsk = true) {
    if (this.phase !== 'ready') return;
    if (forAsk) this.view = 'main';
    this.typing = true;
    await ipc.setTyping(true);
    if (forAsk) {
      await tick();
      this.focusAsk();
    }
  }

  async stopTyping(restore = true) {
    if (!this.typing) return;
    this.typing = false;
    await ipc.setTyping(false, restore);
  }

  submitQuestion(q: string) {
    if (!q.trim()) return;
    this.stopTyping();
    this.ask('ask', { question: q });
  }

  // ── Collapse to bubble ──────────────────────────────────
  collapse() {
    this.menuOpen = false;
    if (this.typing) this.stopTyping();
    this.collapsed = true;
  }

  expand() {
    this.collapsed = false;
    this.unread = false;
  }

  toggleCollapsed() {
    if (this.collapsed) this.expand();
    else this.collapse();
  }

  // ── Shortcuts ───────────────────────────────────────────
  private onShortcut(action: string) {
    if (action === 'toggle') return this.toggleCollapsed();
    if (action === 'expand') return this.expand();
    if (action === 'settings') {
      this.expand();
      this.view = 'settings';
      return;
    }
    if (this.phase !== 'ready') return;
    if (action !== 'listen' && !action.startsWith('scroll')) this.expand();
    switch (action) {
      case 'answer':
        return this.ask('answer');
      case 'screen':
        return this.ask('screen');
      case 'listen':
        return this.toggleListen();
      case 'type':
        return this.startTyping();
      case 'scroll_up':
        return this.scrollBy(-140);
      case 'scroll_down':
        return this.scrollBy(140);
    }
  }
}

export const glint = new Glint();
