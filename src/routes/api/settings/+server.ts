import { json } from '@sveltejs/kit';
import { writeFile } from 'node:fs/promises';
import { getSettings, SETTINGS_FILE } from '$lib/hledger.server.js';
import { mergeSettings } from '$lib/settings.js';
import type { RequestHandler } from './$types.js';

/** PATCH /api/settings — deep-merge a partial settings object into settings.json */
export const PATCH: RequestHandler = async ({ request }) => {
  const patch = await request.json();

  const current = await getSettings();
  const updated = mergeSettings({ ...current, ...patch });

  await writeFile(SETTINGS_FILE, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
  return json({ ok: true });
};
