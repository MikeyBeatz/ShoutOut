// Product decision R4: fixed lifetime from opening/refresh, never extended by a page.
export const feedSessionLifetimeMillis = 60 * 60 * 1000;

export class FeedSessionExpired extends Error {
  constructor() { super('feed-session-expired'); this.name = 'FeedSessionExpired'; }
}

export function sessionDeadline(clock) {
  const started = clock();
  if (!Number.isFinite(started)) throw new Error('invalid-feed-clock');
  return () => {
    const elapsed = clock() - started;
    if (!Number.isFinite(elapsed) || elapsed < 0) throw new Error('invalid-feed-clock');
    if (elapsed >= feedSessionLifetimeMillis) throw new FeedSessionExpired();
  };
}
