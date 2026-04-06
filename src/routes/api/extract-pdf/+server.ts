import { json } from '@sveltejs/kit';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { RequestHandler } from './$types.js';

const execFileAsync = promisify(execFile);

export const POST: RequestHandler = async ({ request }) => {
  const fd = await request.formData();
  const file = fd.get('file') as File | null;
  if (!file || file.size === 0) return json({ error: 'No file' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext !== 'pdf') return json({ error: 'PDF only' }, { status: 400 });

  const tmp = join(tmpdir(), `hledger-pdf-${randomBytes(8).toString('hex')}.pdf`);
  try {
    await writeFile(tmp, Buffer.from(await file.arrayBuffer()));

    // -layout preserves column spacing; - sends to stdout
    const { stdout } = await execFileAsync('pdftotext', ['-layout', tmp, '-']);

    const text = stdout.trim();
    const isEmpty = text.length < 20;

    // If text is basically empty, the PDF is likely scanned — note it but don't auto-OCR yet
    return json({ text, isEmpty, pages: countPages(text) });
  } catch (e: any) {
    return json({ error: e.message ?? 'Extraction failed' }, { status: 500 });
  } finally {
    await unlink(tmp).catch(() => {});
  }
};

function countPages(text: string): number {
  // pdftotext inserts \f (form feed) between pages
  return text.split('\f').filter((p) => p.trim()).length || 1;
}
