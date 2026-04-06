import { invalidateCache } from '$lib/hledger.server.js';
import { json } from '@sveltejs/kit';

export function POST() {
  invalidateCache();
  return json({ ok: true });
}
