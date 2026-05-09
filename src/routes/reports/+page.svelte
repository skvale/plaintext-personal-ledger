<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let selectedReport = $state('');
  let customCommand = $state('');
  let running = $state(false);
  let output = $state('');
  let error = $state('');

  function selectReport(report: { name: string; command: string }) {
    selectedReport = report.name;
    customCommand = report.command;
  }
</script>

<div class="mb-6">
  <h1 class="text-xl font-semibold text-slate-100">Custom Reports</h1>
  <p class="mt-0.5 text-sm text-slate-100">Run custom hledger commands and save useful queries.</p>
</div>

<div class="rounded-xl border border-slate-400 bg-slate-900 p-5">
  <h2 class="mb-4 text-base font-semibold text-slate-100">Quick Reports</h2>
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
    {#each data.reports as report}
      <button
        type="button"
        onclick={() => selectReport(report)}
        class="rounded-lg border border-slate-300 bg-slate-950 px-4 py-3 text-left transition-colors hover:border-slate-400"
      >
        <div class="font-medium text-slate-100">{report.name}</div>
        <div class="text-xs text-slate-100">{report.description}</div>
      </button>
    {/each}
  </div>

  {#if data.ociAccounts.length > 0}
    <h3 class="mt-6 mb-3 text-sm font-semibold text-slate-100">OCI-Related Accounts Found</h3>
    <div class="flex flex-wrap gap-2">
      {#each data.ociAccounts as acct}
        <span class="rounded-md bg-slate-800 px-2 py-1 font-mono text-xs text-slate-100">{acct}</span>
      {/each}
    </div>
  {/if}
</div>

<div class="mt-6 rounded-xl border border-slate-400 bg-slate-900 p-5">
  <h2 class="mb-4 text-base font-semibold text-slate-100">Run Command</h2>
  <form method="POST" action="?/run" use:enhance={() => {
    running = true;
    output = '';
    error = '';
    return async ({ result }) => {
      running = false;
      if (result.type === 'success') {
        output = (result as any).data?.output ?? '';
      } else if (result.type === 'failure') {
        error = (result as any).data?.error ?? 'Error';
      }
    };
  }}>
    <input
      type="text"
      name="command"
      bind:value={customCommand}
      placeholder="e.g. balance equity"
      class="mb-3 w-full rounded-lg border border-slate-300 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-100 focus:border-blue-300 outline-none"
    />
    <button
      type="submit"
      disabled={running || !customCommand}
      class="btn-primary disabled:opacity-40"
    >
      {running ? 'Running...' : 'Run'}
    </button>
  </form>

  {#if output}
    <pre class="mt-4 overflow-x-auto rounded-lg border border-slate-400 bg-slate-950 p-4 text-xs font-mono text-slate-100 whitespace-pre-wrap">{output}</pre>
  {/if}

  {#if error}
    <p class="mt-3 text-sm text-rose-400">{error}</p>
  {/if}
</div>

<div class="mt-6 rounded-xl border border-slate-400 bg-slate-900 p-5">
  <h2 class="mb-4 text-base font-semibold text-slate-100">Examples</h2>
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <div class="rounded-lg border border-slate-300 bg-slate-950 p-3">
      <code class="text-xs font-mono text-slate-100">register -D</code>
      <p class="mt-1 text-xs text-slate-100">Daily transactions</p>
    </div>
    <div class="rounded-lg border border-slate-300 bg-slate-950 p-3">
      <code class="text-xs font-mono text-slate-100">bal --tree -M</code>
      <p class="mt-1 text-xs text-slate-100">Monthly tree balance</p>
    </div>
    <div class="rounded-lg border border-slate-300 bg-slate-950 p-3">
      <code class="text-xs font-mono text-slate-100">is -M</code>
      <p class="mt-1 text-xs text-slate-100">Monthly income statement</p>
    </div>
    <div class="rounded-lg border border-slate-300 bg-slate-950 p-3">
      <code class="text-xs font-mono text-slate-100">print date:2025-01</code>
      <p class="mt-1 text-xs text-slate-100">Transactions in Jan 2025</p>
    </div>
    <div class="rounded-lg border border-slate-300 bg-slate-950 p-3">
      <code class="text-xs font-mono text-slate-100">accounts --declared</code>
      <p class="mt-1 text-xs text-slate-100">Declared accounts</p>
    </div>
    <div class="rounded-lg border border-slate-300 bg-slate-950 p-3">
      <code class="text-xs font-mono text-slate-100">stats</code>
      <p class="mt-1 text-xs text-slate-100">Journal statistics</p>
    </div>
  </div>
</div>