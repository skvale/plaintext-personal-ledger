import type { Handle } from '@sveltejs/kit';
import { startWatcher } from '$lib/watcher.server.js';

startWatcher().catch(console.error);

export const handle: Handle = async ({ event, resolve }) => {
  return resolve(event);
};
