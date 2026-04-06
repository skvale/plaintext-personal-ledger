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

  // Default to this month so we don't load every transaction on first visit.
  // The "All time" preset clears 'from', which is preserved as an explicit empty string in the URL.
  const hasFromParam = url.searchParams.has('from');
  const from = hasFromParam ? (url.searchParams.get('from') ?? undefined) : thisMonthStart();
  const hasToParam = url.searchParams.has('to');
  const to = hasToParam ? (url.searchParams.get('to') ?? undefined) : (!hasFromParam ? nextMonthStart() : undefined);

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
    isDefaultView: !hasFromParam && !account && !query && !to
  };
};
