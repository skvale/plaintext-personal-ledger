import type { PageServerLoad } from './$types';
import { getTransactions, getUsedAccountNames, getTransactionDocs } from '$lib/hledger.server.js';

function thisMonthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function nextMonthStart() {
  const d = new Date();
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
}

export const load: PageServerLoad = async ({ url }) => {
  const account = url.searchParams.get('account') ?? undefined;
  const query = url.searchParams.get('q') ?? undefined;
  const drop = Number(url.searchParams.get('drop') ?? '0');

  // Default to all time (no date filter).
  const from = url.searchParams.get('from') ?? undefined;
  const to = url.searchParams.get('to') ?? undefined;

  const [transactions, accounts, txnDocs] = await Promise.all([
    getTransactions({ account, query, from, to, drop: drop || undefined }),
    getUsedAccountNames(),
    getTransactionDocs()
  ]);

  // Build a lookup: tindex → docPath
  const docsByTindex = Object.fromEntries(
    txnDocs.map((d) => [d.tindex, d.docPath])
  );

  return {
    transactions,
    accounts,
    docsByTindex,
    account: account ?? '',
    query: query ?? '',
    from: from ?? '',
    to: to ?? '',
    drop,
    isDefaultView: !account && !query
  };
};
