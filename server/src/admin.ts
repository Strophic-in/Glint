/**
 * Admin API (ADMIN_EMAILS only): stats, users (block, time, force logout), live sessions,
 * orders, runtime controls and an audit log of every admin action.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, isAdminEmail, publicUser } from './auth.js';
import { config } from './config.js';
import { credit, effectiveBalance, getUser, getUserByEmail, isUuid, sql, type UserRow } from './db.js';
import { closeLive, isLive, listLive } from './live-registry.js';
import { catalogStatus } from './models.js';
import { PLANS } from './billing.js';
import { normalizeCode } from './coupons.js';
import { getRuntime, setRuntime } from './runtime.js';
import { HttpError, str } from './util.js';

const DAY = 86_400_000;

async function requireAdmin(req: FastifyRequest): Promise<UserRow> {
  const user = await authenticate(req);
  if (!isAdminEmail(user.email)) throw new HttpError(403, 'forbidden', 'Admins only.');
  return user;
}

async function audit(admin: UserRow, action: string, target: string | null, detail?: unknown) {
  await sql`
    INSERT INTO admin_log (admin_id, action, target, detail, created_at)
    VALUES (${admin.id}, ${action}, ${target}, ${detail === undefined ? null : JSON.stringify(detail)}, ${Date.now()})`;
}

/** Validate coupon fields from the admin UI. `create` requires code, kind and value. */
function parseCoupon(body: unknown, create: boolean) {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: {
    code?: string;
    kind?: 'percent' | 'flat';
    value?: number;
    active?: boolean;
    max_uses?: number | null;
    once_per_user?: boolean;
    plan_ids?: string[] | null;
    expires_at?: number | null;
    note?: string | null;
  } = {};
  if (create || b.code !== undefined) {
    out.code = normalizeCode(b.code);
    if (!out.code) throw new HttpError(400, 'bad_request', 'Code must be 3-32 letters, digits, - or _.');
  }
  if (create || b.kind !== undefined) {
    if (b.kind !== 'percent' && b.kind !== 'flat') throw new HttpError(400, 'bad_request', 'Type must be percent or flat.');
    out.kind = b.kind;
  }
  if (create || b.value !== undefined) {
    const v = Math.trunc(Number(b.value));
    const kind = out.kind ?? (b.kind as string);
    const max = kind === 'percent' ? 100 : 10_000_000;
    if (!Number.isFinite(v) || v < 1 || (kind === 'percent' && v > max)) {
      throw new HttpError(400, 'bad_request', kind === 'percent' ? 'Percent must be 1-100.' : 'Enter an amount in paise (≥ 1).');
    }
    out.value = v;
  }
  if (b.active !== undefined) out.active = b.active === true;
  if (b.once_per_user !== undefined) out.once_per_user = b.once_per_user === true;
  if (b.max_uses !== undefined) {
    const n = b.max_uses === null || b.max_uses === '' ? null : Math.trunc(Number(b.max_uses));
    if (n !== null && (!Number.isFinite(n) || n < 1)) throw new HttpError(400, 'bad_request', 'Max uses must be 1 or more.');
    out.max_uses = n;
  }
  if (b.plan_ids !== undefined) {
    const ids = Array.isArray(b.plan_ids) ? b.plan_ids.map(String).filter((id) => PLANS.some((p) => p.id === id)) : [];
    out.plan_ids = ids.length ? ids : null;
  }
  if (b.expires_at !== undefined) {
    const t = b.expires_at === null || b.expires_at === '' ? null : Math.trunc(Number(b.expires_at));
    if (t !== null && !Number.isFinite(t)) throw new HttpError(400, 'bad_request', 'Bad expiry date.');
    out.expires_at = t;
  }
  if (b.note !== undefined) out.note = str(b.note, 200) || null;
  return out;
}

async function targetUser(req: FastifyRequest): Promise<UserRow> {
  const user = await getUser(str((req.params as any)?.id, 64));
  if (!user) throw new HttpError(404, 'not_found', 'User not found.');
  return user;
}

export async function adminRoutes(app: FastifyInstance) {
  app.get('/v1/admin/stats', async (req) => {
    await requireAdmin(req);
    const now = Date.now();
    const since = (days: number) => now - days * DAY;
    const [s] = await sql`
      SELECT
        (SELECT count(*) FROM users)::int AS users_total,
        (SELECT count(*) FROM users WHERE created_at >= ${since(1)})::int AS users_24h,
        (SELECT count(*) FROM users WHERE created_at >= ${since(7)})::int AS users_7d,
        (SELECT count(*) FROM users WHERE last_seen_at >= ${since(7)})::int AS active_7d,
        (SELECT count(DISTINCT user_id) FROM orders WHERE status = 'paid')::int AS paying_users,
        (SELECT count(*) FROM users WHERE blocked)::int AS blocked_users,
        (SELECT coalesce(sum(amount_paise), 0) FROM orders WHERE status = 'paid')::bigint AS revenue_total_paise,
        (SELECT coalesce(sum(amount_paise), 0) FROM orders WHERE status = 'paid' AND paid_at >= ${since(30)})::bigint AS revenue_30d_paise,
        (SELECT count(*) FROM orders WHERE status = 'paid' AND paid_at >= ${since(30)})::int AS orders_30d,
        (SELECT coalesce(sum(seconds), 0) FROM usage WHERE kind = 'live' AND started_at >= ${since(1)})::bigint AS live_seconds_24h,
        (SELECT coalesce(sum(seconds), 0) FROM usage WHERE kind = 'live' AND started_at >= ${since(7)})::bigint AS live_seconds_7d,
        (SELECT count(*) FROM usage WHERE kind = 'answer' AND started_at >= ${since(1)})::int AS answers_24h,
        (SELECT coalesce(sum(input_tokens), 0) FROM usage WHERE started_at >= ${since(7)})::bigint AS input_tokens_7d,
        (SELECT coalesce(sum(output_tokens), 0) FROM usage WHERE started_at >= ${since(7)})::bigint AS output_tokens_7d,
        (SELECT coalesce(sum(balance_seconds), 0) FROM users)::bigint AS balance_outstanding_seconds`;
    // Rolling 24 h windows, newest first, labelled with the window's end date.
    const daily = await sql`
      WITH w AS (
        SELECT d, ${now}::bigint - (d + 1) * ${DAY}::bigint AS lo, ${now}::bigint - d * ${DAY}::bigint AS hi
        FROM generate_series(0, 13) AS d
      )
      SELECT
        to_char(to_timestamp(hi / 1000.0) AT TIME ZONE ${config.timezone}, 'YYYY-MM-DD') AS day,
        (SELECT count(*) FROM users WHERE created_at >= lo AND created_at < hi)::int AS signups,
        (SELECT coalesce(sum(amount_paise), 0) FROM orders WHERE status = 'paid' AND paid_at >= lo AND paid_at < hi)::bigint AS revenue_paise,
        (SELECT coalesce(sum(seconds), 0) FROM usage WHERE kind = 'live' AND started_at >= lo AND started_at < hi)::bigint AS live_seconds,
        (SELECT count(*) FROM usage WHERE kind = 'answer' AND started_at >= lo AND started_at < hi)::int AS answers
      FROM w ORDER BY d`;
    return { ...s, live_now: listLive().length, daily };
  });

  app.get('/v1/admin/users', async (req) => {
    await requireAdmin(req);
    const qs = req.query as Record<string, string>;
    const search = `%${str(qs.q, 100).trim()}%`;
    const filter = str(qs.filter, 20);
    const limit = Math.min(200, Math.max(1, Number(qs.limit) || 50));
    const offset = Math.max(0, Number(qs.offset) || 0);
    const where = sql`
      (u.email ILIKE ${search} OR coalesce(u.name, '') ILIKE ${search})
      ${filter === 'blocked' ? sql`AND u.blocked` : sql``}
      ${filter === 'paying' ? sql`AND EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.status = 'paid')` : sql``}`;
    const rows = await sql`
      SELECT u.id, u.email, u.name, u.picture, u.created_at, u.last_seen_at, u.balance_seconds, u.expires_at,
             u.blocked, u.blocked_reason,
             (SELECT coalesce(sum(amount_paise), 0) FROM orders o WHERE o.user_id = u.id AND o.status = 'paid')::bigint AS paid_paise,
             (SELECT coalesce(sum(seconds), 0) FROM usage x WHERE x.user_id = u.id)::bigint AS used_seconds
      FROM users u WHERE ${where}
      ORDER BY u.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    const [count] = await sql<{ total: number }[]>`SELECT count(*)::int AS total FROM users u WHERE ${where}`;
    const total = count?.total ?? 0;
    let users = rows.map((r) => ({ ...r, live: isLive(String(r.id)) }));
    if (filter === 'live') users = users.filter((u) => u.live);
    return { users, total };
  });

  app.get('/v1/admin/users/:id', async (req) => {
    await requireAdmin(req);
    const user = await targetUser(req);
    const [usage, orders, credits, sessions, balance] = await Promise.all([
      sql`SELECT kind, seconds, started_at, ended_at, model, input_tokens, output_tokens FROM usage
          WHERE user_id = ${user.id} ORDER BY started_at DESC LIMIT 100`,
      sql`SELECT id, plan_id, amount_paise, seconds, status, payment_id, created_at, paid_at FROM orders
          WHERE user_id = ${user.id} ORDER BY created_at DESC`,
      sql`SELECT seconds, reason, note, created_at FROM credits WHERE user_id = ${user.id}
          ORDER BY created_at DESC LIMIT 100`,
      sql`SELECT kind, created_at, last_used_at, user_agent FROM sessions WHERE user_id = ${user.id}
          ORDER BY last_used_at DESC`,
      effectiveBalance(user.id),
    ]);
    return {
      user: {
        ...publicUser(user),
        created_at: user.created_at,
        last_seen_at: user.last_seen_at,
        balance_seconds: balance,
        expires_at: user.expires_at,
        blocked: user.blocked,
        blocked_reason: user.blocked_reason,
        admin: isAdminEmail(user.email),
      },
      live: isLive(user.id),
      usage,
      orders,
      credits,
      sessions,
    };
  });

  app.post('/v1/admin/users/:id/block', async (req) => {
    const admin = await requireAdmin(req);
    const user = await targetUser(req);
    if (user.id === admin.id) throw new HttpError(400, 'bad_request', "You can't block yourself.");
    const reason = str((req.body as any)?.reason, 300) || null;
    await sql`UPDATE users SET blocked = true, blocked_reason = ${reason} WHERE id = ${user.id}`;
    closeLive(user.id, 'blocked');
    await audit(admin, 'block', user.email, { reason });
    return { ok: true };
  });

  app.post('/v1/admin/users/:id/unblock', async (req) => {
    const admin = await requireAdmin(req);
    const user = await targetUser(req);
    await sql`UPDATE users SET blocked = false, blocked_reason = NULL WHERE id = ${user.id}`;
    await audit(admin, 'unblock', user.email);
    return { ok: true };
  });

  // Positive seconds add time (and extend validity); negative seconds deduct.
  app.post('/v1/admin/users/:id/time', async (req) => {
    const admin = await requireAdmin(req);
    const user = await targetUser(req);
    const seconds = Math.trunc(Number((req.body as any)?.seconds));
    const note = str((req.body as any)?.note, 200) || null;
    if (!Number.isFinite(seconds) || seconds === 0 || Math.abs(seconds) > 1000 * 3600) {
      throw new HttpError(400, 'bad_request', 'Enter a non-zero number of seconds.');
    }
    const ref = `${admin.id}:${Date.now()}`;
    if (seconds > 0) {
      await credit(user.id, seconds, 'admin', ref, note ?? undefined);
    } else {
      await sql.begin(async (tx) => {
        await tx`UPDATE users SET balance_seconds = GREATEST(balance_seconds + ${seconds}, 0) WHERE id = ${user.id}`;
        await tx`INSERT INTO credits (user_id, seconds, reason, ref, note, created_at)
                 VALUES (${user.id}, ${seconds}, 'admin_deduct', ${ref}, ${note}, ${Date.now()})`;
      });
    }
    await audit(admin, seconds > 0 ? 'add_time' : 'deduct_time', user.email, { seconds, note });
    return { ok: true, balance_seconds: await effectiveBalance(user.id) };
  });

  app.post('/v1/admin/users/:id/logout', async (req) => {
    const admin = await requireAdmin(req);
    const user = await targetUser(req);
    await sql`DELETE FROM sessions WHERE user_id = ${user.id}`;
    closeLive(user.id, 'admin');
    await audit(admin, 'force_logout', user.email);
    return { ok: true };
  });

  app.get('/v1/admin/live', async (req) => {
    await requireAdmin(req);
    return { live: listLive() };
  });

  app.post('/v1/admin/live/:id/end', async (req) => {
    const admin = await requireAdmin(req);
    const id = str((req.params as any)?.id, 64);
    if (!isUuid(id)) throw new HttpError(404, 'not_found', 'User not found.');
    closeLive(id, 'admin');
    await audit(admin, 'end_live', (await getUser(id))?.email ?? id);
    return { ok: true };
  });

  app.get('/v1/admin/orders', async (req) => {
    await requireAdmin(req);
    return {
      orders: await sql`
        SELECT o.id, o.plan_id, o.amount_paise, o.seconds, o.status, o.payment_id, o.created_at, o.paid_at,
               u.email, u.id AS user_id
        FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC LIMIT 200`,
    };
  });

  app.get('/v1/admin/config', async (req) => {
    await requireAdmin(req);
    return { config: getRuntime(), models: catalogStatus() };
  });

  app.post('/v1/admin/config', async (req) => {
    const admin = await requireAdmin(req);
    const patch = (req.body ?? {}) as Record<string, unknown>;
    const updated = await setRuntime(patch);
    await audit(admin, 'config', null, patch);
    return { config: updated, models: catalogStatus() };
  });

  app.get('/v1/admin/log', async (req) => {
    await requireAdmin(req);
    return {
      log: await sql`
        SELECT l.action, l.target, l.detail, l.created_at, u.email AS admin
        FROM admin_log l LEFT JOIN users u ON u.id = l.admin_id ORDER BY l.id DESC LIMIT 200`,
    };
  });

  // ── Coupons ──────────────────────────────────────────────
  app.get('/v1/admin/coupons', async (req) => {
    await requireAdmin(req);
    return {
      coupons: await sql`
        SELECT c.*, coalesce(r.discount_total, 0)::bigint AS discount_total_paise
        FROM coupons c
        LEFT JOIN (SELECT code, sum(discount_paise) AS discount_total FROM coupon_redemptions GROUP BY code) r
          ON r.code = c.code
        ORDER BY c.created_at DESC`,
    };
  });

  app.post('/v1/admin/coupons', async (req) => {
    const admin = await requireAdmin(req);
    const c = parseCoupon(req.body, true);
    const r = await sql`
      INSERT INTO coupons (code, kind, value, active, max_uses, once_per_user, plan_ids, expires_at, note, created_at)
      VALUES (${c.code!}, ${c.kind!}, ${c.value!}, ${c.active ?? true}, ${c.max_uses ?? null}, ${c.once_per_user ?? true},
              ${c.plan_ids ?? null}, ${c.expires_at ?? null}, ${c.note ?? null}, ${Date.now()})
      ON CONFLICT (code) DO NOTHING`;
    if (!r.count) throw new HttpError(409, 'exists', `A coupon called ${c.code} already exists.`);
    await audit(admin, 'coupon_create', c.code!, c);
    return { ok: true };
  });

  app.post('/v1/admin/coupons/:code', async (req) => {
    const admin = await requireAdmin(req);
    const code = normalizeCode((req.params as any)?.code);
    const c = parseCoupon(req.body, false);
    const [existing] = await sql`SELECT code FROM coupons WHERE code = ${code}`;
    if (!existing) throw new HttpError(404, 'not_found', 'Coupon not found.');
    const set: Record<string, unknown> = {};
    for (const k of ['kind', 'value', 'active', 'max_uses', 'once_per_user', 'plan_ids', 'expires_at', 'note'] as const) {
      if (c[k] !== undefined) set[k] = c[k];
    }
    if (Object.keys(set).length) await sql`UPDATE coupons SET ${sql(set)} WHERE code = ${code}`;
    await audit(admin, 'coupon_update', code, set);
    return { ok: true };
  });

  app.delete('/v1/admin/coupons/:code', async (req) => {
    const admin = await requireAdmin(req);
    const code = normalizeCode((req.params as any)?.code);
    const r = await sql`DELETE FROM coupons WHERE code = ${code}`;
    if (!r.count) throw new HttpError(404, 'not_found', 'Coupon not found.');
    await audit(admin, 'coupon_delete', code);
    return { ok: true };
  });

  // Kept for scripts: grant by email.
  app.post('/v1/admin/grant', async (req) => {
    const admin = await requireAdmin(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const target = await getUserByEmail(str(b.email, 200));
    const seconds = Math.trunc(Number(b.seconds));
    if (!target) throw new HttpError(404, 'not_found', 'No user with that email.');
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 1000 * 3600) throw new HttpError(400, 'bad_request', 'Bad seconds.');
    await credit(target.id, seconds, 'admin', `${admin.id}:${Date.now()}`, str(b.note, 200) || undefined);
    await audit(admin, 'add_time', target.email, { seconds });
    return { ok: true, balance_seconds: await effectiveBalance(target.id) };
  });
}
