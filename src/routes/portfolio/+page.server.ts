import type { PageServerLoad } from './$types';
import { getPortfolioData, getTransactions, getUnrealizedGains } from '$lib/hledger.server.js';

export const load: PageServerLoad = async () => {
  const [portfolio, recentTxns, gains] = await Promise.all([
    getPortfolioData(),
    getTransactions({ account: 'assets:investments', from: undefined, to: undefined }),
    getUnrealizedGains()
  ]);

  const recent = [...recentTxns].reverse().slice(0, 15);
  return { ...portfolio, recentTxns: recent, gains };
};
