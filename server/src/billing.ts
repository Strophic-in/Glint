/**
 * Billing with Cashfree PG: hour packs, coupons, checkout, verification and webhooks.
 * Hours are credited only after the server itself confirms the order is PAID with Cashfree,
 * whichever of the browser (/verify) or the webhook gets there first. Crediting is idempotent.
 */
import type { FastifyInstance } from 'fastify';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { authenticate } from './auth.js';
import { config } from './config.js';
import { applyCoupon, couponLabel, recordRedemption, usableCoupon, type Coupon } from './coupons.js';
import { credit, effectiveBalance, sql, type UserRow } from './db.js';
import { HttpError, rateLimiter, str } from './util.js';

export interface Plan {
  id: string;
  name: string;
  price_inr: number;
  seconds: number;
  tagline: string;
  badge: string | null;
}

const H = 3600;
export const PLANS: Plan[] = [
  { id: 'starter', name: 'Starter', price_inr: 499, seconds: 2 * H, tagline: 'One big interview or client call', badge: null },
  { id: 'pro', name: 'Pro', price_inr: 1499, seconds: 7 * H, tagline: 'A full week of calls', badge: 'Most popular' },
  { id: 'max', name: 'Max', price_inr: 3499, seconds: 20 * H, tagline: 'For people who live on calls', badge: 'Best value' },
];

interface OrderRow {
  id: string;
  user_id: string;
  plan_id: string;
  amount_paise: number;
  seconds: number;
  status: string;
  payment_id: string | null;
  coupon_code: string | null;
  discount_paise: number;
}

interface CashfreeOrder {
  order_id: string;
  cf_order_id?: string | number;
  order_amount: number;
  order_status: 'ACTIVE' | 'PAID' | 'EXPIRED' | 'TERMINATED' | 'TERMINATION_REQUESTED';
  payment_session_id?: string;
}

const cashfreeReady = () => !!(config.cashfree.appId && config.cashfree.secretKey);
const cashfreeBase = () =>
  config.cashfree.baseUrl || (config.cashfree.env === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg');

async function cashfree<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${cashfreeBase()}${path}`, {
    method,
    headers: {
      'x-client-id': config.cashfree.appId,
      'x-client-secret': config.cashfree.secretKey,
      'x-api-version': config.cashfree.apiVersion,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) {
    throw new HttpError(502, 'upstream', `Payment provider error (${res.status}): ${str(data.message, 200) || 'unknown'}`);
  }
  return data as T;
}

/** 10-digit Indian mobile from user input ("+91 98765 43210", "09876543210", ...). */
function normalizePhone(v: unknown) {
  let d = str(v, 30).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : '';
}

/** Mark the order paid and credit its hours, exactly once (webhook and /verify may race). */
async function fulfil(orderId: string, paymentRef: string): Promise<OrderRow | undefined> {
  const [order] = await sql<OrderRow[]>`SELECT * FROM orders WHERE id = ${orderId}`;
  if (!order) return undefined;
  await sql`UPDATE orders SET status = 'paid', payment_id = ${paymentRef}, paid_at = ${Date.now()}
            WHERE id = ${orderId} AND status <> 'paid'`;
  await credit(order.user_id, order.seconds, 'order', orderId, `${order.plan_id} · ${paymentRef}`);
  if (order.coupon_code) await recordRedemption(order.coupon_code, order.user_id, orderId, order.discount_paise);
  return order;
}

/** Ask Cashfree for the order's real state; credit only if PAID for the amount we asked. */
async function confirmWithCashfree(order: OrderRow, log?: { error: (o: object, m: string) => void }): Promise<string> {
  if (order.status === 'paid') return 'paid';
  const cf = await cashfree<CashfreeOrder>('GET', `/orders/${encodeURIComponent(order.id)}`);
  if (cf.order_status !== 'PAID') return cf.order_status.toLowerCase();
  if (Math.round(cf.order_amount * 100) !== order.amount_paise) {
    log?.error({ order: order.id, expected: order.amount_paise, paid: cf.order_amount }, 'PAID amount does not match order');
    return 'amount_mismatch';
  }
  await fulfil(order.id, `cf_${cf.cf_order_id ?? order.id}`);
  return 'paid';
}

function verifyWebhook(raw: string, timestamp: string, signature: string) {
  if (!raw || !timestamp || !signature || !config.cashfree.secretKey) return false;
  const expected = createHmac('sha256', config.cashfree.secretKey).update(timestamp + raw).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function billingRoutes(app: FastifyInstance) {
  const orderLimit = rateLimiter(10, 60_000);
  const couponLimit = rateLimiter(20, 60_000);

  app.get('/v1/plans', async () => ({
    plans: PLANS,
    trial_seconds: config.trialSeconds,
    validity_days: config.validityDays,
    currency: 'INR',
    provider: 'cashfree',
    mode: config.cashfree.env,
  }));

  // Preview a coupon against every plan (for the price cards).
  app.post('/v1/billing/coupon', async (req) => {
    const user = await authenticate(req);
    couponLimit(user.id);
    const coupon = await usableCoupon((req.body as any)?.code, user.id);
    const plans = PLANS.map((p) => applyCoupon(coupon, p));
    if (!plans.some((p) => p.eligible)) throw new HttpError(400, 'bad_coupon', "This coupon doesn't apply to any plan.");
    return { code: coupon.code, label: couponLabel(coupon), plans };
  });

  app.post('/v1/billing/order', async (req) => {
    const user = await authenticate(req);
    orderLimit(user.id);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const plan = PLANS.find((p) => p.id === str(b.plan_id, 40));
    if (!plan) throw new HttpError(400, 'bad_request', 'Unknown plan.');

    let coupon: Coupon | null = null;
    let price = { discount_paise: 0, final_paise: plan.price_inr * 100 };
    if (str(b.coupon, 40).trim()) {
      coupon = await usableCoupon(b.coupon, user.id);
      const applied = applyCoupon(coupon, plan);
      if (!applied.eligible) throw new HttpError(400, 'bad_coupon', `This coupon doesn't apply to the ${plan.name} plan.`);
      price = applied;
    }

    const orderId = `glint_${Date.now().toString(36)}_${randomBytes(5).toString('hex')}`;
    const insert = (status: string) => sql`
      INSERT INTO orders (id, user_id, plan_id, amount_paise, seconds, status, created_at, coupon_code, discount_paise)
      VALUES (${orderId}, ${user.id}, ${plan.id}, ${price.final_paise}, ${plan.seconds}, ${status}, ${Date.now()},
              ${coupon?.code ?? null}, ${price.discount_paise})`;

    // 100% off: no payment needed.
    if (price.final_paise === 0) {
      await insert('created');
      await fulfil(orderId, 'coupon');
      return { free: true, order_id: orderId, plan, balance_seconds: await effectiveBalance(user.id) };
    }

    if (!cashfreeReady()) throw new HttpError(503, 'not_configured', 'Payments are not configured yet.');
    const phone = normalizePhone(b.phone) || (await savedPhone(user));
    if (!phone) throw new HttpError(400, 'phone_required', 'Enter your 10-digit mobile number for the payment receipt.');
    if (normalizePhone(b.phone)) await sql`UPDATE users SET phone = ${phone} WHERE id = ${user.id}`;

    const notify = config.publicApiUrl.startsWith('https://') ? `${config.publicApiUrl}/v1/billing/webhook` : undefined;
    const cf = await cashfree<CashfreeOrder>('POST', '/orders', {
      order_id: orderId,
      order_amount: price.final_paise / 100,
      order_currency: 'INR',
      customer_details: {
        customer_id: `u_${user.id.replace(/-/g, '')}`,
        customer_phone: phone,
        customer_email: user.email,
        ...(user.name && user.name.length >= 3 ? { customer_name: user.name.slice(0, 100) } : {}),
      },
      order_meta: {
        return_url: `${config.webUrl}/dashboard?order_id={order_id}`,
        ...(notify ? { notify_url: notify } : {}),
      },
      order_note: `${config.brand} ${plan.name}${coupon ? ` (${coupon.code})` : ''}`,
    });
    if (!cf.payment_session_id) throw new HttpError(502, 'upstream', 'Payment provider did not start a session.');
    await insert('created');
    return {
      order_id: orderId,
      payment_session_id: cf.payment_session_id,
      mode: config.cashfree.env,
      amount_paise: price.final_paise,
      discount_paise: price.discount_paise,
      plan,
    };
  });

  // Called by the website after checkout closes (or on return from a redirect).
  app.post('/v1/billing/verify', async (req) => {
    const user = await authenticate(req);
    const orderId = str((req.body as any)?.order_id, 60);
    const [order] = orderId ? await sql<OrderRow[]>`SELECT * FROM orders WHERE id = ${orderId}` : [];
    if (!order || order.user_id !== user.id) throw new HttpError(404, 'not_found', 'Order not found.');
    const status = await confirmWithCashfree(order, req.log);
    return { ok: status === 'paid', status, balance_seconds: await effectiveBalance(user.id) };
  });

  // Cashfree webhook: signature = base64(HMAC-SHA256(timestamp + rawBody, secret key)).
  app.post('/v1/billing/webhook', async (req, reply) => {
    const raw = (req as any).rawBody as string | undefined;
    const ok = verifyWebhook(raw ?? '', String(req.headers['x-webhook-timestamp'] ?? ''), String(req.headers['x-webhook-signature'] ?? ''));
    if (!ok) return reply.code(400).send({ error: 'bad_signature' });
    const orderId = str((req.body as any)?.data?.order?.order_id, 60);
    if (orderId) {
      const [order] = await sql<OrderRow[]>`SELECT * FROM orders WHERE id = ${orderId}`;
      if (order) await confirmWithCashfree(order, req.log);
      else req.log.warn({ order: orderId }, 'webhook for unknown order');
    }
    return { ok: true };
  });
}

async function savedPhone(user: UserRow) {
  const [row] = await sql<{ phone: string | null }[]>`SELECT phone FROM users WHERE id = ${user.id}`;
  return row?.phone ?? '';
}
