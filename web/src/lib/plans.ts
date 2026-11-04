import type { Plan, PlansResponse } from './api';

/** Mirrors the plan table in docs/ARCHITECTURE.md — shown if the API is unreachable. */
export const FALLBACK_PLANS: PlansResponse = {
  trial_seconds: 20 * 60,
  validity_days: 180,
  plans: [
    {
      id: 'starter',
      name: 'Starter',
      price_inr: 499,
      seconds: 2 * 3600,
      tagline: 'One big interview or a day of calls.',
      badge: null
    },
    {
      id: 'pro',
      name: 'Pro',
      price_inr: 1499,
      seconds: 7 * 3600,
      tagline: 'A full week of meetings and prep.',
      badge: 'Most popular'
    },
    {
      id: 'max',
      name: 'Max',
      price_inr: 3499,
      seconds: 20 * 3600,
      tagline: 'For sales teams and heavy users.',
      badge: 'Best value'
    }
  ]
};

/** Paid plans only — the trial is rendered separately from `trial_seconds`. */
export function paidPlans(p: PlansResponse): Plan[] {
  return p.plans.filter((x) => x.id !== 'trial' && x.price_inr > 0);
}

export function perHour(plan: Plan): number {
  return Math.round(plan.price_inr / (plan.seconds / 3600));
}
