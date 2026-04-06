import { fail } from '@sveltejs/kit';
import { checkJournal, JOURNAL } from '$lib/hledger.server.js';
import { readFile, writeFile } from 'node:fs/promises';
import type { PageServerLoad, Actions } from './$types';

export interface ErrorContext {
  number: number;
  text: string;
  isErrorLine: boolean;
}

export interface ParsedError {
  type: 'balance-assertion' | 'other';
  file: string;
  line: number;
  col?: number;
  snippet: string[];       // raw | lines from hledger's error block
  message: string;         // full message text
  account?: string;
  assertedBalance?: string;
  actualBalance?: string;
  context: ErrorContext[];
}

function parseError(raw: string, journalLines: string[]): ParsedError | null {
  // hledger: Error: /path/file.journal:LINE:COL:
  const locMatch = raw.match(/Error:\s+(.+?):(\d+):(\d+):/);
  if (!locMatch) return null;

  const file = locMatch[1].split('/').pop() ?? locMatch[1];
  const line = parseInt(locMatch[2]);
  const col = parseInt(locMatch[3]);

  // Extract | lines (the code snippet hledger prints)
  const snippet = raw
    .split('\n')
    .filter((l) => /^\s*\d*\s*\|/.test(l))
    .map((l) => l.replace(/^\s*\d*\s*\|\s?/, ''));

  // Message body (everything after the snippet)
  const afterSnippet = raw.split('\n').filter((l) => !/^\s*\d*\s*\|/.test(l) && !/^hledger: Error:/.test(l)).join('\n').trim();

  // Balance assertion?
  const baMatch = afterSnippet.match(/Balance assertion failed in (.+)/);
  const assertedMatch = afterSnippet.match(/the asserted balance is:\s*(\S+)/);
  const actualMatch = afterSnippet.match(/but the calculated balance is:\s*(\S+)/);

  // Journal context: a few lines around the error
  const start = Math.max(0, line - 4);
  const end = Math.min(journalLines.length, line + 2);
  const context: ErrorContext[] = journalLines.slice(start, end).map((text, i) => ({
    number: start + i + 1,
    text,
    isErrorLine: start + i + 1 === line
  }));

  if (baMatch) {
    return {
      type: 'balance-assertion',
      file, line, col, snippet,
      message: afterSnippet,
      account: baMatch[1].trim(),
      assertedBalance: assertedMatch?.[1],
      actualBalance: actualMatch?.[1],
      context
    };
  }

  return { type: 'other', file, line, col, snippet, message: afterSnippet, context };
}

export const load: PageServerLoad = async () => {
  const check = await checkJournal();
  if (check.ok) return { ok: true, parsed: null };

  const journalLines = (await readFile(JOURNAL, 'utf-8').catch(() => '')).split('\n');
  const parsed = parseError(check.error ?? '', journalLines);
  return { ok: false, parsed, raw: check.error };
};

export const actions: Actions = {
  fixAssertion: async ({ request }) => {
    const fd = await request.formData();
    const lineNum = parseInt((fd.get('line') as string) ?? '');
    const actual = ((fd.get('actual') as string) ?? '').trim();

    if (!lineNum || !actual) return fail(400, { error: 'Missing params' });

    const content = await readFile(JOURNAL, 'utf-8');
    const lines = content.split('\n');
    const idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return fail(400, { error: 'Line out of range' });

    const updated = lines[idx].replace(/=\s*\$[\d,.-]+/, `= ${actual}`);
    if (updated === lines[idx]) return fail(400, { error: 'Could not find assertion to update' });

    lines[idx] = updated;
    await writeFile(JOURNAL, lines.join('\n'), 'utf-8');

    const recheck = await checkJournal();
    if (recheck.ok) return { fixed: true };
    return { fixed: false, nextError: recheck.error };
  }
};
