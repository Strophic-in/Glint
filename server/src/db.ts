/**
 * PostgreSQL (VibeDB or any Postgres 14+). Timestamps are epoch milliseconds (bigint), parsed to
 * JS numbers. Schema is created/updated idempotently at boot under an advisory lock.
 */
import postgres from 'postgres';
import { config } from './config.js';
import { answerCostMicros, sttCostMicros } from './pricing.js';

if (!config.databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set. Create a VibeDB project (`vibedb project create glint`) and put its owner connection string in server/.env.',
  );
}

const port = new URL(config.databaseUrl).port;

export const sql = postgres(config.databaseUrl, {
  max: config.dbPoolSize,
  idle_timeout: 60,
  connect_timeout: 10,
  // VibeDB's pooled endpoint (PgBouncer, transaction pooling) is :6432; named statements stay off there.
  prepare: port !== '6432',
  onnotice: () => {},
  types: {
    bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
  },
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id              uuid PRIMARY KEY,
  google_sub      text UNIQUE,
  email           text NOT NULL UNIQUE,
  name            text,
  picture         text,
  balance_seconds integer NOT NULL DEFAULT 0,
  expires_at      bigint,
  created_at      bigint NOT NULL,
  last_seen_at    bigint,
  blocked         boolean NOT NULL DEFAULT false,
  blocked_reason  text
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash   text PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         text NOT NULL,
  created_at   bigint NOT NULL,
  expires_at   bigint NOT NULL,
  last_used_at bigint NOT NULL,
  user_agent   text
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS device_codes (
  device_hash text PRIMARY KEY,
  user_code   text NOT NULL UNIQUE,
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  created_at  bigint NOT NULL,
  expires_at  bigint NOT NULL,
  consumed    boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS orders (
  id           text PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id      text NOT NULL,
  amount_paise integer NOT NULL,
  seconds      integer NOT NULL,
  status       text NOT NULL,
  payment_id   text,
  created_at   bigint NOT NULL,
  paid_at      bigint
);
CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id, created_at DESC);

-- Every grant or removal of time. UNIQUE(reason, ref) makes crediting idempotent.
CREATE TABLE IF NOT EXISTS credits (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seconds    integer NOT NULL,
  reason     text NOT NULL,
  ref        text NOT NULL,
  note       text,
  created_at bigint NOT NULL,
  UNIQUE (reason, ref)
);

CREATE TABLE IF NOT EXISTS usage (
  id            bigserial PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          text NOT NULL,
  seconds       integer NOT NULL,
  started_at    bigint NOT NULL,
  ended_at      bigint NOT NULL,
  model         text,
  input_tokens  integer,
  output_tokens integer
);
CREATE INDEX IF NOT EXISTS usage_user ON usage(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS usage_started ON usage(started_at);

CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_log (
  id         bigserial PRIMARY KEY,
  admin_id   uuid,
  action     text NOT NULL,
  target     text,
  detail     text,
  created_at bigint NOT NULL
);

-- v2: coupons, account deletion, one trial per email.
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at bigint;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_paise integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS coupons (
  code          text PRIMARY KEY,
  kind          text NOT NULL CHECK (kind IN ('percent', 'flat')),
  value         integer NOT NULL,      -- percent (1-100) or paise
  active        boolean NOT NULL DEFAULT true,
  max_uses      integer,               -- NULL = unlimited
  uses          integer NOT NULL DEFAULT 0,
  once_per_user boolean NOT NULL DEFAULT true,
  plan_ids      text[],                -- NULL = every plan
  expires_at    bigint,
  note          text,
  created_at    bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id             bigserial PRIMARY KEY,
  code           text NOT NULL,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id       text NOT NULL UNIQUE,
  discount_paise integer NOT NULL,
  created_at     bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS coupon_redemptions_user ON coupon_redemptions(code, user_id);

-- sha256 of every email that has received the free trial (survives account deletion).
CREATE TABLE IF NOT EXISTS trial_claims (
  email_hash text PRIMARY KEY,
  created_at bigint NOT NULL
);

-- v3: what each usage row cost us (USD micro-dollars), for the admin panel.
ALTER TABLE usage ADD COLUMN IF NOT EXISTS cached_tokens integer;
ALTER TABLE usage ADD COLUMN IF NOT EXISTS audio_ms integer;
ALTER TABLE usage ADD COLUMN IF NOT EXISTS cost_micros bigint;
ALTER TABLE usage ADD COLUMN IF NOT EXISTS service_tier text;

-- v4: public coupons, advertised on the website with the admin's banner text.
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS public boolean NOT NULL DEFAULT false;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS public_text text;

-- v5: which app session a usage row belongs to, so the dashboard can group them. The title is the
-- user's own label for the session (e.g. "Interview · Acme"); no conversation content is stored.
ALTER TABLE usage ADD COLUMN IF NOT EXISTS session_id text;
ALTER TABLE usage ADD COLUMN IF NOT EXISTS session_title text;
ALTER TABLE usage ADD COLUMN IF NOT EXISTS action text;
CREATE INDEX IF NOT EXISTS usage_session ON usage(user_id, session_id);
`;

/** Create/upgrade tables. Safe to run on every boot and from several instances at once. */
export async function migrate() {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(7461001)`;
    await tx.unsafe(SCHEMA);
    await backfillCosts(tx);
  });
}

/**
 * Estimate cost for usage rows logged before costs were recorded (runs until none are left).
 * Answers: their tokens at the configured service tier. Live sessions: audio wasn't measured, so
 * assume the other side speaks ~45% and the user ~40% of the session (docs/PRODUCT.md).
 */
async function backfillCosts(tx: postgres.TransactionSql) {
  const rows = await tx<{ id: number; kind: string; seconds: number; model: string | null; input_tokens: number | null; output_tokens: number | null }[]>`
    SELECT id, kind, seconds, model, input_tokens, output_tokens FROM usage WHERE cost_micros IS NULL`;
  if (!rows.length) return;
  const ids: number[] = [];
  const costs: number[] = [];
  for (const r of rows) {
    ids.push(r.id);
    costs.push(
      r.kind === 'answer'
        ? answerCostMicros({ model: r.model, tier: config.serviceTier, input: r.input_tokens, output: r.output_tokens })
        : sttCostMicros(config.sttThem, r.seconds * 0.45) + sttCostMicros(config.sttYou, r.seconds * 0.4),
    );
  }
  await tx`
    UPDATE usage SET cost_micros = v.cost
    FROM (SELECT unnest(string_to_array(${ids.join(',')}, ',')::bigint[]) AS id,
                 unnest(string_to_array(${costs.join(',')}, ',')::bigint[]) AS cost) v
    WHERE usage.id = v.id`;
}

export async function closeDb() {
  await sql.end({ timeout: 5 });
}

export interface UserRow {
  id: string;
  google_sub: string | null;
  email: string;
  name: string | null;
  picture: string | null;
  balance_seconds: number;
  expires_at: number | null;
  created_at: number;
  last_seen_at: number | null;
  blocked: boolean;
  blocked_reason: string | null;
  phone: string | null;
  deleted_at: number | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID.test(s);

export async function getUser(id: string): Promise<UserRow | undefined> {
  if (!isUuid(id)) return undefined;
  const [u] = await sql<UserRow[]>`SELECT * FROM users WHERE id = ${id}`;
  return u;
}

export async function getUserByEmail(email: string): Promise<UserRow | undefined> {
  const [u] = await sql<UserRow[]>`SELECT * FROM users WHERE email = ${email.toLowerCase()}`;
  return u;
}

export async function getUserBySub(sub: string): Promise<UserRow | undefined> {
  const [u] = await sql<UserRow[]>`SELECT * FROM users WHERE google_sub = ${sub}`;
  return u;
}

/** Balance after applying expiry. Expired balances are zeroed lazily. */
export async function effectiveBalance(userId: string): Promise<number> {
  const now = Date.now();
  const [u] = await sql<{ balance_seconds: number; expires_at: number | null }[]>`
    SELECT balance_seconds, expires_at FROM users WHERE id = ${userId}`;
  if (!u) return 0;
  if (u.expires_at && u.expires_at < now && u.balance_seconds > 0) {
    await sql`UPDATE users SET balance_seconds = 0 WHERE id = ${userId} AND expires_at < ${now}`;
    return 0;
  }
  return u.balance_seconds;
}

/**
 * Grant time exactly once per (reason, ref). Returns true if this call credited it.
 * Every grant pushes the validity of the whole balance to now + VALIDITY_DAYS.
 */
export async function credit(userId: string, seconds: number, reason: string, ref: string, note?: string) {
  const now = Date.now();
  const validUntil = now + config.validityDays * 86_400_000;
  return sql.begin(async (tx) => {
    const inserted = await tx`
      INSERT INTO credits (user_id, seconds, reason, ref, note, created_at)
      VALUES (${userId}, ${seconds}, ${reason}, ${ref}, ${note ?? null}, ${now})
      ON CONFLICT (reason, ref) DO NOTHING`;
    if (inserted.count === 0) return false;
    await tx`
      UPDATE users SET
        balance_seconds = (CASE WHEN expires_at IS NOT NULL AND expires_at < ${now} THEN 0 ELSE balance_seconds END) + ${seconds},
        expires_at = GREATEST(COALESCE(expires_at, 0), ${validUntil})
      WHERE id = ${userId}`;
    return true;
  });
}

export async function deduct(userId: string, seconds: number): Promise<number> {
  if (seconds <= 0) return effectiveBalance(userId);
  const [row] = await sql<{ balance_seconds: number }[]>`
    UPDATE users SET balance_seconds = GREATEST(balance_seconds - ${seconds}, 0)
    WHERE id = ${userId} RETURNING balance_seconds`;
  return row?.balance_seconds ?? 0;
}

/** Give back seconds charged for work that failed. Does not extend validity. */
export async function refund(userId: string, seconds: number) {
  if (seconds > 0) await sql`UPDATE users SET balance_seconds = balance_seconds + ${seconds} WHERE id = ${userId}`;
}

export async function logUsage(u: {
  userId: string;
  kind: 'live' | 'answer';
  seconds: number;
  startedAt: number;
  endedAt: number;
  model?: string | null;
  inputTokens?: number | null;
  cachedTokens?: number | null;
  outputTokens?: number | null;
  audioMs?: number | null;
  serviceTier?: string | null;
  /** What the row cost us in USD micro-dollars (see pricing.ts). */
  costMicros: number;
  /** The app session this belongs to (see sessionRef). */
  session?: SessionRef | null;
  /** For answers: answer, screen, ask, shorter, … */
  action?: string | null;
}) {
  await sql`
    INSERT INTO usage (user_id, kind, seconds, started_at, ended_at, model, input_tokens, cached_tokens, output_tokens,
                       audio_ms, service_tier, cost_micros, session_id, session_title, action)
    VALUES (${u.userId}, ${u.kind}, ${u.seconds}, ${u.startedAt}, ${u.endedAt},
            ${u.model ?? null}, ${u.inputTokens ?? null}, ${u.cachedTokens ?? null}, ${u.outputTokens ?? null},
            ${u.audioMs ?? null}, ${u.serviceTier ?? null}, ${u.costMicros},
            ${u.session?.id ?? null}, ${u.session?.title ?? null}, ${u.action ?? null})`;
}

export interface SessionRef {
  id: string;
  title: string | null;
}

/** The app's session id + title from untrusted input: a short opaque id and a short label, or null. */
export function sessionRef(id: unknown, title: unknown): SessionRef | null {
  if (typeof id !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(id)) return null;
  const t = typeof title === 'string' ? title.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80) : '';
  return { id, title: t || null };
}
