import type { RequestHandler } from './$types';
import { addClient } from '$lib/watcher.server.js';

export const GET: RequestHandler = () => {
  let removeClient: (() => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (data: string, event = 'message') => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch {
          // controller already closed
        }
      };

      send('connected');
      removeClient = addClient(send);
    },
    cancel() {
      removeClient?.();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  });
};
