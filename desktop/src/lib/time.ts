/** Time left, with seconds: "12 min 10 sec", or "2h 41m 10s" once there's an hour or more. */
export function formatLeft(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`;
  if (m > 0) return `${m} min ${String(sec).padStart(2, '0')} sec`;
  return `${sec} sec`;
}
