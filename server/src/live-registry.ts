/** One live listening session per account. A new session replaces the old one. */
export type CloseReason = 'replaced' | 'shutdown' | 'admin' | 'blocked';

export interface LiveHandle {
  close(reason?: CloseReason): void;
}

interface Entry {
  handle: LiveHandle;
  email: string;
  startedAt: number;
}

const live = new Map<string, Entry>();

export const isLive = (userId: string) => live.has(userId);

export function claimLive(userId: string, email: string, handle: LiveHandle) {
  const prev = live.get(userId);
  live.set(userId, { handle, email, startedAt: Date.now() });
  prev?.handle.close('replaced');
}

export function releaseLive(userId: string, handle: LiveHandle) {
  if (live.get(userId)?.handle === handle) live.delete(userId);
}

export function closeLive(userId: string, reason: CloseReason) {
  live.get(userId)?.handle.close(reason);
}

export function listLive() {
  return [...live.entries()].map(([userId, e]) => ({ user_id: userId, email: e.email, started_at: e.startedAt }));
}

export function closeAllLive() {
  for (const e of [...live.values()]) e.handle.close('shutdown');
}
