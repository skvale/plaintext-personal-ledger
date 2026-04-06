import { json } from '@sveltejs/kit';
import { writeFile } from 'node:fs/promises';
import { getSettings, SETTINGS_FILE } from '$lib/hledger.server.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
  const { id, tipKey } = await request.json();

  const settings = await getSettings();

  // Dismiss a single tip within a tour
  if (tipKey && typeof tipKey === 'string') {
    if (!settings.learning.dismissedTips) settings.learning.dismissedTips = [];
    if (!settings.learning.dismissedTips.includes(tipKey)) {
      settings.learning.dismissedTips.push(tipKey);
      await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
    }
    return json({ ok: true });
  }

  // Dismiss entire tour (legacy)
  if (!id || typeof id !== 'string') return json({ error: 'Missing id' }, { status: 400 });
  if (!settings.learning.completedTours.includes(id)) {
    settings.learning.completedTours.push(id);
    await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  }

  return json({ ok: true });
};

export const DELETE: RequestHandler = async () => {
  const settings = await getSettings();
  settings.learning.completedTours = [];
  settings.learning.dismissedTips = [];
  await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  return json({ ok: true });
};
