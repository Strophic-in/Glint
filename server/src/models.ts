import { config } from './config.js';

export interface ModelInfo {
  id: string;
  label: string;
  tag: string;
  hint: string;
  effort: string; // reasoning_effort; '' = omit
}

// Models users may pick in the app. ALLOWED_MODELS narrows this list; models the OpenAI
// project can't use are hidden automatically.
const CATALOG: ModelInfo[] = [
  { id: 'gpt-6-luna', label: 'GPT-6 Luna', tag: 'Recommended · Fast', hint: 'Fast and balanced, best for live calls', effort: 'none' },
  { id: 'gpt-6.1-terra', label: 'GPT-6.1 Terra', tag: 'Smart', hint: 'Sharper on screens, coding and MCQs', effort: 'none' },
  { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', tag: 'Smartest', hint: 'Most capable, a little slower', effort: 'none' },
];

let accessible: Set<string> | null = null;

/** Ask OpenAI which models this key can use. Failure keeps the last known list. */
export async function refreshModels(log?: { warn: (o: object, m: string) => void }) {
  if (config.mockAI || !config.openaiKey) return;
  try {
    const res = await fetch(`${config.openaiBase}/models`, {
      headers: { authorization: `Bearer ${config.openaiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { data?: { id: string }[] };
    accessible = new Set((body.data ?? []).map((m) => m.id));
  } catch (e: any) {
    log?.warn({ err: e?.message }, 'could not list OpenAI models');
  }
}

/** Full catalog with whether each model is allowed (admin setting) and usable (OpenAI access). */
export function catalogStatus() {
  return CATALOG.map((m) => ({
    id: m.id,
    label: m.label,
    allowed: config.allowedModels.includes(m.id),
    accessible: accessible === null || accessible.has(m.id),
  }));
}

export function availableModels(): ModelInfo[] {
  return CATALOG.filter(
    (m) => config.allowedModels.includes(m.id) && (accessible === null || accessible.has(m.id)),
  );
}

/** The requested model if the user may use it, otherwise the default (or first available). */
export function resolveModel(requested: unknown): ModelInfo {
  const list = availableModels();
  const pick = (id: unknown) => list.find((m) => m.id === id);
  return (
    pick(requested) ??
    pick(config.defaultModel) ??
    list[0] ??
    CATALOG.find((m) => m.id === config.defaultModel) ??
    CATALOG[0]!
  );
}
