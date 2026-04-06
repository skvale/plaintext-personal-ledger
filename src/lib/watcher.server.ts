import { invalidateCache, JOURNAL } from "./hledger.server.js";
import { SETTINGS_FILE } from "./hledger/journal.js";
import { resolve, dirname } from "node:path";

type SendFn = (data: string, event?: string) => void;

const clients = new Set<SendFn>();

export function addClient(send: SendFn): () => void {
  clients.add(send);
  return () => clients.delete(send);
}

function broadcast(data: string, event = "message"): void {
  clients.forEach((send) => send(data, event));
}

export async function startWatcher(): Promise<void> {
  const { watch } = await import("chokidar");
  const DATA_DIR = resolve(dirname(JOURNAL));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const watcher = watch(DATA_DIR, {
    ignoreInitial: true,
    ignored: [SETTINGS_FILE, "**/.git/**"],
  }) as any;
  watcher.on("change", (path: string) => {
    if (path === SETTINGS_FILE) return;
    invalidateCache();
    broadcast("reload", "journal-changed");
    console.log("[watcher] journal changed — cache cleared, clients notified");
  });
  console.log(`[watcher] watching ${DATA_DIR}`);
}
