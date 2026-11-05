import { API_URL } from './config';

export type User = {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
};

export type Me = {
  user: User & { phone?: string | null };
  balance_seconds: number;
  expires_at: number | null;
  live: boolean;
  trial_seconds: number;
  is_admin?: boolean;
  maintenance?: string | null;
};

// ── Admin ──────────────────────────────────────────────
export type AdminStats = {
  users_total: number;
  users_24h: number;
  users_7d: number;
  active_7d: number;
  paying_users: number;
  blocked_users: number;
  revenue_total_paise: number;
  revenue_30d_paise: number;
  orders_30d: number;
  live_now: number;
  live_seconds_24h: number;
  live_seconds_7d: number;
  answers_24h: number;
  input_tokens_7d: number;
  output_tokens_7d: number;
  balance_outstanding_seconds: number;
  daily: { day: string; signups: number; revenue_paise: number; live_seconds: number; answers: number; cost_micros: number }[];
  cost: {
    usd_inr: number;
    /** AI cost in USD micro-dollars; stt = live transcription, answer = AI answers. */
    windows: { id: '24h' | '7d' | '30d' | 'all'; label: string; stt_micros: number; answer_micros: number; revenue_paise: number }[];
  };
};

export type AdminUserSort = 'recent' | 'cost' | 'usage' | 'paid';

export type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  created_at: number;
  last_seen_at: number | null;
  balance_seconds: number;
  expires_at: number | null;
  blocked: number;
  blocked_reason: string | null;
  paid_paise: number;
  used_seconds: number;
  answers: number;
  cost_micros: number;
  live: boolean;
};

export type AdminUserDetail = {
  user: User & {
    created_at: number;
    last_seen_at: number | null;
    balance_seconds: number;
    expires_at: number | null;
    blocked: boolean;
    blocked_reason: string | null;
    admin: boolean;
  };
  live: boolean;
  usd_inr: number;
  totals: {
    sessions: number;
    live_seconds: number;
    answers: number;
    answer_seconds: number;
    audio_ms: number;
    input_tokens: number;
    cached_tokens: number;
    output_tokens: number;
    stt_cost_micros: number;
    answer_cost_micros: number;
    paid_paise: number;
  };
  usage: (UsageRow & {
    model: string | null;
    input_tokens: number | null;
    cached_tokens: number | null;
    output_tokens: number | null;
    audio_ms: number | null;
    service_tier: string | null;
    cost_micros: number | null;
  })[];
  orders: (OrderRow & { payment_id: string | null; paid_at: number | null })[];
  credits: { seconds: number; reason: string; note: string | null; created_at: number }[];
  sessions: { kind: string; created_at: number; last_used_at: number; user_agent: string | null }[];
};

export type AdminOrder = OrderRow & { payment_id: string | null; paid_at: number | null; email: string; user_id: string };

export type RuntimeConfig = {
  maintenance: boolean;
  maintenance_message: string;
  signups_open: boolean;
  trial_seconds: number;
  answer_seconds: number;
  idle_timeout_s: number;
  allowed_models: string[];
  default_model: string;
  usd_inr: number;
};

export type CatalogModel = { id: string; label: string; allowed: boolean; accessible: boolean };

export type AdminLogRow = { action: string; target: string | null; detail: string | null; created_at: number; admin: string | null };

export type Plan = {
  id: string;
  name: string;
  price_inr: number;
  seconds: number;
  tagline: string;
  badge: string | null;
};

export type PlansResponse = {
  plans: Plan[];
  trial_seconds: number;
  validity_days: number;
};

export type UsageRow = {
  kind: string;
  seconds: number;
  started_at: number;
  ended_at: number | null;
};

export type OrderRow = {
  id: string;
  plan_id: string;
  amount_paise: number;
  seconds: number;
  status: string;
  created_at: number;
};

export type UsageResponse = { usage: UsageRow[]; orders: OrderRow[] };

export type AuthResponse = { token: string; user: User };

/** A Cashfree checkout to open, or `free: true` when a 100% coupon covered it. */
export type OrderResponse = {
  order_id: string;
  plan: Plan;
  free?: boolean;
  balance_seconds?: number;
  payment_session_id?: string;
  mode?: 'sandbox' | 'production';
  amount_paise?: number;
  discount_paise?: number;
};

export type VerifyResponse = { ok: boolean; status: string; balance_seconds: number };

export type CouponQuote = {
  code: string;
  label: string;
  plans: { plan_id: string; eligible: boolean; discount_paise: number; final_paise: number }[];
};

export type DeviceInfo = { user_code: string; expires_in: number };

export type AccountSession = {
  id: string;
  current: boolean;
  kind: string;
  created_at: number;
  last_used_at: number;
  user_agent: string | null;
};

export type AdminCoupon = {
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
  discount_total_paise: number;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

const TOKEN_KEY = 'glint_token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable (private mode) — session lasts for this tab only */
  }
}

const FRIENDLY: Record<string, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  no_balance: 'You are out of hours. Top up to keep going.',
  rate_limited: 'Too many requests. Please wait a moment.',
  not_found: 'Not found.',
  upstream: 'A service we depend on is having trouble. Please try again.',
  network: 'Could not reach the Glint server. Check your connection.'
};

async function request<T>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.auth !== false) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    });
  } catch {
    throw new ApiError(0, 'network', FRIENDLY.network);
  }

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; message?: string };
    const code = d.error ?? `http_${res.status}`;
    throw new ApiError(res.status, code, d.message ?? FRIENDLY[code] ?? `Request failed (${res.status}).`);
  }
  return data as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}

export const api = {
  plans: () => request<PlansResponse>('/v1/plans', { auth: false }),
  me: () => request<Me>('/v1/me'),
  usage: () => request<UsageResponse>('/v1/usage'),

  loginGoogle: (credential: string) =>
    request<AuthResponse>('/v1/auth/google', { body: { credential }, auth: false }),
  loginDev: (email: string) => request<AuthResponse>('/v1/auth/dev', { body: { email }, auth: false }),
  logout: () => request<{ ok: true }>('/v1/auth/logout', { method: 'POST', body: {} }),

  deviceInfo: (userCode: string) =>
    request<DeviceInfo>(`/v1/auth/device/info?user_code=${encodeURIComponent(userCode)}`, { auth: false }),
  deviceApprove: (userCode: string) =>
    request<{ ok: true }>('/v1/auth/device/approve', { body: { user_code: userCode } }),

  createOrder: (planId: string, opts: { coupon?: string; phone?: string } = {}) =>
    request<OrderResponse>('/v1/billing/order', { body: { plan_id: planId, ...opts } }),
  verifyPayment: (orderId: string) => request<VerifyResponse>('/v1/billing/verify', { body: { order_id: orderId } }),
  previewCoupon: (code: string) => request<CouponQuote>('/v1/billing/coupon', { body: { code } }),

  account: {
    sessions: () => request<{ sessions: AccountSession[] }>('/v1/account/sessions'),
    revoke: (id: string) => request<{ ok: true }>('/v1/account/sessions/revoke', { body: { id } }),
    revokeOthers: () =>
      request<{ ok: true; revoked: number }>('/v1/account/sessions/revoke', { body: { all_others: true } }),
    profile: (p: { name?: string; phone?: string }) => request<{ ok: true }>('/v1/account/profile', { body: p }),
    remove: (confirmEmail: string) =>
      request<{ ok: true }>('/v1/account/delete', { body: { confirm_email: confirmEmail } })
  },

  admin: {
    stats: () => request<AdminStats>('/v1/admin/stats'),
    users: (q: string, filter: string, offset = 0, sort: AdminUserSort = 'recent') =>
      request<{ users: AdminUser[]; total: number; usd_inr: number }>(
        `/v1/admin/users?q=${encodeURIComponent(q)}&filter=${encodeURIComponent(filter)}&sort=${sort}&offset=${offset}&limit=50`
      ),
    user: (id: string) => request<AdminUserDetail>(`/v1/admin/users/${encodeURIComponent(id)}`),
    block: (id: string, reason: string) =>
      request<{ ok: true }>(`/v1/admin/users/${encodeURIComponent(id)}/block`, { body: { reason } }),
    unblock: (id: string) => request<{ ok: true }>(`/v1/admin/users/${encodeURIComponent(id)}/unblock`, { body: {} }),
    time: (id: string, seconds: number, note: string) =>
      request<{ ok: true; balance_seconds: number; removed_seconds?: number }>(`/v1/admin/users/${encodeURIComponent(id)}/time`, {
        body: { seconds, note }
      }),
    removeAllTime: (id: string, note: string) =>
      request<{ ok: true; balance_seconds: number; removed_seconds: number }>(`/v1/admin/users/${encodeURIComponent(id)}/time`, {
        body: { all: true, note }
      }),
    logout: (id: string) => request<{ ok: true }>(`/v1/admin/users/${encodeURIComponent(id)}/logout`, { body: {} }),
    live: () => request<{ live: { user_id: string; email: string; started_at: number }[] }>('/v1/admin/live'),
    endLive: (id: string) => request<{ ok: true }>(`/v1/admin/live/${encodeURIComponent(id)}/end`, { body: {} }),
    orders: () => request<{ orders: AdminOrder[] }>('/v1/admin/orders'),
    config: () => request<{ config: RuntimeConfig; models: CatalogModel[] }>('/v1/admin/config'),
    setConfig: (patch: Partial<RuntimeConfig>) =>
      request<{ config: RuntimeConfig; models: CatalogModel[] }>('/v1/admin/config', { body: patch }),
    log: () => request<{ log: AdminLogRow[] }>('/v1/admin/log'),
    coupons: () => request<{ coupons: AdminCoupon[] }>('/v1/admin/coupons'),
    createCoupon: (c: Partial<AdminCoupon>) => request<{ ok: true }>('/v1/admin/coupons', { body: c }),
    updateCoupon: (code: string, patch: Partial<AdminCoupon>) =>
      request<{ ok: true }>(`/v1/admin/coupons/${encodeURIComponent(code)}`, { body: patch }),
    deleteCoupon: (code: string) =>
      request<{ ok: true }>(`/v1/admin/coupons/${encodeURIComponent(code)}`, { method: 'DELETE' })
  }
};
