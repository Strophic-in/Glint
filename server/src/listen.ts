import type { FastifyInstance, FastifyRequest } from 'fastify';
import WebSocket from 'ws';
import { assertOpen, authenticate } from './auth.js';
import { aiConfigured, config } from './config.js';
import { deduct, effectiveBalance, logUsage, type UserRow } from './db.js';
import { claimLive, releaseLive, type CloseReason, type LiveHandle } from './live-registry.js';
import { MockTranscriber } from './mock.js';
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

/** One OpenAI realtime transcription socket for one audio source. Reconnects lazily. */
class OpenAITranscriber {
  private ws: WebSocket | null = null;
  private open = false;
  private queue: string[] = [];
  private pending = 0;
  private closed = false;

  constructor(
    private model: string,
    private emit: Emit,
    private onNotice: (msg: string) => void,
    private log: FastifyRequest['log'],
    /** Called on errors retrying can't fix. Return true if the caller handled it (e.g. fell back). */
    private onFatal: (code: string) => boolean = () => false,
  ) {
    this.connect();
  }

  private connect() {
    const url = `${config.openaiBase.replace(/^http/, 'ws')}/realtime?intent=transcription`;
    const ws = new WebSocket(url, { headers: { authorization: `Bearer ${config.openaiKey}` } });
    this.ws = ws;
    this.open = false;
    ws.on('open', () => {
      const transcription: Record<string, unknown> = { model: this.model };
      if (config.sttDelay && /live/.test(this.model)) transcription.delay = config.sttDelay;
      if (config.sttLanguages.length) transcription.languages = config.sttLanguages;
      ws.send(
        JSON.stringify({
          type: 'session.update',
          session: {
            type: 'transcription',
            audio: { input: { format: { type: 'audio/pcm', rate: 24000 }, transcription, turn_detection: null } },
          },
        }),
      );
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
async function transcribeFile(pcm: Buffer): Promise<string> {
  const form = new FormData();
  form.append('model', config.sttRestModel);
  form.append('file', new Blob([new Uint8Array(wav(pcm))], { type: 'audio/wav' }), 'speech.wav');
  if (config.sttLanguages.length === 1) form.append('language', config.sttLanguages[0]!);
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

  constructor(
    private src: Src,
    private model: string,
    private emit: Emit,
    private notice: (msg: string) => void,
    private log: FastifyRequest['log'],
  ) {
    if ((realtimeBlockedUntil.get(model) ?? 0) < Date.now()) {
      this.rt = new OpenAITranscriber(model, emit, notice, log, (code) => this.fallBack(code));
    }
  }

  append(pcm: Buffer) {
    this.current.push(pcm);
    this.currentBytes += pcm.length;
    this.rt?.append(pcm);
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
    try {
      const text = (await transcribeFile(audio)).trim();
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
        (req as any).balance = await effectiveBalance(user.id);
      },
    },
    (socket, req) => {
      const user = (req as any).user as UserRow;
      const startedAt = Date.now();
      let lastCharge = startedAt;
      let lastSpeech = startedAt;
      let charged = 0;
      let ticks = 0;
      let done = false;

      const sendJson = (obj: unknown) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(obj));
      };

      const balance = (req as any).balance as number;
      if (balance <= 0) {
        sendJson({ type: 'error', error: 'no_balance', message: 'You are out of time. Add hours to keep going.' });
        socket.close(4002, 'no_balance');
        return;
      }

      const make = (src: Src): Transcriber => {
        const emit: Emit = (m) => sendJson({ ...m, src });
        if (config.mockAI) return new MockTranscriber(src, emit);
        return new SmartTranscriber(
          src,
          src === 'them' ? config.sttThem : config.sttYou,
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

      const finish = (error?: string, message?: string) => {
        if (done) return;
        done = true;
        clearInterval(timer);
        clearInterval(pinger);
        const endedAt = Date.now();
        charge(true)
          .then(() =>
            charged > 0 ? logUsage({ userId: user.id, kind: 'live', seconds: charged, startedAt, endedAt }) : undefined,
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

      sendJson({ type: 'ready', balance_seconds: balance, mock: config.mockAI });
    },
  );
}
