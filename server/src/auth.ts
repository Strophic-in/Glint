import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { randomInt, randomUUID } from 'node:crypto';
import { config } from './config.js';
import { credit, effectiveBalance, getUser, getUserByEmail, getUserBySub, sql, type UserRow } from './db.js';
import { HttpError, randomToken, rateLimiter, sha256, str } from './util.js';
import { isLive } from './live-registry.js';
import { runtime } from './runtime.js';

export const isAdminEmail = (email: string) => config.adminEmails.includes(email.toLowerCase());

/** Maintenance mode blocks AI features for everyone except admins. */
export function assertOpen(user: UserRow) {
  if (runtime.maintenance && !isAdminEmail(user.email)) {
    throw new HttpError(503, 'maintenance', runtime.maintenanceMessage);
  }
}

const DAY = 86_400_000;
const DEVICE_TTL_MS = 10 * 60_000;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L

const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

setInterval(() => {
  sql`DELETE FROM device_codes WHERE expires_at < ${Date.now() - DAY}`.catch(() => {});
}, 3_600_000).unref();

interface DeviceRow {
  device_hash: string;
  user_code: string;
  user_id: string | null;
  created_at: number;
  expires_at: number;
  consumed: boolean;
}

export function publicUser(u: UserRow) {
  return { id: u.id, email: u.email, name: u.name, picture: u.picture };
}

async function issueSession(userId: string, kind: 'web' | 'desktop', userAgent?: string) {
  const token = randomToken();
  const now = Date.now();
  await sql`
    INSERT INTO sessions (token_hash, user_id, kind, created_at, expires_at, last_used_at, user_agent)
    VALUES (${sha256(token)}, ${userId}, ${kind}, ${now}, ${now + config.sessionDays * DAY}, ${now},
            ${str(userAgent, 200) || null})`;
  return token;
}

/** Resolve the bearer token to a user, or throw 401 (or 403 if the account is blocked). */
export async function authenticate(req: FastifyRequest): Promise<UserRow> {
  const h = req.headers.authorization ?? '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'unauthorized', 'Please sign in.');
  const hash = sha256(token);
  const [row] = await sql<(UserRow & { s_expires_at: number; s_last_used_at: number })[]>`
    SELECT u.*, s.expires_at AS s_expires_at, s.last_used_at AS s_last_used_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${hash}`;
  const now = Date.now();
  if (!row || row.s_expires_at < now) {
    throw new HttpError(401, 'unauthorized', 'Your session expired. Please sign in again.');
  }
  const { s_expires_at: _e, s_last_used_at: lastUsed, ...user } = row;
  if (user.blocked) {
    throw new HttpError(403, 'account_blocked', user.blocked_reason || 'This account has been suspended. Contact support.');
  }
  // Avoid a write per request: refresh activity at most every 10 minutes.
  if (now - lastUsed > 600_000) {
    await sql`UPDATE sessions SET last_used_at = ${now} WHERE token_hash = ${hash}`;
    await sql`UPDATE users SET last_seen_at = ${now} WHERE id = ${user.id}`;
  }
  return user;
}

async function upsertUser(p: { sub?: string; email: string; name?: string | null; picture?: string | null }) {
  const email = p.email.toLowerCase();
  const existing = (p.sub ? await getUserBySub(p.sub) : undefined) ?? (await getUserByEmail(email));
  if (existing) {
    await sql`
      UPDATE users SET google_sub = COALESCE(${p.sub ?? null}, google_sub), name = COALESCE(${p.name ?? null}, name),
        picture = COALESCE(${p.picture ?? null}, picture)
      WHERE id = ${existing.id}`;
  } else {
    if (!runtime.signupsOpen && !isAdminEmail(email)) {
      throw new HttpError(403, 'signups_closed', 'New sign-ups are paused right now. Please try again later.');
    }
    const id = randomUUID();
    const now = Date.now();
    const inserted = await sql`
      INSERT INTO users (id, google_sub, email, name, picture, created_at, last_seen_at)
      VALUES (${id}, ${p.sub ?? null}, ${email}, ${p.name ?? null}, ${p.picture ?? null}, ${now}, ${now})
      ON CONFLICT (email) DO NOTHING`;
    // One free trial per email, ever: deleting the account and signing up again doesn't renew it.
    // (A concurrent sign-in that lost the race inserts nothing and gets no second trial.)
    if (inserted.count && config.trialSeconds > 0) {
      const claim = await sql`INSERT INTO trial_claims (email_hash, created_at) VALUES (${sha256(email)}, ${now})
                             ON CONFLICT (email_hash) DO NOTHING`;
      if (claim.count) await credit(id, config.trialSeconds, 'trial', id, 'Welcome trial');
    }
  }
  const user = await getUserByEmail(email);
  if (!user) throw new HttpError(500, 'internal', 'Could not create account.');
  if (user.blocked) {
    throw new HttpError(403, 'account_blocked', user.blocked_reason || 'This account has been suspended. Contact support.');
  }
  return user;
}

function makeUserCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

function normalizeCode(v: unknown) {
  const raw = str(v, 20).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : '';
}

export async function mePayload(user: UserRow) {
  const fresh = (await getUser(user.id)) ?? user;
  return {
    user: { ...publicUser(fresh), phone: fresh.phone },
    balance_seconds: await effectiveBalance(user.id),
    expires_at: fresh.expires_at,
    live: isLive(user.id),
    trial_seconds: config.trialSeconds,
    is_admin: isAdminEmail(fresh.email),
    maintenance: runtime.maintenance ? runtime.maintenanceMessage : null,
  };
}

export async function authRoutes(app: FastifyInstance) {
  const ipLimit = rateLimiter(20, 60_000);
  const pollLimit = rateLimiter(90, 60_000);

  app.post('/v1/auth/google', async (req) => {
    ipLimit(`g:${req.ip}`);
    const credential = str((req.body as any)?.credential, 4096);
    if (!credential) throw new HttpError(400, 'bad_request', 'Missing Google credential.');
    if (!config.googleClientIds.length) throw new HttpError(503, 'not_configured', 'Google sign-in is not configured.');
    let payload;
    try {
      ({ payload } = await jwtVerify(credential, googleJwks, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: config.googleClientIds,
      }));
    } catch {
      throw new HttpError(401, 'unauthorized', 'Google sign-in failed. Please try again.');
    }
    if (typeof payload.email !== 'string' || payload.email_verified !== true || typeof payload.sub !== 'string') {
      throw new HttpError(401, 'unauthorized', 'Your Google email is not verified.');
    }
    const user = await upsertUser({
      sub: payload.sub,
      email: payload.email,
      name: typeof payload.name === 'string' ? payload.name : null,
      picture: typeof payload.picture === 'string' ? payload.picture : null,
    });
    return { token: await issueSession(user.id, 'web', req.headers['user-agent']), user: publicUser(user) };
  });

  app.post('/v1/auth/dev', async (req) => {
    if (!config.devLogin) throw new HttpError(404, 'not_found');
    const email = str((req.body as any)?.email, 200).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'bad_request', 'Enter a valid email.');
    const user = await upsertUser({ email, name: email.split('@')[0] });
    return { token: await issueSession(user.id, 'web', req.headers['user-agent']), user: publicUser(user) };
  });

  app.post('/v1/auth/device/start', async (req) => {
    ipLimit(`d:${req.ip}`);
    const deviceCode = randomToken();
    const now = Date.now();
    let userCode = '';
    for (let i = 0; i < 5 && !userCode; i++) {
      const c = makeUserCode();
      const r = await sql`
        INSERT INTO device_codes (device_hash, user_code, created_at, expires_at)
        VALUES (${sha256(deviceCode)}, ${c}, ${now}, ${now + DEVICE_TTL_MS})
        ON CONFLICT (user_code) DO NOTHING`;
      if (r.count) userCode = c;
    }
    if (!userCode) throw new HttpError(500, 'internal', 'Could not start sign-in.');
    return {
      device_code: deviceCode,
      user_code: userCode,
      verify_url: `${config.webUrl}/device?code=${userCode}`,
      interval: 2,
      expires_in: DEVICE_TTL_MS / 1000,
    };
  });

  app.get('/v1/auth/device/info', async (req) => {
    const code = normalizeCode((req.query as any)?.user_code);
    const [d] = code ? await sql<DeviceRow[]>`SELECT * FROM device_codes WHERE user_code = ${code}` : [];
    if (!d || d.consumed || d.user_id || d.expires_at < Date.now()) {
      throw new HttpError(404, 'not_found', 'This code is invalid or has expired. Start sign-in again from the app.');
    }
    return { user_code: d.user_code, expires_in: Math.round((d.expires_at - Date.now()) / 1000) };
  });

  app.post('/v1/auth/device/approve', async (req) => {
    const user = await authenticate(req);
    const code = normalizeCode((req.body as any)?.user_code);
    if (!code) throw new HttpError(400, 'bad_request', 'Missing code.');
    const r = await sql`
      UPDATE device_codes SET user_id = ${user.id}
      WHERE user_code = ${code} AND user_id IS NULL AND NOT consumed AND expires_at > ${Date.now()}`;
    if (r.count === 0) {
      throw new HttpError(404, 'not_found', 'This code is invalid or has expired. Start sign-in again from the app.');
    }
    return { ok: true };
  });

  app.post('/v1/auth/device/poll', async (req, reply) => {
    pollLimit(`p:${req.ip}`);
    const deviceCode = str((req.body as any)?.device_code, 100);
    const hash = sha256(deviceCode);
    const [d] = deviceCode ? await sql<DeviceRow[]>`SELECT * FROM device_codes WHERE device_hash = ${hash}` : [];
    if (!d || d.consumed || d.expires_at < Date.now()) {
      return reply.code(410).send({ error: 'expired', message: 'Sign-in timed out. Please try again.' });
    }
    if (!d.user_id) return { status: 'pending' };
    const consumed = await sql`UPDATE device_codes SET consumed = true WHERE device_hash = ${hash} AND NOT consumed`;
    if (consumed.count === 0) {
      return reply.code(410).send({ error: 'expired', message: 'Sign-in timed out. Please try again.' });
    }
    const user = await getUser(d.user_id);
    if (!user) throw new HttpError(404, 'not_found');
    return {
      status: 'approved',
      token: await issueSession(user.id, 'desktop', req.headers['user-agent']),
      user: publicUser(user),
    };
  });

  app.post('/v1/auth/logout', async (req) => {
    const h = req.headers.authorization ?? '';
    if (h.startsWith('Bearer ')) await sql`DELETE FROM sessions WHERE token_hash = ${sha256(h.slice(7).trim())}`;
    return { ok: true };
  });

  app.get('/v1/me', async (req) => mePayload(await authenticate(req)));

  app.get('/v1/usage', async (req) => {
    const user = await authenticate(req);
    const [usage, orders] = await Promise.all([
      // Enough rows to show recent sessions whole (one session is a few listen rows plus its answers).
      sql`SELECT kind, seconds, started_at, ended_at, session_id, session_title, action FROM usage
          WHERE user_id = ${user.id} ORDER BY started_at DESC LIMIT 400`,
      sql`SELECT id, plan_id, amount_paise, seconds, status, created_at, paid_at FROM orders
          WHERE user_id = ${user.id} AND status = 'paid' ORDER BY created_at DESC LIMIT 50`,
    ]);
    return { usage, orders };
  });
}
