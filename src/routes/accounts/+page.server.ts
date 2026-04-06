import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  getDeclaredAccounts,
  getUsedAccountNames,
  addAccountDeclaration,
  deleteAccountDeclaration
} from '$lib/hledger.server.js';

export const load: PageServerLoad = async () => {
  const [declared, used] = await Promise.all([getDeclaredAccounts(), getUsedAccountNames()]);
  const declaredSet = new Set(declared);
  const usedSet = new Set(used);
  // Include all accounts: declared + used (even if not explicitly declared)
  const allNames = [...new Set([...declared, ...used])].sort();
  return {
    accounts: allNames.map((name) => ({ name, used: usedSet.has(name), declared: declaredSet.has(name) }))
  };
};

export const actions: Actions = {
  add: async ({ request }) => {
    const data = await request.formData();
    const name = (data.get('name') as string)?.trim();
    if (!name) return fail(400, { error: 'Account name required' });
    if (!/^[a-z]/.test(name)) return fail(400, { error: 'Account names should start with lowercase' });
    const result = await addAccountDeclaration(name);
    if (!result.success) return fail(422, { error: result.error });
    return { added: true };
  },

  delete: async ({ request }) => {
    const data = await request.formData();
    const name = (data.get('name') as string)?.trim();
    if (!name) return fail(400, { error: 'Account name required' });
    const result = await deleteAccountDeclaration(name);
    if (!result.success) return fail(422, { error: result.error });
    return { deleted: true };
  }
};
