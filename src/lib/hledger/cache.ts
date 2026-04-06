import { CACHE_TTL } from "./constants.js";

const cache = new Map<string, { data: string; ts: number }>();

/** In-flight deduplication: if the same command is already running, share the promise */
const inflight = new Map<string, Promise<string>>();

/**
 * Run hledger with given arguments, with caching and deduplication.
 * In-flight requests for the same command share the same promise.
 */
export async function run(args: string[]): Promise<string> {
  const key = args.join("\x00");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = runImpl(args, key);
  inflight.set(key, promise);
  return promise;
}

async function runImpl(args: string[], key: string): Promise<string> {
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);
  const { JOURNAL } = await import("./journal.js");

  try {
    const { stdout } = await execAsync(
      `hledger -f "${JOURNAL}" ${args.join(" ")}`,
      { maxBuffer: 50 * 1024 * 1024 },
    );
    const result = stdout.trim();
    cache.set(key, { data: result, ts: Date.now() });
    return result;
  } catch (e: any) {
    // hledger exits non-zero when a query returns no results
    return e.stdout?.trim() ?? "";
  } finally {
    inflight.delete(key);
  }
}

/**
 * Run hledger with JSON output format.
 */
export async function runJson<T>(args: string[]): Promise<T> {
  const raw = await run([...args, "--output-format", "json"]);
  try {
    return JSON.parse(raw || "null") as T;
  } catch {
    return null as unknown as T;
  }
}

/**
 * Invalidate the entire cache.
 * Called when journal files are modified externally.
 */
export function invalidateCache(): void {
  cache.clear();
}

/**
 * Watch journal files for external changes and auto-invalidate cache.
 */
export async function watchJournal(): Promise<void> {
  const { watch } = await import("node:fs");
  const { JOURNAL, RECURRING_JOURNAL } = await import("./journal.js");

  for (const file of [JOURNAL, RECURRING_JOURNAL]) {
    try {
      watch(file, () => {
        cache.clear();
      });
    } catch {
      // File may not exist yet — that's fine
    }
  }
}
