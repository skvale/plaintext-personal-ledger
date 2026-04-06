<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import LearningBanner from '$lib/components/LearningBanner.svelte';

  const props: { data: PageData; form: ActionData } = $props();
  const data = $derived(props.data);
  const form = $derived(props.form);

  let commitMessage = $state('');
  let selectedFiles = $state<string[]>([]);
  $effect(() => { selectedFiles = data.status.changed.map((f: any) => f.path); });
  let committing = $state(false);
  let activeCommitOverride = $state<string | null>(null);
  const activeCommit = $derived(activeCommitOverride ?? data.commitHash);

  function toggleFile(path: string) {
    selectedFiles = selectedFiles.includes(path)
      ? selectedFiles.filter((f) => f !== path)
      : [...selectedFiles, path];
  }

  const allChangedPaths = $derived(data.status.changed.map((f: any) => f.path));

  function toggleAll() {
    selectedFiles = selectedFiles.length === allChangedPaths.length ? [] : [...allChangedPaths];
  }

  function commitEnhance() {
    committing = true;
    return async ({ result, update }: any) => {
      committing = false;
      if (result.type === 'success') { commitMessage = ''; selectedFiles = []; }
      await update();
    };
  }

  function viewCommit(hash: string) {
    const next = activeCommit === hash ? null : hash;
    activeCommitOverride = next;
    goto(next ? `/git?commit=${hash}` : '/git', { replaceState: true });
  }

  // ── Diff parser ──────────────────────────────────────────────────────────────

  interface DiffLine {
    type: 'add' | 'del' | 'ctx' | 'sep';
    oldNo: number | null;
    newNo: number | null;
    content: string;
  }

  interface DiffFile {
    filename: string;
    lines: DiffLine[];
    adds: number;
    dels: number;
    isDeleted: boolean;
    isNew: boolean;
  }

  function parseDiff(raw: string): DiffFile[] {
    const files: DiffFile[] = [];
    if (!raw.trim()) return files;

    // Split into per-file blocks
    const blocks = raw.split(/^(?=diff --git )/m).filter(Boolean);

    for (const block of blocks) {
      // Prefer +++ b/filename (added/modified), fall back to --- a/filename (deleted)
      const newMatch = block.match(/^\+\+\+ b\/(.+)$/m);
      const oldMatch = block.match(/^--- a\/(.+)$/m);
      const filename = (newMatch?.[1] ?? oldMatch?.[1] ?? '').trim();
      if (!filename) continue;

      const isDeleted = block.includes('\ndeleted file mode') || block.includes('\n+++ /dev/null');

      const lines: DiffLine[] = [];
      let oldNo = 0, newNo = 0;
      let adds = 0, dels = 0;

      for (const raw_line of block.split('\n')) {
        // Hunk header: @@ -oldStart[,oldCount] +newStart[,newCount] @@
        const hunkMatch = raw_line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (hunkMatch) {
          oldNo = parseInt(hunkMatch[1]);
          newNo = parseInt(hunkMatch[2]);
          // Extract optional trailing description after @@
          const trailing = raw_line.replace(/^@@ .+? @@\s*/, '');
          lines.push({ type: 'sep', oldNo: null, newNo: null, content: raw_line.slice(0, raw_line.indexOf(' @@') + 3) + (trailing ? ' ' + trailing : '') });
          continue;
        }
        if (raw_line.startsWith('+++) ') || raw_line.startsWith('--- ')) continue;
        if (raw_line.startsWith('diff ') || raw_line.startsWith('index ') || raw_line.startsWith('new file') || raw_line.startsWith('deleted file')) continue;
        if (raw_line.startsWith('+++') || raw_line.startsWith('---')) continue;
        if (raw_line === '\\ No newline at end of file') {
          lines.push({ type: 'sep', oldNo: null, newNo: null, content: raw_line });
          continue;
        }

        if (raw_line.startsWith('+')) {
          lines.push({ type: 'add', oldNo: null, newNo: newNo++, content: raw_line.slice(1) });
          adds++;
        } else if (raw_line.startsWith('-')) {
          lines.push({ type: 'del', oldNo: oldNo++, newNo: null, content: raw_line.slice(1) });
          dels++;
        } else if (raw_line.startsWith(' ')) {
          lines.push({ type: 'ctx', oldNo: oldNo++, newNo: newNo++, content: raw_line.slice(1) });
        }
      }

      const isNew = block.includes('\nnew file mode') || block.includes('\n--- /dev/null');
      if (lines.length > 0) files.push({ filename, lines, adds, dels, isDeleted, isNew });
    }

    return files;
  }

  const diffFiles = $derived(parseDiff(data.diff));

  // ── Status helpers ────────────────────────────────────────────────────────────

  function statusLabel(code: string) {
    if (code === 'M' || code === 'MM') return 'modified';
    if (code.startsWith('A')) return 'added';
    if (code.startsWith('D')) return 'deleted';
    if (code === '?') return 'untracked';
    return code;
  }

  function statusBadge(code: string) {
    if (code.startsWith('A')) return 'bg-emerald-100 text-emerald-800 font-semibold';
    if (code.startsWith('D')) return 'bg-red-100 text-red-800 font-semibold';
    if (code === '?') return 'bg-slate-200 text-slate-100 font-semibold';
    return 'bg-amber-100 text-amber-800 font-semibold';
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
</script>

<LearningBanner id="git" title="Undo & snapshots">
  Every change you make is saved here as a snapshot. If you accidentally delete a transaction or mess something up,
  you can see exactly what changed and undo it. Think of it as an unlimited "undo" history for your finances.
</LearningBanner>

<div class="mb-6 flex items-center justify-between">
  <div>
    <h1 class="text-xl font-semibold text-slate-100">History</h1>
    <p class="mt-0.5 text-sm text-slate-100">Track and commit changes to your journal and rules files.</p>
  </div>
  <form method="POST" action="?/sort" use:enhance={({ }) => async ({ update }) => { await update(); }}>
    <button type="submit"
      class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-100 transition-colors hover:border-slate-400 hover:text-slate-100">
      Sort by date
    </button>
  </form>
</div>

<div class="grid grid-cols-[1fr_240px] gap-6">
  <!-- Left: changed files, diff, commit form -->
  <div class="flex min-w-0 flex-col gap-5">

    <!-- Uncommitted changes + commit form — hidden while browsing a past commit -->
    {#if !activeCommit && data.status.changed.length > 0}
      <div class="overflow-hidden rounded-xl border border-slate-400 bg-slate-900">
        <div class="flex items-center justify-between border-b border-slate-400 px-4 py-2.5">
          <p class="text-xs font-semibold tracking-wide text-slate-100">Uncommitted changes</p>
          <button onclick={toggleAll} class="text-xs text-slate-100 hover:text-slate-100 transition-colors">
            {selectedFiles.length === allChangedPaths.length ? 'Deselect all' : 'Select all'}
          </button>
        </div>
        <div class="divide-y divide-slate-800/50">
          {#each data.status.changed as file}
            <label class="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-slate-800/40 transition-colors">
              <input type="checkbox" checked={selectedFiles.includes(file.path)}
                onchange={() => toggleFile(file.path)} class="shrink-0 accent-blue-400" />
              <span class="min-w-0 flex-1 truncate font-mono text-sm text-slate-100">{file.path}</span>
              <span class="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium {statusBadge(file.status)}">{statusLabel(file.status)}</span>
            </label>
          {/each}
        </div>
        <form method="POST" action="?/commit" use:enhance={commitEnhance}
          class="flex items-center gap-3 border-t border-slate-400 p-3">
          <input type="hidden" name="files" value={JSON.stringify(selectedFiles)} />
          <input type="text" name="message" bind:value={commitMessage} placeholder="Commit message…"
            class="flex-1 rounded-lg border border-slate-300 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-blue-300 transition-colors" />
          <button type="submit"
            disabled={committing || !commitMessage.trim() || selectedFiles.length === 0}
            class="shrink-0 rounded-lg bg-blue-300/20 px-4 py-1.5 text-sm font-semibold text-blue-500 transition-colors hover:bg-blue-300/30 disabled:opacity-40">
            {committing ? 'Committing…' : 'Commit'}
          </button>
        </form>
        {#if form?.error}
          <p class="px-4 pb-3 text-sm text-rose-400">{form.error}</p>
        {/if}
        {#if form?.committed}
          <p class="px-4 pb-3 text-sm text-emerald-400">Committed successfully.</p>
        {/if}
      </div>
    {:else if !activeCommit}
      <div class="rounded-xl border border-slate-400 bg-slate-900 px-4 py-4">
        <p class="text-sm text-slate-100">No uncommitted changes.</p>
      </div>
    {/if}
    <!-- "Back to now" banner shown when browsing a past commit -->
    {#if activeCommit && data.status.changed.length > 0}
      <button
        onclick={() => viewCommit(activeCommit!)}
        class="flex items-center gap-2 rounded-xl border border-slate-400 bg-slate-900 px-4 py-3 text-left text-sm text-slate-100 transition-colors hover:border-slate-600 hover:text-slate-100"
      >
        <span class="text-slate-100">←</span>
        <span>{data.status.changed.length} uncommitted change{data.status.changed.length !== 1 ? 's' : ''} — click to return</span>
      </button>
    {/if}

    <!-- Diff viewer -->
    {#if diffFiles.length > 0}
      <div class="flex flex-col gap-3">
        {#each diffFiles as file}
          <div class="overflow-hidden rounded-xl border-[var(--diff-card-border)] bg-[var(--diff-card-bg)] border">
            <!-- File header -->
            <div class="flex items-center gap-3 border-b border-[var(--diff-ctx-border)] bg-[var(--diff-file-bg)] px-4 py-2.5">
              <span class="min-w-0 flex-1 truncate font-mono text-sm font-medium text-[var(--diff-filename-text)]">{file.filename}</span>
              {#if file.isDeleted}
                <span class="rounded px-1.5 py-0.5 text-xs font-semibold bg-red-900/40 text-rose-400">deleted</span>
              {:else if file.isNew}
                <span class="rounded px-1.5 py-0.5 text-xs font-semibold bg-emerald-900/40 text-emerald-400">new</span>
              {/if}
              {#if file.adds > 0}
                <span class="text-xs font-medium text-emerald-500">+{file.adds}</span>
              {/if}
              {#if file.dels > 0}
                <span class="text-xs font-medium text-rose-500">−{file.dels}</span>
              {/if}
            </div>
            <!-- Lines -->
            <div class="overflow-x-auto">
              <table class="w-full border-collapse font-mono text-sm">
                <tbody>
                  {#each file.lines as line}
                    {#if line.type === 'sep'}
                      <tr style="background:var(--diff-sep-bg)">
                        <td colspan="3" class="px-4 py-1 text-xs select-none" style="color:var(--diff-sep-text)">{line.content}</td>
                      </tr>
                    {:else if line.type === 'add'}
                      <tr style="background:var(--diff-add-bg)" onmouseenter={(e)=>(e.currentTarget as HTMLElement).style.background='var(--diff-add-hover)'} onmouseleave={(e)=>(e.currentTarget as HTMLElement).style.background='var(--diff-add-bg)'}>
                        <td class="w-10 select-none px-2 py-0.5 text-right" style="border-right:1px solid var(--diff-add-border);color:var(--diff-ctx-num)">{line.oldNo ?? ''}</td>
                        <td class="w-10 select-none px-2 py-0.5 text-right" style="border-right:1px solid var(--diff-add-border);color:var(--diff-add-num)">{line.newNo ?? ''}</td>
                        <td class="px-3 py-0.5 whitespace-pre" style="color:var(--diff-add-text)"><span class="select-none mr-1" style="color:var(--diff-add-sign)">+</span>{line.content}</td>
                      </tr>
                    {:else if line.type === 'del'}
                      <tr style="background:var(--diff-del-bg)" onmouseenter={(e)=>(e.currentTarget as HTMLElement).style.background='var(--diff-del-hover)'} onmouseleave={(e)=>(e.currentTarget as HTMLElement).style.background='var(--diff-del-bg)'}>
                        <td class="w-10 select-none px-2 py-0.5 text-right" style="border-right:1px solid var(--diff-del-border);color:var(--diff-del-num)">{line.oldNo ?? ''}</td>
                        <td class="w-10 select-none px-2 py-0.5 text-right" style="border-right:1px solid var(--diff-del-border);color:var(--diff-ctx-num)">{line.newNo ?? ''}</td>
                        <td class="px-3 py-0.5 whitespace-pre" style="color:var(--diff-del-text)"><span class="select-none mr-1" style="color:var(--diff-del-sign)">−</span>{line.content}</td>
                      </tr>
                    {:else}
                      <tr style="background:var(--diff-ctx-bg)" onmouseenter={(e)=>(e.currentTarget as HTMLElement).style.background='var(--diff-ctx-hover)'} onmouseleave={(e)=>(e.currentTarget as HTMLElement).style.background='var(--diff-ctx-bg)'}>
                        <td class="w-10 select-none px-2 py-0.5 text-right" style="border-right:1px solid var(--diff-ctx-border);color:var(--diff-ctx-num)">{line.oldNo ?? ''}</td>
                        <td class="w-10 select-none px-2 py-0.5 text-right" style="border-right:1px solid var(--diff-ctx-border);color:var(--diff-ctx-num)">{line.newNo ?? ''}</td>
                        <td class="px-3 py-0.5 whitespace-pre" style="color:var(--diff-ctx-text)"><span class="select-none mr-1 opacity-0">·</span>{line.content}</td>
                      </tr>
                    {/if}
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {/each}
      </div>
    {:else if activeCommit}
      <div class="rounded-xl border border-slate-400 bg-slate-900 px-4 py-4">
        <p class="text-sm text-slate-100">No journal or rules changes in this commit.</p>
      </div>
    {/if}
  </div>

  <!-- Right: commit log -->
  <div>
    <div class="overflow-hidden rounded-xl border border-slate-400 bg-slate-900">
      <p class="px-4 py-3 text-xs font-semibold tracking-wide text-slate-100 border-b border-slate-400">Recent commits</p>
      {#if data.log.length === 0}
        <div class="px-4 py-6 text-center text-sm text-slate-100">No commits yet.</div>
      {:else}
        <div class="divide-y divide-slate-800/40 max-h-96 overflow-y-auto">
          {#each data.log as commit}
            <button onclick={() => viewCommit(commit.hash)}
              class="flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-slate-800/50
                {activeCommit === commit.hash ? 'bg-blue-300/5 border-l-2 border-blue-300' : 'border-l-2 border-transparent'}">
              <span class="truncate text-sm text-slate-100">{commit.message}</span>
              <div class="flex items-center gap-2">
                <span class="font-mono text-xs text-slate-100">{commit.hash.slice(0, 7)}</span>
                <span class="text-xs text-slate-100">{fmtDate(commit.date)}</span>
                {#if activeCommit === commit.hash}
                  <span class="ml-auto text-xs text-slate-100">click to close ×</span>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>
