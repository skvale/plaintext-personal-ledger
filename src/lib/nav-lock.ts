const TTL_MS = 60_000;

let acquiredAt = 0;

/**
 * Suppresses SSE-driven invalidateAll() while a form action is in flight.
 *
 * Saving a transaction writes to the journal, which makes the server broadcast
 * `journal-changed`. That lands while the action's redirect `goto()` is still
 * navigating, and SvelteKit's router lets the later navigation win — so the
 * invalidation (which targets the *current* page) cancelled the redirect and the
 * user was stranded back on the form with no error shown.
 *
 * Suppressing is safe: the redirect still loads fresh data for the destination
 * page, so nothing ends up stale.
 *
 * The lock expires on a deadline rather than needing a matching release, so an
 * aborted or destroyed request can never leave live-refresh disabled forever.
 */
export function acquireSaveLock(): void {
  acquiredAt = Date.now();
}

export function releaseSaveLock(): void {
  acquiredAt = 0;
}

export function isSaveLocked(): boolean {
  return acquiredAt !== 0 && Date.now() - acquiredAt < TTL_MS;
}
