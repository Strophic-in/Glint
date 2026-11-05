/**
 * What Glint pays OpenAI, used to estimate AI cost per usage row (admin panel).
 * Prices in USD from https://developers.openai.com/api/docs/pricing, checked 2026-11-05.
 * Override without a deploy: PRICES_JSON='{"text":{"gpt-6-luna":{"input":0.1,"cached":0.01,"output":0.5}},"sttPerMin":{"gpt-transcribe":0.0045}}'
 */

/** USD per 1M tokens. */
export interface TextPrice {
  input: number;
  cached: number;
  output: number;
}

const DEFAULT_TEXT: Record<string, TextPrice> = {
  'gpt-6-luna': { input: 0.1, cached: 0.01, output: 0.5 },
  'gpt-6.1-terra': { input: 1.0, cached: 0.05, output: 5.0 },
  'gpt-6.1-sol': { input: 2.0, cached: 0.1, output: 10.0 },
};

/** USD per audio minute. */
const DEFAULT_STT: Record<string, number> = {
  'gpt-live-transcribe': 0.017,
  'gpt-transcribe': 0.0045,
};

const FALLBACK_TEXT = 'gpt-6.1-terra';
const FALLBACK_STT = 'gpt-live-transcribe';
/** The priority lane ("Fast mode" since 2026-07-30) costs double. */
const TIER_MULTIPLIER: Record<string, number> = { priority: 2, fast: 2 };

function overrides(): { text?: Record<string, Partial<TextPrice>>; sttPerMin?: Record<string, number> } {
  const raw = process.env.PRICES_JSON;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    console.warn('PRICES_JSON is not valid JSON; using built-in prices');
    return {};
  }
}

const o = overrides();
export const TEXT_PRICES: Record<string, TextPrice> = { ...DEFAULT_TEXT };
for (const [model, p] of Object.entries(o.text ?? {})) {
  TEXT_PRICES[model] = { ...(TEXT_PRICES[model] ?? DEFAULT_TEXT[FALLBACK_TEXT]!), ...p };
}
export const STT_PRICES: Record<string, number> = { ...DEFAULT_STT, ...(o.sttPerMin ?? {}) };

const warned = new Set<string>();
function warnOnce(model: string, kind: string, fallback: string) {
  if (warned.has(model)) return;
  warned.add(model);
  console.warn(`No ${kind} price for "${model}"; estimating with ${fallback} prices`);
}

const FREE = new Set(['mock']);

/** Cost of one chat completion in USD micro-dollars (integer). */
export function answerCostMicros(u: {
  model: string | null | undefined;
  tier?: string | null;
  input?: number | null;
  cached?: number | null;
  output?: number | null;
}): number {
  const model = u.model ?? '';
  if (FREE.has(model)) return 0;
  let p = TEXT_PRICES[model];
  if (!p) {
    warnOnce(model, 'text', FALLBACK_TEXT);
    p = TEXT_PRICES[FALLBACK_TEXT]!;
  }
  const input = Math.max(0, u.input ?? 0);
  const cached = Math.min(input, Math.max(0, u.cached ?? 0));
  const output = Math.max(0, u.output ?? 0);
  const usd = ((input - cached) * p.input + cached * p.cached + output * p.output) / 1e6;
  return Math.round(usd * (TIER_MULTIPLIER[u.tier ?? ''] ?? 1) * 1e6);
}

/** Cost of `seconds` of audio sent to a transcription model, in USD micro-dollars. */
export function sttCostMicros(model: string, seconds: number): number {
  if (FREE.has(model) || seconds <= 0) return 0;
  let perMin = STT_PRICES[model];
  if (perMin === undefined) {
    warnOnce(model, 'transcription', FALLBACK_STT);
    perMin = STT_PRICES[FALLBACK_STT]!;
  }
  return Math.round((seconds / 60) * perMin * 1e6);
}
