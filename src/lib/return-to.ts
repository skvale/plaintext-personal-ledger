const FALLBACK_RETURN = '/register';

/**
 * Accepts only same-origin relative paths, so a `ref`/`from` value read from the
 * query string can never bounce the user off-site — and always resolves to a
 * route `goto()` is willing to navigate to.
 *
 * @param raw the untrusted value
 * @param self a path to reject as a return target (bouncing back to the page
 *   that issued the redirect just traps the user in a loop)
 */
export function safeReturnTo(raw: string | null | undefined, self?: string): string {
  if (!raw) return FALLBACK_RETURN;
  // Reject anything absolute or protocol-relative before parsing.
  if (!raw.startsWith('/') || raw.startsWith('//')) return FALLBACK_RETURN;
  let parsed: URL;
  try {
    parsed = new URL(raw, 'http://local.invalid');
  } catch {
    return FALLBACK_RETURN;
  }
  if (parsed.origin !== 'http://local.invalid') return FALLBACK_RETURN;
  const path = parsed.pathname + parsed.search;
  if (self && path === self) return FALLBACK_RETURN;
  return path;
}