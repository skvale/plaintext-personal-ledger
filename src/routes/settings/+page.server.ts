import { readFile, writeFile } from 'node:fs/promises';
import { fail } from '@sveltejs/kit';
import { SETTINGS_FILE, getSettings } from '$lib/hledger.server.js';
import type { Actions, PageServerLoad } from './$types.js';
import type { Settings, SidebarItemConfig } from '$lib/settings.js';

export const load: PageServerLoad = async () => {
  const settings = await getSettings();
  const raw = await readFile(SETTINGS_FILE, 'utf-8').catch(() => null);
  return { settings, rawJson: raw ?? JSON.stringify(settings, null, 2) };
};

export const actions: Actions = {
  save: async ({ request }) => {
    const fd = await request.formData();
    const raw = (fd.get('json') as string | null) ?? '';

    let parsed: Partial<Settings>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return fail(400, { error: 'Invalid JSON' });
    }

    try {
      await writeFile(SETTINGS_FILE, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
    } catch (e: any) {
      return fail(500, { error: e.message ?? 'Failed to save' });
    }

    return { success: true };
  },

  addItem: async ({ request }) => {
    const fd = await request.formData();
    const id = (fd.get('id') as string | null)?.trim() ?? '';
    if (!id) return fail(400, { error: 'No item ID' });

    const settings = await getSettings();
    const already = settings.sidebar.items.some(
      (item) => item === id || (typeof item === 'object' && 'href' in item && item.href === id)
    );
    if (already) return fail(400, { error: 'Item already in sidebar' });

    settings.sidebar.items.push(id as SidebarItemConfig);
    await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
    return { success: true };
  },

  removeItem: async ({ request }) => {
    const fd = await request.formData();
    const id = (fd.get('id') as string | null)?.trim() ?? '';
    if (!id) return fail(400, { error: 'No item ID' });

    const settings = await getSettings();
    settings.sidebar.items = settings.sidebar.items.filter(
      (item) => item !== id
    ) as SidebarItemConfig[];
    await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
    return { success: true };
  },

  reorder: async ({ request }) => {
    const fd = await request.formData();
    const raw = (fd.get('order') as string | null) ?? '[]';
    let order: string[];
    try {
      order = JSON.parse(raw);
    } catch {
      return fail(400, { error: 'Invalid order' });
    }

    const settings = await getSettings();
    settings.sidebar.items = order as SidebarItemConfig[];
    await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
    return { success: true };
  },

  setWelcome: async ({ request }) => {
    const fd = await request.formData();
    const enabled = fd.get('enabled') === 'true';

    const settings = await getSettings();
    settings.welcome = { enabled };
    await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
    return { success: true };
  },

  setLearning: async ({ request }) => {
    const fd = await request.formData();
    const enabled = fd.get('enabled') === 'true';
    const level = (fd.get('level') as string | null) ?? 'beginner';

    const settings = await getSettings();
    settings.learning.enabled = enabled;
    settings.learning.level = level as Settings['learning']['level'];
    await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
    return { success: true };
  },

  setImport: async ({ request }) => {
    const fd = await request.formData();
    const suggestions = fd.get('suggestions') === 'true';

    const settings = await getSettings();
    settings.import = { ...settings.import, suggestions };
    await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
    return { success: true };
  },

  setDisplay: async ({ request }) => {
    const fd = await request.formData();
    const showCurrencySymbol = fd.get('showCurrencySymbol') === 'true';
    const roundAmounts = fd.get('roundAmounts') === 'true';

    const settings = await getSettings();
    settings.display = { ...settings.display, showCurrencySymbol, roundAmounts };
    await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
    return { success: true };
  }
};
