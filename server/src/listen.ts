import type { FastifyInstance, FastifyRequest } from 'fastify';
import WebSocket from 'ws';
import { assertOpen, authenticate } from './auth.js';
import { aiConfigured, config } from './config.js';
import { checkTrialDevice, deduct, deviceHash, effectiveBalance, logUsage, sessionRef, type SessionRef, type UserRow } from './db.js';
import { claimLive, releaseLive, type CloseReason, type LiveHandle } from './live-registry.js';
import { MockTranscriber } from './mock.js';
import { sttCostMicros } from './pricing.js';
import { HttpError } from './util.js';

const CLOSE_MESSAGES: Record<CloseReason, string> = {
  replaced: 'Glint was started on another device.',
  shutdown: 'Server restarting, reconnect in a moment.',
  admin: 'Your live session was ended by an administrator.',
  blocked: 'This account has been suspended. Contact support.',
};

type Src = 'you' | 'them';
type Emit = (msg: { type: 'delta' | 'final'; id: string; text: string }) => void;

const TICK_MS = 5000;

// Errors that retrying can't fix: stop reconnecting and tell the user once.
const FATAL_CODES = new Set(['model_not_found', 'invalid_api_key', 'insufficient_quota', 'unsupported_model']);

function fatalMessage(code: string, model: string, raw: string) {
  if (code === 'model_not_found' || code === 'unsupported_model') {
    return `Live captions are off: this OpenAI project can't use ${model}. Enable it at platform.openai.com → Settings → Project → Limits.`;
  }
  if (code === 'insufficient_quota') return 'Live captions are off: the OpenAI account is out of credits.';
  if (code === 'invalid_api_key') return 'Live captions are off: the OpenAI API key was rejected.';
  return raw;
}
const MIN_COMMIT_BYTES = 24_000 * 2 * 0.1; // 100 ms of PCM16 @ 24 kHz
const MAX_FRAME_BYTES = 24_000 * 2 * 2; // 2 s
const PCM_BYTES_PER_SEC = 24_000 * 2; // PCM16 mono @ 24 kHz

// ── Caption language ─────────────────────────────────────
// Auto-detect hallucinates other languages on short or noisy audio (English heard as Hindi or
// Chinese), so the app says which language(s) to expect: /v1/listen?lang=en, en,hi or auto.
/** ISO-639-1 codes, or null for auto-detect. */
export type Langs = string[] | null;

/** `lang` query value → languages. Absent or invalid → STT_LANGUAGES if set, else English. */
export function parseLangs(raw: unknown): Langs {
  const fallback = config.sttLanguages.length ? config.sttLanguages.slice(0, 3) : ['en'];
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  const v = raw.trim().toLowerCase();
  if (v === 'auto') return null;
  const codes = [...new Set(v.split(',').map((c) => c.trim()))];
  if (!codes.length || codes.length > 3 || !codes.every((c) => /^[a-z]{2}$/.test(c))) return fallback;
  return codes;
}

const LANG_NAMES: Record<string, string> = {
  en: 'English', hi: 'Hindi', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', it: 'Italian',
  nl: 'Dutch', ar: 'Arabic', ja: 'Japanese', zh: 'Chinese', ko: 'Korean', ru: 'Russian', tr: 'Turkish',
  id: 'Indonesian', ta: 'Tamil', te: 'Telugu', mr: 'Marathi', bn: 'Bengali', gu: 'Gujarati', kn: 'Kannada',
  ml: 'Malayalam', pa: 'Punjabi', ur: 'Urdu',
};

/** Short prompt that nudges the transcriber toward the expected language(s). */
export function langPrompt(langs: Langs): string | undefined {
  if (!langs?.length) return undefined;
  const names = langs.map((c) => LANG_NAMES[c] ?? c);
  if (names.length === 1) return `${names[0]} conversation on a call. Transcribe in ${names[0]} only.`;
  const list = `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`;
  return `Conversation on a call in ${list}. Transcribe in the language spoken (${list}) only.`;
}

// Languages written in Latin script: when only these are expected, captions mostly in another
// script are hallucinations.
const LATIN_LANGS = new Set(['en', 'es', 'fr', 'de', 'pt', 'it', 'nl', 'id', 'ms', 'tr', 'pl', 'cs', 'ro', 'hu', 'sv', 'da', 'no', 'fi', 'vi', 'sw', 'tl']);
export const latinOnly = (langs: Langs) => !!langs?.length && langs.every((c) => LATIN_LANGS.has(c));

/** True when over 40% of the letters are not Latin script (CJK, Devanagari, Arabic, Cyrillic…). */
export function mostlyNonLatin(text: string): boolean {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  if (!letters) return false;
  const latin = text.match(/\p{Script=Latin}/gu)?.length ?? 0;
  return (letters - latin) / letters > 0.4;
}

/**
 * Drops captions in the wrong script (see latinOnly). Deltas stop once an item looks wrong, and a
 * dropped final goes out as empty text, which removes the caption in the app.
 */
function scriptGuard(langs: Langs, emit: Emit): Emit {
  if (!latinOnly(langs)) return emit;
  const seen = new Map<string, string>(); // item id → text so far
  return (m) => {
    if (m.type === 'delta') {
      const acc = (seen.get(m.id) ?? '') + m.text;
      seen.set(m.id, acc);
      if (seen.size > 200) seen.delete(seen.keys().next().value!);
      if (!mostlyNonLatin(acc)) emit(m);
      return;
    }
    seen.delete(m.id);
    emit(mostlyNonLatin(m.text) ? { ...m, text: '' } : m);
  };
}

/** One OpenAI realtime transcription socket for one audio source. Reconnects lazily. */
class OpenAITranscriber {
  private ws: WebSocket | null = null;
  private open = false;
  private queue: string[] = [];
  private pending = 0;
  private closed = false;

  constructor(
    private model: string,
    private langs: Langs,
    private emit: Emit,
    private onNotice: (msg: string) => void,
    private log: FastifyRequest['log'],
    /** Called on errors retrying can't fix. Return true if the caller handled it (e.g. fell back). */
    private onFatal: (code: string) => boolean = () => false,
  ) {
    this.connect();
  }

  private sessionUpdate() {
    const transcription: Record<string, unknown> = { model: this.model };
    if (config.sttDelay && /live/.test(this.model)) transcription.delay = config.sttDelay;
    if (this.langs?.length) transcription.languages = this.langs;
    const prompt = langPrompt(this.langs);
    if (prompt && !promptRejected.has(this.model)) transcription.prompt = prompt;
    return JSON.stringify({
      type: 'session.update',
      session: {
        type: 'transcription',
        audio: { input: { format: { type: 'audio/pcm', rate: 24000 }, transcription, turn_detection: null } },
      },
    });
  }

  private connect() {
    const url = `${config.openaiBase.replace(/^http/, 'ws')}/realtime?intent=transcription`;
    const ws = new WebSocket(url, { headers: { authorization: `Bearer ${config.openaiKey}` } });
    this.ws = ws;
    this.open = false;
    ws.on('open', () => {
      ws.send(this.sessionUpdate());
      this.open = true;
      for (const m of this.queue.splice(0)) ws.send(m);
    });
    ws.on('message', (raw) => {
      let evt: any;
      try {
        evt = JSON.parse(raw.toString());
      } catch {
        return;
      }
      switch (evt.type) {
        case 'conversation.item.input_audio_transcription.delta':
          if (evt.delta) this.emit({ type: 'delta', id: evt.item_id, text: evt.delta });
          break;
        case 'conversation.item.input_audio_transcription.completed':
          this.emit({ type: 'final', id: evt.item_id, text: evt.transcript ?? '' });
          break;
        case 'conversation.item.input_audio_transcription.failed':
        case 'error': {
          const code = evt.error?.code ?? '';
          if (code === 'input_audio_buffer_commit_empty') break;
          // The language prompt is optional: if this model refuses it, resend the session without it.
          const about = `${evt.error?.param ?? ''} ${evt.error?.message ?? ''}`;
          if (evt.type === 'error' && /prompt/i.test(about) && !promptRejected.has(this.model)) {
            promptRejected.add(this.model);
            this.log.warn({ model: this.model, error: evt.error }, 'stt refused the language prompt; continuing without it');
            ws.send(this.sessionUpdate());
            break;
          }
          this.log.warn({ model: this.model, error: evt.error }, 'stt upstream error');
          if (FATAL_CODES.has(code)) {
            this.close();
            if (!this.onFatal(code)) this.onNotice(fatalMessage(code, this.model, evt.error?.message ?? ''));
            break;
          }
          this.onNotice(evt.error?.message ?? 'Transcription error');
          break;
        }
      }
    });
    ws.on('close', (code) => {
      if (this.ws === ws) {
        this.ws = null;
        this.open = false;
      }
      if (!this.closed) this.log.info({ code, model: this.model }, 'stt upstream closed');
    });
    ws.on('error', (err) => this.log.warn({ err: err.message }, 'stt upstream socket error'));
  }

  private send(obj: unknown) {
    if (this.closed) return;
    if (!this.ws) this.connect();
    const m = JSON.stringify(obj);
    if (this.open && this.ws?.readyState === WebSocket.OPEN) this.ws.send(m);
    else if (this.queue.length < 200) this.queue.push(m);
  }

  append(pcm: Buffer) {
    this.pending += pcm.length;
    this.send({ type: 'input_audio_buffer.append', audio: pcm.toString('base64') });
  }

  commit() {
    if (this.pending < MIN_COMMIT_BYTES) return;
    this.pending = 0;
    this.send({ type: 'input_audio_buffer.commit' });
  }

  close() {
    this.closed = true;
    this.queue = [];
    this.ws?.close();
    this.ws = null;
  }
}

interface Transcriber {
  append(pcm: Buffer): void;
  commit(): void | Promise<void>;
  close(): void;
  /** Audio bytes sent to OpenAI per model (what we're billed for). Absent = free (mock). */
  billed?: Map<string, number>;
}

function wav(pcm: Buffer, rate = 24_000): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Transcribe one finished utterance with the regular (non-realtime) endpoint. */
async function transcribeFile(pcm: Buffer, langs: Langs): Promise<string> {
  const form = new FormData();
  form.append('model', config.sttRestModel);
  form.append('file', new Blob([new Uint8Array(wav(pcm))], { type: 'audio/wav' }), 'speech.wav');
  if (langs?.length === 1) form.append('language', langs[0]!);
  const prompt = langPrompt(langs);
  if (prompt) form.append('prompt', prompt);
  const res = await fetch(`${config.openaiBase}/audio/transcriptions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.openaiKey}` },
    body: form,
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as { text?: string; error?: { code?: string; message?: string } };
  if (!res.ok) throw Object.assign(new Error(body.error?.message ?? `HTTP ${res.status}`), { code: body.error?.code ?? '' });
  return body.text ?? '';
}

// Realtime models this project can't use right now → skip straight to per-utterance mode for a while.
const realtimeBlockedUntil = new Map<string, number>();
// Realtime models that refused the language prompt (sessions go without it from then on).
const promptRejected = new Set<string>();

/**
 * Streams to OpenAI realtime (word-by-word captions). If the project has no realtime access to the
 * model (common right after enabling it, while OpenAI propagates the change), it falls back to
 * transcribing each finished utterance via /audio/transcriptions. Captions arrive per sentence
 * instead of per word, but nothing breaks. Realtime is retried after 10 minutes.
 */
class SmartTranscriber implements Transcriber {
  private rt: OpenAITranscriber | null = null;
  private current: Buffer[] = [];
  private currentBytes = 0;
  private recent: Buffer[] = []; // last few committed utterances, to re-run if realtime fails on them
  private seq = 0;
  private closed = false;
  private restFailed = false;
  readonly billed = new Map<string, number>();

  constructor(
    private src: Src,
    private model: string,
    private langs: Langs,
    private emit: Emit,
    private notice: (msg: string) => void,
    private log: FastifyRequest['log'],
  ) {
    if ((realtimeBlockedUntil.get(model) ?? 0) < Date.now()) {
      this.rt = new OpenAITranscriber(model, langs, emit, notice, log, (code) => this.fallBack(code));
    }
  }

  append(pcm: Buffer) {
    this.current.push(pcm);
    this.currentBytes += pcm.length;
    if (this.rt) {
      this.rt.append(pcm);
      this.bill(this.model, pcm.length);
    }
  }

  private bill(model: string, bytes: number) {
    this.billed.set(model, (this.billed.get(model) ?? 0) + bytes);
  }

  commit() {
    if (this.currentBytes < MIN_COMMIT_BYTES) return;
    const audio = Buffer.concat(this.current);
    this.current = [];
    this.currentBytes = 0;
    this.recent = [...this.recent.slice(-2), audio];
    if (this.rt) this.rt.commit();
    else void this.viaFile(audio);
  }

  private fallBack(code: string): boolean {
    if (code !== 'model_not_found' && code !== 'unsupported_model') return false;
    realtimeBlockedUntil.set(this.model, Date.now() + 10 * 60_000);
    this.log.warn({ model: this.model, src: this.src }, 'no realtime access: falling back to per-utterance transcription');
    this.rt = null;
    // Utterances already sent to realtime would be lost: transcribe them now.
    for (const audio of this.recent.splice(0)) void this.viaFile(audio);
    return true;
  }

  private async viaFile(audio: Buffer) {
    const id = `utt_${this.src}_${++this.seq}`;
    this.bill(config.sttRestModel, audio.length);
    try {
      const text = (await transcribeFile(audio, this.langs)).trim();
      if (text && !this.closed) this.emit({ type: 'final', id, text });
    } catch (e: any) {
      this.log.warn({ err: e?.message, model: config.sttRestModel }, 'file transcription failed');
      if (!this.restFailed && !this.closed) {
        this.restFailed = true;
        this.notice(fatalMessage(e?.code ?? '', config.sttRestModel, e?.message ?? 'Transcription failed.'));
      }
    }
  }

  close() {
    this.closed = true;
    this.rt?.close();
  }
}

export async function listenRoutes(app: FastifyInstance) {
  app.get(
    '/v1/listen',
    {
      websocket: true,
      // Everything async happens before the upgrade, so the socket handler can attach its
      // listeners synchronously and never miss the client's first frames.
      preValidation: async (req) => {
        const user = await authenticate(req);
        assertOpen(user);
        if (!aiConfigured()) throw new HttpError(503, 'not_configured', 'AI is not configured on the server.');
        (req as any).user = user;
        await checkTrialDevice(user.id, deviceHash(req.headers['x-glint-device']));
        (req as any).balance = await effectiveBalance(user.id);
        const q = (req.query as Record<string, unknown> | undefined) ?? {};
        (req as any).langs = parseLangs(q.lang);
        (req as any).session = sessionRef(q.session, q.title);
      },
    },
    (socket, req) => {
      const user = (req as any).user as UserRow;
      const session = (req as any).session as SessionRef | null;
      const startedAt = Date.now();
      let lastCharge = startedAt;
      let lastSpeech = startedAt;
      let charged = 0;
      let ticks = 0;
      let done = false;
      let audioBytes = 0; // speech received from the app (both sources)

      const sendJson = (obj: unknown) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(obj));
      };

      const balance = (req as any).balance as number;
      if (balance <= 0) {
        sendJson({ type: 'error', error: 'no_balance', message: 'You are out of time. Add hours to keep going.' });
        socket.close(4002, 'no_balance');
        return;
      }

      const langs = (req as any).langs as Langs;
      const make = (src: Src): Transcriber => {
        const emit = scriptGuard(langs, (m) => sendJson({ ...m, src }));
        if (config.mockAI) return new MockTranscriber(src, emit);
        return new SmartTranscriber(
          src,
          src === 'them' ? config.sttThem : config.sttYou,
          langs,
          emit,
          (message) => sendJson({ type: 'notice', src, message }),
          req.log,
        );
      };
      const stt: Record<Src, Transcriber> = { you: make('you'), them: make('them') };

      // Periodic ticks charge whole elapsed seconds; the final charge rounds the remainder up.
      const charge = (final = false): Promise<number> => {
        const elapsed = (Date.now() - lastCharge) / 1000;
        const secs = final ? Math.ceil(elapsed) : Math.floor(elapsed);
        if (secs <= 0) return effectiveBalance(user.id);
        lastCharge += secs * 1000;
        charged += secs;
        return deduct(user.id, secs);
      };

      // What the session cost us: audio minutes per transcription model.
      const sttUsage = () => {
        const perModel = new Map<string, number>();
        for (const t of [stt.you, stt.them]) {
          for (const [model, bytes] of t.billed ?? []) perModel.set(model, (perModel.get(model) ?? 0) + bytes);
        }
        let costMicros = 0;
        for (const [model, bytes] of perModel) costMicros += sttCostMicros(model, bytes / PCM_BYTES_PER_SEC);
        const models = [...perModel.keys()];
        return { costMicros, model: models.length ? models.join(' + ') : config.mockAI ? 'mock' : null };
      };

      const finish = (error?: string, message?: string) => {
        if (done) return;
        done = true;
        clearInterval(timer);
        clearInterval(pinger);
        const endedAt = Date.now();
        const cost = sttUsage();
        charge(true)
          .then(() =>
            charged > 0 || audioBytes > 0
              ? logUsage({
                  userId: user.id,
                  kind: 'live',
                  seconds: charged,
                  startedAt,
                  endedAt,
                  model: cost.model,
                  audioMs: Math.round((audioBytes / PCM_BYTES_PER_SEC) * 1000),
                  costMicros: cost.costMicros,
                  session,
                })
              : undefined,
          )
          .catch((e) => req.log.error({ err: e?.message, user: user.id, charged }, 'final live charge failed'));
        stt.you.close();
        stt.them.close();
        releaseLive(user.id, handle);
        if (error) sendJson({ type: 'error', error, message });
        if (socket.readyState === socket.OPEN) socket.close(error ? 4000 : 1000, error ?? 'bye');
      };

      const handle: LiveHandle = {
        close: (reason = 'shutdown') => finish(reason, CLOSE_MESSAGES[reason]),
      };
      claimLive(user.id, user.email, handle);

      const timer = setInterval(async () => {
        let left: number;
        try {
          left = await charge();
        } catch (e: any) {
          req.log.warn({ err: e?.message }, 'live charge failed; retrying next tick');
          return;
        }
        if (done) return;
        if (left <= 0) return finish('no_balance', 'You are out of time. Add hours to keep going.');
        if (Date.now() - lastSpeech > config.idleTimeoutS * 1000) {
          return finish('idle', `Paused after ${Math.round(config.idleTimeoutS / 60)} min of silence to save your time.`);
        }
        if (++ticks % 2 === 0) sendJson({ type: 'balance', balance_seconds: left });
      }, TICK_MS);
      const pinger = setInterval(() => socket.ping(), 25_000);

      socket.on('message', (data: Buffer, isBinary: boolean) => {
        if (done) return;
        if (isBinary) {
          if (data.length < 3 || data.length > MAX_FRAME_BYTES + 1) return;
          const src: Src | null = data[0] === 0 ? 'you' : data[0] === 1 ? 'them' : null;
          const pcm = data.subarray(1);
          if (!src || pcm.length % 2) return;
          lastSpeech = Date.now(); // the client only uploads speech (VAD gate)
          audioBytes += pcm.length;
          stt[src].append(Buffer.from(pcm));
          return;
        }
        let msg: any;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }
        if (msg?.type === 'commit' && (msg.src === 'you' || msg.src === 'them')) void stt[msg.src as Src].commit();
        else if (msg?.type === 'stop') finish();
        else if (msg?.type === 'ping') sendJson({ type: 'pong' });
      });
      socket.on('close', () => finish());
      socket.on('error', () => finish());

      sendJson({ type: 'ready', balance_seconds: balance, mock: config.mockAI, languages: langs ?? 'auto' });
    },
  );
}
