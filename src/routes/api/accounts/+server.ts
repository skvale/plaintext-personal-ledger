import { json } from '@sveltejs/kit';
import { addAccountDeclaration } from '$lib/hledger.server.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
  const { name } = await request.json();
  if (!name || typeof name !== 'string') return json({ error: 'Name required' }, { status: 400 });
  const result = await addAccountDeclaration(name.trim());
  if (!result.success) return json({ error: result.error }, { status: 422 });
  return json({ ok: true });
};
