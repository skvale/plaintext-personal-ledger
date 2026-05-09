import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getAccountNames, JOURNAL } from '$lib/hledger.server.js';
import { execAsync } from '$lib/hledger/exec.js';

type CustomReport = {
  name: string;
  description: string;
  command: string;
};

const DEFAULT_REPORTS: CustomReport[] = [
  {
    name: 'Journal Statistics',
    description: 'Counts of transactions, accounts, commodities',
    command: 'stats',
  },
  {
    name: 'All Accounts',
    description: 'List of all used and declared accounts',
    command: 'accounts',
  },
  {
    name: 'All Equity Accounts',
    description: 'Complete equity section',
    command: 'balance equity',
  },
  {
    name: 'Account Register',
    description: 'Show transactions for a specific account',
    command: 'register expenses -2',
  },
  {
    name: 'Monthly Balance Sheet',
    description: 'Assets, liabilities, equity by month',
    command: 'balancesheet -M',
  },
  {
    name: 'Expenses This Month',
    description: 'Current month expenses',
    command: 'balance expenses -p thismonth',
  },
];

export const load: PageServerLoad = async () => {
  const accounts = await getAccountNames();
  // Filter to likely OCI-related accounts
  const ociAccounts = accounts.filter(a =>
    a.includes('unrealized') || a.includes('translation') || a.includes('oci') || a.includes('comprehensive')
  );
  return {
    reports: DEFAULT_REPORTS,
    ociAccounts,
  };
};

export const actions: Actions = {
  run: async ({ request }) => {
    const data = await request.formData();
    const command = (data.get('command') as string)?.trim();
    if (!command) return fail(400, { error: 'Command required' });

    try {
      const { stdout, stderr } = await execAsync(
        `hledger -f "${JOURNAL}" ${command}`
      );
      return { output: stdout || stderr };
    } catch (e: any) {
      return { output: e.stdout || e.stderr || e.message };
    }
  },
};