/** Self-service account management (website): profile, signed-in devices, delete account. */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate } from './auth.js';
import { sql } from './db.js';
import { closeLive } from './live-registry.js';
import { HttpError, sha256, str } from './util.js';

const currentHash = (req: FastifyRequest) => sha256((req.headers.authorization ?? '').slice(7).trim());

export async function accountRoutes(app: FastifyInstance) {
  app.get('/v1/account/sessions', async (req) => {
    const user = await authenticate(req);
    const current = currentHash(req);
    const rows = await sql<{ token_hash: string; kind: string; created_at: number; last_used_at: number; user_agent: string | null }[]>`
      SELECT token_hash, kind, created_at, last_used_at, user_agent FROM sessions
      WHERE user_id = ${user.id} AND expires_at > ${Date.now()} ORDER BY last_used_at DESC`;
    // The id is the token's hash: safe to show, it can't be turned back into a token.
    return { sessions: rows.map(({ token_hash, ...s }) => ({ id: token_hash, current: token_hash === current, ...s })) };
  });

  // { id } signs out one device; { all_others: true } every device except this one.
  app.post('/v1/account/sessions/revoke', async (req) => {
    const user = await authenticate(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const current = currentHash(req);
    if (b.all_others === true) {
      const r = await sql`DELETE FROM sessions WHERE user_id = ${user.id} AND token_hash <> ${current}`;
      closeLive(user.id, 'admin');
      return { ok: true, revoked: r.count };
    }
    const id = str(b.id, 64);
    if (!/^[0-9a-f]{64}$/.test(id)) throw new HttpError(400, 'bad_request', 'Missing device id.');
    const r = await sql`DELETE FROM sessions WHERE user_id = ${user.id} AND token_hash = ${id}`;
    return { ok: true, revoked: r.count };
  });

  app.post('/v1/account/profile', async (req) => {
    const user = await authenticate(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const name = str(b.name, 80).trim();
    if (b.name !== undefined && name.length < 1) throw new HttpError(400, 'bad_request', 'Enter a name.');
    let phone: string | null | undefined;
    if (b.phone !== undefined) {
      const d = str(b.phone, 30).replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
      if (d && !/^[6-9]\d{9}$/.test(d)) throw new HttpError(400, 'bad_request', 'Enter a valid 10-digit mobile number.');
      phone = d || null;
    }
    await sql`
      UPDATE users SET
        name = ${b.name !== undefined ? name : user.name},
        phone = ${phone !== undefined ? phone : sql`phone`}
      WHERE id = ${user.id}`;
    return { ok: true };
  });

  // Deleting anonymises the account: personal data goes, payment records stay (tax law).
  app.post('/v1/account/delete', async (req) => {
    const user = await authenticate(req);
    const confirm = str((req.body as any)?.confirm_email, 200).trim().toLowerCase();
    if (confirm !== user.email.toLowerCase()) {
      throw new HttpError(400, 'bad_request', 'Type your email address exactly to confirm.');
    }
    closeLive(user.id, 'admin');
    await sql.begin(async (tx) => {
      await tx`DELETE FROM sessions WHERE user_id = ${user.id}`;
      await tx`DELETE FROM device_codes WHERE user_id = ${user.id}`;
      await tx`
        UPDATE users SET email = ${`deleted+${user.id}@deleted.invalid`}, name = NULL, picture = NULL,
          google_sub = NULL, phone = NULL, balance_seconds = 0, blocked = true,
          blocked_reason = 'Account deleted', deleted_at = ${Date.now()}
        WHERE id = ${user.id}`;
    });
    return { ok: true };
  });
}
