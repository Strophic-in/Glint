/**
 * Settings the admin can change at runtime (admin panel → Controls). Stored in app_settings and
 * applied on top of the env config at boot and on every change. No restart needed.
 */
import { config } from './config.js';
import { sql } from './db.js';

export const runtime = {
  maintenance: false,
  maintenanceMessage: 'Glint is down for a quick upgrade. Please try again in a few minutes.',
  signupsOpen: true,
  /** Rupees per US dollar, for showing AI cost (billed in USD) next to revenue (in INR). */
  usdInr: 88,
};

type Kind = 'bool' | 'int' | 'number' | 'string' | 'list';
const FIELDS: Record<string, { kind: Kind; get: () => unknown; set: (v: any) => void; min?: number; max?: number }> = {
  maintenance: { kind: 'bool', get: () => runtime.maintenance, set: (v) => (runtime.maintenance = v) },
  maintenance_message: {
    kind: 'string',
    get: () => runtime.maintenanceMessage,
    set: (v) => (runtime.maintenanceMessage = v),
  },
  signups_open: { kind: 'bool', get: () => runtime.signupsOpen, set: (v) => (runtime.signupsOpen = v) },
  trial_seconds: { kind: 'int', min: 0, max: 36_000, get: () => config.trialSeconds, set: (v) => (config.trialSeconds = v) },
  answer_seconds: { kind: 'int', min: 0, max: 600, get: () => config.answerSeconds, set: (v) => (config.answerSeconds = v) },
  idle_timeout_s: { kind: 'int', min: 60, max: 7200, get: () => config.idleTimeoutS, set: (v) => (config.idleTimeoutS = v) },
  allowed_models: { kind: 'list', get: () => config.allowedModels, set: (v) => (config.allowedModels = v) },
  default_model: { kind: 'string', get: () => config.defaultModel, set: (v) => (config.defaultModel = v) },
  usd_inr: { kind: 'number', min: 1, max: 1000, get: () => runtime.usdInr, set: (v) => (runtime.usdInr = v) },
};

function coerce(kind: Kind, v: unknown, min = -Infinity, max = Infinity) {
  switch (kind) {
    case 'bool':
      return v === true || v === 'true' || v === 1;
    case 'int':
    case 'number': {
      const n = kind === 'int' ? Math.trunc(Number(v)) : Math.round(Number(v) * 100) / 100;
      if (!Number.isFinite(n)) throw new Error('not a number');
      return Math.min(max, Math.max(min, n));
    }
    case 'list':
      return (Array.isArray(v) ? v : String(v).split(','))
        .map((s) => String(s).trim())
        .filter(Boolean)
        .slice(0, 20);
    case 'string':
      return String(v ?? '').slice(0, 500);
  }
}

export async function loadRuntime() {
  for (const row of await sql<{ key: string; value: string }[]>`SELECT key, value FROM app_settings`) {
    const f = FIELDS[row.key];
    if (!f) continue;
    try {
      f.set(coerce(f.kind, JSON.parse(row.value), f.min, f.max));
    } catch {
      /* ignore bad rows */
    }
  }
}

export function getRuntime() {
  return Object.fromEntries(Object.entries(FIELDS).map(([k, f]) => [k, f.get()]));
}

/** Apply and persist a partial update. Unknown keys are ignored. */
export async function setRuntime(patch: Record<string, unknown>) {
  for (const [k, v] of Object.entries(patch)) {
    const f = FIELDS[k];
    if (!f) continue;
    const value = coerce(f.kind, v, f.min, f.max);
    f.set(value);
    await sql`
      INSERT INTO app_settings (key, value, updated_at) VALUES (${k}, ${JSON.stringify(value)}, ${Date.now()})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`;
  }
  return getRuntime();
}
