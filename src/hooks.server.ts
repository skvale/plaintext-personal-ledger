import type { Handle } from '@sveltejs/kit/hooks';
import { startWatcher } from '#lib/watcher.server.js';
import { ensureManagedJournalDirectives } from '#lib/hledger/journal.js';

startWatcher().catch(console.error);
ensureManagedJournalDirectives().catch(console.error);

export const handle: Handle = async ({ event, resolve }) => {
  const origin = event.request.headers.get('origin');
  const host = event.request.headers.get('host') ?? 'localhost:3000';
  
  if (!origin || origin === `http://${host}` || origin === `https://${host}`) {
    return resolve(event);
  }
  
  const response = await resolve(event);
  response.headers.set('Access-Control-Allow-Origin', origin);
  return response;
};
