import { invalidateCache } from '#lib/hledger.server.js';

export function POST() {
  invalidateCache();
  return Response.json({ ok: true });
}
