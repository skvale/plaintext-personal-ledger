import { getUncategorizedCount, checkJournal, getSettings, getDefaultCommodity, isHledgerAvailable } from '$lib/hledger.server.js';
import type { ServerLoad } from '@sveltejs/kit';

export const load: ServerLoad = async () => {
  const hledgerOk = await isHledgerAvailable();
  if (!hledgerOk) {
    const settings = await getSettings();
    return {
      uncategorizedCount: 0,
      journalCheck: { ok: false, error: 'hledger not found' },
      settings,
      commodity: '$1,000.00',
      hledgerMissing: true
    };
  }
  const [uncategorizedCount, journalCheck, settings, commodity] = await Promise.all([
    getUncategorizedCount(),
    checkJournal(),
    getSettings(),
    getDefaultCommodity()
  ]);
  return { uncategorizedCount, journalCheck, settings, commodity, hledgerMissing: false };
};
