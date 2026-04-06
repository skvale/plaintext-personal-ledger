import { dirname } from "node:path";
import { execAsync } from "./exec.js";
import { READ_JOURNAL } from "./journal.js";

// Get git root - use the repo root (parent of data/)
const getGitRoot = () => dirname(dirname(READ_JOURNAL));

const GIT_ROOT = getGitRoot();
// Only show diffs for journal/rules files — not UI source
const JOURNAL_PATTERNS = [/\.journal$/, /\.rules$/, /^keywords\.json$/];
// Paths to ignore in git status output
const GIT_IGNORE = ["ui/", "settings.schema.json"];

async function git(args: string[]): Promise<string> {
  try {
    const { stdout } = await execAsync(
      `git -C "${GIT_ROOT}" ${args.join(" ")}`,
    );
    return stdout.trimEnd();
  } catch (e: any) {
    return e.stdout?.trimEnd() ?? "";
  }
}

function isJournalFile(path: string): boolean {
  const name = path.split("/").pop() ?? path;
  return JOURNAL_PATTERNS.some((p) => p.test(name));
}

function filterDiff(diff: string): string {
  const files = diff.split(/(?=^diff --git )/m);
  return files
    .filter((block) => {
      const m = block.match(/^diff --git a\/.+ b\/(.+)/m);
      return m ? isJournalFile(m[1]) : false;
    })
    .join("");
}

// ─── Git Status ───────────────────────────────────────────────────────────────

export interface GitStatus {
  changed: { status: string; path: string }[];
}

export async function getGitStatus(): Promise<GitStatus> {
  const out = await git(["status", "--porcelain"]);
  const changed: GitStatus["changed"] = [];

  for (const line of out.split("\n").filter(Boolean)) {
    const x = line[0];
    const y = line[1];
    const file = line.slice(3);
    if (GIT_IGNORE.some((ig) => file.startsWith(ig))) continue;
    if (!isJournalFile(file)) continue;
    const status = x !== " " && x !== "?" ? x : y !== " " ? y : "?";
    changed.push({ status, path: file });
  }
  return { changed };
}

// ─── Git Diff ─────────────────────────────────────────────────────────────────

export async function getGitDiff(staged = false): Promise<string> {
  const args = staged ? ["diff", "--cached"] : ["diff"];
  const raw = await git(args);
  let result = filterDiff(raw);

  if (!staged) {
    const status = await git(["status", "--porcelain"]);
    for (const line of status.split("\n").filter(Boolean)) {
      if (line[0] === "?" && line[1] === "?") {
        const file = line.slice(3);
        if (isJournalFile(file)) {
          const untrackedDiff = await git([
            "diff",
            "--no-index",
            "/dev/null",
            file,
          ]);
          if (untrackedDiff) result += untrackedDiff;
        }
      }
    }
  }

  return result;
}

// ─── Git Log ──────────────────────────────────────────────────────────────────

export interface GitCommit {
  hash: string;
  short: string;
  message: string;
  date: string;
  author: string;
}

export async function getGitLog(limit = 30): Promise<GitCommit[]> {
  const out = await git([
    "log",
    `--max-count=${limit}`,
    "--pretty=format:%H\x1f%h\x1f%s\x1f%ai\x1f%an",
  ]);
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, short, message, date, author] = line.split("\x1f");
      return { hash, short, message, date: date?.slice(0, 10) ?? "", author };
    });
}

export async function getCommitDiff(hash: string): Promise<string> {
  if (!/^[0-9a-f]{4,64}$/i.test(hash)) return "";
  const raw = await git(["show", "--format=", hash]);
  return filterDiff(raw);
}

// ─── Git Commit ───────────────────────────────────────────────────────────────

export async function gitCommit(
  message: string,
  files: string[],
): Promise<{ success: boolean; error?: string }> {
  if (!message.trim()) return { success: false, error: "Message required" };
  try {
    const toStage = files.length > 0 ? files : ["."];
    await execAsync(
      `git -C "${GIT_ROOT}" add ${toStage.map((f) => `"${f}"`).join(" ")}`,
    );
    await execAsync(
      `git -C "${GIT_ROOT}" commit -m ${JSON.stringify(message)}`,
    );
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.stderr?.trim() ?? "Commit failed" };
  }
}
