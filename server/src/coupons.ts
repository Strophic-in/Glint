/** Coupon codes: percent or flat ₹ off, optionally per plan, capped, once per user, expiring. */
import type { Plan } from './billing.js';
import { sql } from './db.js';
import { HttpError, str } from './util.js';

export interface Coupon {
  code: string;
  kind: 'percent' | 'flat';
  value: number;
  active: boolean;
  max_uses: number | null;
  uses: number;
  once_per_user: boolean;
  plan_ids: string[] | null;
  expires_at: number | null;
  note: string | null;
  created_at: number;
}

export const MIN_CHARGE_PAISE = 100; // Razorpay's minimum order is ₹1

export function normalizeCode(v: unknown) {
  const code = str(v, 40).trim().toUpperCase();
  return /^[A-Z0-9_-]{3,32}$/.test(code) ? code : '';
}

export function couponLabel(c: Pick<Coupon, 'kind' | 'value'>) {
  return c.kind === 'percent' ? `${c.value}% off` : `₹${Math.round(c.value / 100)} off`;
}

/** Look up a coupon and check it can be used by this user right now (plan checks are per plan). */
export async function usableCoupon(codeInput: unknown, userId: string): Promise<Coupon> {
  const code = normalizeCode(codeInput);
  const invalid = new HttpError(400, 'bad_coupon', "That coupon code isn't valid.");
  if (!code) throw invalid;
  const [c] = await sql<Coupon[]>`SELECT * FROM coupons WHERE code = ${code}`;
  if (!c || !c.active) throw invalid;
  if (c.expires_at && c.expires_at < Date.now()) throw new HttpError(400, 'bad_coupon', 'This coupon has expired.');
  if (c.max_uses !== null && c.uses >= c.max_uses) {
    throw new HttpError(400, 'bad_coupon', 'This coupon has been fully used.');
  }
  if (c.once_per_user) {
    const [used] = await sql`SELECT 1 FROM coupon_redemptions WHERE code = ${code} AND user_id = ${userId} LIMIT 1`;
    if (used) throw new HttpError(400, 'bad_coupon', "You've already used this coupon.");
  }
  return c;
}

/** Price of a plan after the coupon. `eligible` is false when the coupon doesn't cover this plan. */
export function applyCoupon(c: Coupon, plan: Plan) {
  const price = plan.price_inr * 100;
  if (c.plan_ids?.length && !c.plan_ids.includes(plan.id)) {
    return { plan_id: plan.id, eligible: false, discount_paise: 0, final_paise: price };
  }
  let discount = c.kind === 'percent' ? Math.round((price * c.value) / 100) : Math.min(c.value, price);
  let final = price - discount;
  // Razorpay can't charge less than ₹1: anything between ₹0 and ₹1 rounds up to ₹1.
  if (final > 0 && final < MIN_CHARGE_PAISE) {
    final = MIN_CHARGE_PAISE;
    discount = price - final;
  }
  return { plan_id: plan.id, eligible: true, discount_paise: discount, final_paise: final };
}

/** Record a paid order's coupon use exactly once (webhook and client verify may both arrive). */
export async function recordRedemption(code: string, userId: string, orderId: string, discountPaise: number) {
  await sql.begin(async (tx) => {
    const r = await tx`
      INSERT INTO coupon_redemptions (code, user_id, order_id, discount_paise, created_at)
      VALUES (${code}, ${userId}, ${orderId}, ${discountPaise}, ${Date.now()})
      ON CONFLICT (order_id) DO NOTHING`;
    if (r.count) await tx`UPDATE coupons SET uses = uses + 1 WHERE code = ${code}`;
  });
}
