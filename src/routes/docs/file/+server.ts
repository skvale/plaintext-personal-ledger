import type { RequestHandler } from './$types';
import { STATEMENTS_DIR } from '$lib/hledger.server.js';
import { join, resolve, normalize } from 'node:path';
import { readFile } from 'node:fs/promises';
import { error } from '@sveltejs/kit';

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  csv: 'text/csv; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

export const GET: RequestHandler = async ({ url }) => {
  const rel = url.searchParams.get('p') ?? '';
  if (!rel) throw error(400, 'Missing path');

  // Prevent path traversal
  const abs = resolve(join(STATEMENTS_DIR, rel));
  if (!abs.startsWith(resolve(STATEMENTS_DIR))) throw error(403, 'Forbidden');

  let data: Buffer;
  try {
    data = await readFile(abs);
  } catch {
    throw error(404, 'File not found');
  }

  const ext = abs.split('.').pop()?.toLowerCase() ?? '';
  const mime = MIME[ext] ?? 'application/octet-stream';
  const inlineTypes = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'txt'];
  const disposition = inlineTypes.includes(ext) ? 'inline' : 'attachment';

  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `${disposition}; filename="${abs.split('/').pop()}"`,
    }
  });
};
