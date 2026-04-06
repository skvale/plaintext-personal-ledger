import type { PageServerLoad } from './$types';
import { JOURNAL } from '$lib/hledger.server.js';
import { readFile } from 'node:fs/promises';

export const load: PageServerLoad = async () => {
  const content = await readFile(JOURNAL, 'utf-8').catch(() => '');
  return { content, path: JOURNAL };
};
