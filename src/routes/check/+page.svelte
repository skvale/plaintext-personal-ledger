<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import LearningBanner from '$lib/components/LearningBanner.svelte';

  let { data, form } = $props();

  let fixing = $state(false);

  $effect(() => {
    if (form?.fixed) invalidateAll();
  });
</script>

<LearningBanner id="check" title="Finding mistakes">
  This runs a health check on your journal file — looking for common mistakes like typos in account names,
  unbalanced transactions, or transactions that reference accounts you haven't set up yet.
</LearningBanner>

{#if data.ok}
  <div class="rounded-xl border border-emerald-800/40 bg-emerald-950/20 px-6 py-14 text-center">
    <p class="text-2xl mb-3 text-emerald-400">✓</p>
    <p class="text-sm font-medium text-slate-100">Journal is valid</p>
    <p class="mt-1 text-sm text-slate-100">No errors found.</p>
  </div>

{:else if !data.parsed}
  <!-- Unparseable error — show raw -->
  <div class="mb-4">
    <h1 class="text-lg font-semibold text-rose-400">Journal Error</h1>
    <p class="mt-0.5 text-sm text-slate-100">Could not parse error location.</p>
  </div>
  <pre class="rounded-xl border border-slate-400 bg-slate-900 p-5 font-mono text-sm leading-relaxed text-slate-100 overflow-x-auto whitespace-pre-wrap">{data.raw}</pre>

{:else}
  {@const p = data.parsed}

  <div class="mb-5 flex items-start justify-between">
    <div>
      <h1 class="text-lg font-semibold text-rose-400">Journal Error</h1>
      <p class="mt-0.5 font-mono text-sm text-slate-100">{p.file}:{p.line}{p.col ? `:${p.col}` : ''}</p>
    </div>
    {#if p.type === 'balance-assertion'}
      <span class="rounded-full border border-rose-800/40 bg-rose-950/30 px-3 py-1 text-xs font-semibold tracking-wide text-rose-400">
        Balance Assertion Failed
      </span>
    {/if}
  </div>

  <!-- Journal context -->
  <div class="mb-5 overflow-hidden rounded-xl border border-slate-400 bg-slate-950">
    <div class="border-b border-slate-400 px-4 py-2.5">
      <p class="text-xs font-semibold tracking-wide text-slate-100">main.journal</p>
    </div>
    <div class="divide-y divide-slate-800/40">
      {#each p.context as row}
        <div class="flex gap-0 {row.isErrorLine ? 'bg-rose-950/30' : ''}">
          <span class="w-12 shrink-0 select-none border-r border-slate-400/60 px-3 py-2 text-right font-mono text-xs {row.isErrorLine ? 'text-rose-500' : 'text-slate-100'}">
            {row.number}
          </span>
          <pre class="flex-1 overflow-x-auto px-4 py-2 font-mono text-sm leading-relaxed {row.isErrorLine ? 'text-rose-200' : 'text-slate-100'} whitespace-pre">{row.text}</pre>
        </div>
      {/each}
    </div>
  </div>

  <!-- Balance assertion fix -->
  {#if p.type === 'balance-assertion' && p.actualBalance}
    <div class="mb-5 rounded-xl border border-slate-400 bg-slate-900 p-5">
      <p class="mb-4 text-xs font-semibold tracking-wide text-slate-100">ACCOUNT</p>
      <p class="mb-4 font-mono text-sm text-slate-100">{p.account}</p>
      <div class="mb-4 grid grid-cols-2 gap-4">
        <div>
          <p class="mb-1 text-xs font-semibold tracking-wide text-slate-100">Asserted</p>
          <p class="font-mono text-sm text-rose-400">{p.assertedBalance}</p>
        </div>
        <div>
          <p class="mb-1 text-xs font-semibold tracking-wide text-slate-100">Actual</p>
          <p class="font-mono text-sm text-emerald-400">{p.actualBalance}</p>
        </div>
      </div>
      {#if form?.error}
        <p class="mb-3 text-sm text-rose-400">{form.error}</p>
      {/if}
      <form method="POST" action="?/fixAssertion" use:enhance={() => {
        fixing = true;
        return async ({ update }) => { fixing = false; await update(); };
      }}>
        <input type="hidden" name="line" value={p.line} />
        <input type="hidden" name="actual" value={p.actualBalance} />
        <button
          type="submit"
          disabled={fixing}
          class="rounded-md bg-blue-300/10 px-4 py-2 text-sm font-medium text-blue-500 transition-colors hover:bg-blue-300/20 disabled:opacity-40"
        >
          {fixing ? 'Fixing…' : `Update assertion to ${p.actualBalance}`}
        </button>
      </form>
    </div>
  {/if}

  <!-- Full error message -->
  <details class="group">
    <summary class="mb-2 cursor-pointer list-none text-xs font-semibold tracking-wide text-slate-100 hover:text-slate-100">
      Full error ▸
    </summary>
    <pre class="rounded-xl border border-slate-400 bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-100 overflow-x-auto whitespace-pre-wrap">{data.raw}</pre>
  </details>
{/if}
