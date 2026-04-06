import { redirect } from '@sveltejs/kit';
import { getSettings } from '$lib/hledger.server.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const settings = await getSettings();
  const firstItem = settings?.sidebar?.items?.[0] ?? 'dashboard';
  redirect(302, `/${firstItem}`);
};
