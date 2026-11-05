/** Time left with seconds: "3h 05m 10s", or "12 min 10 sec" under an hour. */
export function formatBalance(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${sec}s`;
  return `${m} min ${sec} sec`;
}

/** "2 hours", "20 min", "1h 30m" — for plan sizes and usage rows. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return h === 1 ? '1 hour' : `${h} hours`;
  return `${h}h ${m}m`;
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
});

export function formatINR(rupees: number): string {
  return inr.format(rupees);
}

const inrPrecise = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

/** AI cost (USD micro-dollars) in rupees: paise precision below ₹100, whole rupees above. */
export function formatCostINR(micros: number, usdInr: number): string {
  const rupees = (micros / 1e6) * usdInr;
  return Math.abs(rupees) < 100 ? inrPrecise.format(rupees) : inr.format(rupees);
}

/** AI cost (USD micro-dollars) in dollars: "$0.0042", "$12.40". */
export function formatUSD(micros: number): string {
  const usd = micros / 1e6;
  if (usd === 0) return '$0';
  return `$${usd.toFixed(Math.abs(usd) < 1 ? 4 : 2)}`;
}

/** Accepts unix seconds or milliseconds. */
export function toDate(ts: number | null | undefined): Date | null {
  if (ts === null || ts === undefined || !Number.isFinite(ts) || ts <= 0) return null;
  return new Date(ts < 1e12 ? ts * 1000 : ts);
}

export function formatDate(ts: number | null | undefined): string {
  const d = toDate(ts);
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(ts: number | null | undefined): string {
  const d = toDate(ts);
  if (!d) return '—';
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit'
  });
}

/** Only allow same-origin relative paths as post-login redirects. */
export function safeNext(next: string | null | undefined, fallback = '/dashboard'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}
