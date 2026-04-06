import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  getGitStatus,
  getGitDiff,
  getGitLog,
  getCommitDiff,
  gitCommit,
  sortJournal
} from '$lib/hledger.server.js';

export const load: PageServerLoad = async ({ url }) => {
  const commitHash = url.searchParams.get('commit') ?? null;
  const [status, diff, log] = await Promise.all([
    getGitStatus(),
    commitHash ? getCommitDiff(commitHash) : getGitDiff(),
    getGitLog()
  ]);
  return { status, diff, log, commitHash };
};

export const actions: Actions = {
  commit: async ({ request }) => {
    const data = await request.formData();
    const message = (data.get('message') as string ?? '').trim();
    const filesJson = data.get('files') as string ?? '[]';

    if (!message) return fail(400, { error: 'Commit message required' });

    let files: string[];
    try { files = JSON.parse(filesJson); }
    catch { files = []; }

    const result = await gitCommit(message, files);
    if (!result.success) return fail(422, { error: result.error ?? 'Commit failed' });
    return { committed: true };
  },

  sort: async () => {
    const result = await sortJournal();
    if (!result.success) return fail(422, { error: result.error ?? 'Sort failed' });
    return { sorted: true };
  }
};
