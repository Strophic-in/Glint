import type { FastifyInstance } from 'fastify';
import { assertOpen, authenticate } from './auth.js';
import { aiConfigured, config } from './config.js';
import { deduct, effectiveBalance, logUsage, refund, sessionRef } from './db.js';
import { isLive } from './live-registry.js';
import { mockAnswer } from './mock.js';
import { answerCostMicros } from './pricing.js';
import { availableModels, refreshModels, resolveModel } from './models.js';
import {
  ACTIONS,
  MODES,
  systemPrompt,
  userPrompt,
  type Action,
  type Doc,
  type Mode,
  type SessionInfo,
  type Turn,
} from './prompts.js';
import { HttpError, rateLimiter, str } from './util.js';

const MAX_TRANSCRIPT_CHARS = 12_000;
let priorityRejected = false; // set once OpenAI refuses service_tier=priority for this account

function cleanTranscript(v: unknown, maxTurns = 200, maxChars = MAX_TRANSCRIPT_CHARS): Turn[] {
  if (!Array.isArray(v)) return [];
  const turns: Turn[] = [];
  for (const t of v.slice(-maxTurns)) {
    const text = str(t?.text, 2000).trim();
    if (text) turns.push({ who: t?.who === 'you' ? 'you' : 'them', text });
  }
  // Keep the most recent turns within the char budget.
  let total = 0;
  let i = turns.length;
  while (i > 0 && total + turns[i - 1]!.text.length <= maxChars) total += turns[--i]!.text.length;
  return turns.slice(i);
}

const MAX_DOC_CHARS = 24_000; // all documents together (~6k tokens; cached after the first answer)

function cleanSession(v: any): SessionInfo {
  return {
    company: str(v?.company, 120),
    position: str(v?.position, 120),
    title: str(v?.title, 160),
    agenda: str(v?.agenda, 1500),
    prospect: str(v?.prospect, 160),
  };
}

function cleanDocs(v: unknown): Doc[] {
  if (!Array.isArray(v)) return [];
  const out: Doc[] = [];
  let budget = MAX_DOC_CHARS;
  for (const d of v.slice(0, 8)) {
    const text = str(d?.text, budget).trim();
    if (!text) continue;
    out.push({ name: str(d?.name, 120) || 'document', text });
    budget -= text.length;
    if (budget <= 0) break;
  }
  return out;
}

function cleanHistory(v: unknown) {
  if (!Array.isArray(v)) return [];
  return v
    .slice(-6)
    .map((m) => ({ role: m?.role === 'assistant' ? 'assistant' : 'user', content: str(m?.content, 6000) }))
    .filter((m) => m.content) as { role: 'user' | 'assistant'; content: string }[];
}

interface StreamUsage {
  input?: number;
  cached?: number;
  output?: number;
  /** Lane OpenAI actually served the request on (priority costs more). */
  tier?: string;
}

/** Stream chat-completion text deltas from OpenAI. Yields text; fills in token usage. */
async function* openaiStream(
  body: Record<string, unknown>,
  signal: AbortSignal,
  usage: StreamUsage,
): AsyncGenerator<string> {
  const post = (b: Record<string, unknown>) =>
    fetch(`${config.openaiBase}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.openaiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(b),
      signal,
    });
  let res = await post(body);
  // Not every account may use the priority lane: fall back to the default lane once.
  if (res.status === 400 && body.service_tier) {
    const detail = await res.text().catch(() => '');
    if (/service_tier/i.test(detail)) {
      priorityRejected = true;
      const { service_tier: _, ...rest } = body;
      res = await post(rest);
    } else {
      res = new Response(detail, { status: 400 });
    }
  }
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    let err: { code?: string; message?: string } = {};
    try {
      err = JSON.parse(detail).error ?? {};
    } catch {
      /* not JSON */
    }
    const model = String(body.model);
    const message =
      err.code === 'model_not_found'
        ? `This OpenAI project can't use ${model}. Enable it at platform.openai.com → Settings → Project → Limits, or pick another model in Settings.`
        : err.code === 'insufficient_quota'
          ? 'The OpenAI account is out of credits.'
          : `AI provider error ${res.status}: ${(err.message ?? detail).slice(0, 200)}`;
    throw new HttpError(502, 'upstream', message);
  }
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buf += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      let evt: any;
      try {
        evt = JSON.parse(data);
      } catch {
        continue;
      }
      if (typeof evt.service_tier === 'string') usage.tier = evt.service_tier;
      if (evt.usage) {
        usage.input = evt.usage.prompt_tokens;
        usage.cached = evt.usage.prompt_tokens_details?.cached_tokens;
        usage.output = evt.usage.completion_tokens;
      }
      const t = evt.choices?.[0]?.delta?.content;
      if (typeof t === 'string' && t) yield t;
    }
  }
}

export async function answerRoutes(app: FastifyInstance) {
  const perMinute = rateLimiter(30, 60_000);
  const perSummaryWindow = rateLimiter(4, 60 * 60_000); // free session reviews: a few per hour
  const inflight = new Map<string, number>();

  await refreshModels(app.log);
  setInterval(() => refreshModels(app.log), 30 * 60_000).unref();

  app.get('/v1/models', async () => ({
    models: availableModels().map(({ id, label, tag, hint }) => ({ id, label, tag, hint })),
    default: resolveModel(config.defaultModel).id,
  }));

  app.post('/v1/answer', { bodyLimit: 8 * 1024 * 1024 }, async (req, reply) => {
    const user = await authenticate(req);
    assertOpen(user);
    perMinute(user.id);
    if (!aiConfigured()) throw new HttpError(503, 'not_configured', 'AI is not configured on the server.');

    const b = (req.body ?? {}) as Record<string, any>;
    const action: Action = ACTIONS.includes(b.action) ? b.action : 'answer';
    const sessionTag = sessionRef(b.session?.id, b.session?.title);
    const chosen = resolveModel(b.model);
    const mode: Mode = MODES.includes(b.profile?.mode) ? b.profile.mode : 'general';
    // The session review sends its log of answers (incl. questions read off the screen) here.
    const question = str(b.question, b.action === 'summary' ? 12_000 : 4000);
    const context = str(b.profile?.context, 6000);
    const language = str(b.profile?.language, 40) || 'English';
    const image = typeof b.image === 'string' && b.image.length > 100 ? b.image : null;
    if (image && image.length > 7_000_000) throw new HttpError(413, 'bad_request', 'Screenshot too large.');
    // The end-of-session review reads the whole session, not just the last few minutes.
    const summary = action === 'summary';
    if (summary) perSummaryWindow(user.id);
    const transcript = summary ? cleanTranscript(b.transcript, 2000, 90_000) : cleanTranscript(b.transcript);
    const history = cleanHistory(b.history);
    const session = cleanSession(b.profile?.session);
    const docs = cleanDocs(b.profile?.docs);

    if ((inflight.get(user.id) ?? 0) >= 2) throw new HttpError(429, 'rate_limited', 'One answer at a time.');
    if ((await effectiveBalance(user.id)) <= 0) {
      throw new HttpError(402, 'no_balance', 'You are out of time. Add hours to keep going.');
    }

    // Answers are included while live; otherwise they cost a flat ANSWER_SECONDS. The session review is free.
    const charge = summary || isLive(user.id) ? 0 : config.answerSeconds;
    if (charge) await deduct(user.id, charge);

    const startedAt = Date.now();
    const abort = new AbortController();
    inflight.set(user.id, (inflight.get(user.id) ?? 0) + 1);

    reply.hijack();
    const res = reply.raw;
    // The response (not the request) closes when the client disconnects mid-stream.
    res.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
      ...corsHeaders(req.headers.origin),
    });
    res.flushHeaders?.();
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    const usage: StreamUsage = {};
    const model = config.mockAI ? 'mock' : chosen.id;
    let ok = false;
    try {
      const stream = config.mockAI
        ? mockAnswer(action, question)
        : openaiStream(
            {
              model,
              stream: true,
              stream_options: { include_usage: true },
              max_completion_tokens: summary ? Math.max(config.maxOutputTokens, 1800) : config.maxOutputTokens,
              ...(chosen.effort ? { reasoning_effort: chosen.effort } : {}),
              ...(config.serviceTier && !priorityRejected ? { service_tier: config.serviceTier } : {}),
              messages: [
                { role: 'system', content: systemPrompt(mode, language) },
                ...history,
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: userPrompt({ action, question, transcript, context, hasImage: !!image, session, docs }),
                    },
                    ...(image
                      ? [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}`, detail: 'high' } }]
                      : []),
                  ],
                },
              ],
            },
            abort.signal,
            usage,
          );
      for await (const t of stream) {
        if (abort.signal.aborted) break;
        send('delta', { t });
      }
      ok = !abort.signal.aborted;
      send('done', { balance_seconds: await effectiveBalance(user.id), ms: Date.now() - startedAt });
    } catch (e: any) {
      if (!abort.signal.aborted) {
        await refund(user.id, charge).catch(() => {});
        req.log.error({ err: e?.message }, 'answer failed');
        const err = e instanceof HttpError ? e : new HttpError(502, 'upstream', 'The AI did not respond. Try again.');
        send('error', { error: err.code, message: err.message });
      }
    } finally {
      inflight.set(user.id, Math.max(0, (inflight.get(user.id) ?? 1) - 1));
      res.end();
      if (ok) {
        logUsage({
          userId: user.id,
          kind: 'answer',
          seconds: charge,
          startedAt,
          endedAt: Date.now(),
          model,
          inputTokens: usage.input,
          cachedTokens: usage.cached,
          outputTokens: usage.output,
          serviceTier: usage.tier,
          costMicros: answerCostMicros({ model, tier: usage.tier, input: usage.input, cached: usage.cached, output: usage.output }),
          session: sessionTag,
          action,
        }).catch((e) => req.log.warn({ err: e?.message }, 'usage log failed'));
      }
    }
  });
}

// reply.hijack() bypasses @fastify/cors, so SSE responses set CORS headers themselves.
function corsHeaders(origin: string | undefined): Record<string, string> {
  if (!origin || !config.corsOrigins.includes(origin)) return {};
  return { 'access-control-allow-origin': origin, vary: 'Origin' };
}
