import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  getDeclaredAccounts,
  getUsedAccountNames,
  getAccountDescriptions,
  addAccountDeclaration,
  deleteAccountDeclaration,
  MAIN_JOURNAL
} from '$lib/hledger.server.js';

export const load: PageServerLoad = async () => {
  const [declared, used, descriptions] = await Promise.all([
    getDeclaredAccounts(),
    getUsedAccountNames(),
    getAccountDescriptions()
  ]);
  const declaredSet = new Set(declared);
  const usedSet = new Set(used);
  const allNames = [...new Set([...declared, ...used])].sort();
  return {
    accounts: allNames.map((name) => ({
      name,
      used: usedSet.has(name),
      declared: declaredSet.has(name),
      description: descriptions[name] ?? ''
    }))
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
  },

  updateDescription: async ({ request }) => {
    const data = await request.formData();
    const name = (data.get('name') as string)?.trim();
    const description = (data.get('description') as string ?? '').trim();
    if (!name) return fail(400, { error: 'Account name required' });

    const { readFile, writeFile } = await import("node:fs/promises");
    const content = await readFile(MAIN_JOURNAL, "utf-8");
    const lines = content.split("\n");
    let updated = false;

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^account\s+(\S+)\s*(;.*)?$/);
      if (match && match[1] === name) {
        const existing = match[2]?.trim() ?? '';
        if (description) {
          lines[i] = `account ${name} ; ${description}`;
        } else if (existing) {
          lines[i] = `account ${name}`;
        }
        updated = true;
        break;
      }
    }

    if (!updated) {
      // Account not declared, add declaration with description
      const insertAt = lines.findIndex(l => /^\d{4}-\d{2}-\d{2}/.test(l));
      if (insertAt >= 0) {
        lines.splice(insertAt, 0, `account ${name} ; ${description}`);
      } else {
        lines.unshift(`account ${name} ; ${description}`);
      }
    }

    await writeFile(MAIN_JOURNAL, lines.join("\n"), "utf-8");
    return { updated: true };
  }
};
