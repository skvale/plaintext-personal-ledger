<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import Combobox from '$lib/components/Combobox.svelte';
  import LearningBanner from '$lib/components/LearningBanner.svelte';
  import { page } from '$app/stores';
  import { parseCommodity, formatAmount } from '$lib/format.js';
  import Amount from '$lib/components/Amount.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let statementBalance = $state('');
  let toggling = $state<number | null>(null);
  let showCleared = $state(false);

  let prevAccount = $state('');
  $effect(() => {
    if (data.account !== prevAccount) {
      prevAccount = data.account;
      statementBalance = '';
    }
  });

  const isLiability = $derived(data.account.startsWith('liabilities:'));
  const clearedBalance = $derived(data.clearedBalance as number);

  // Work in "statement space": liabilities shown as positive (what you owe)
  const displayCleared = $derived(isLiability ? Math.abs(clearedBalance) : clearedBalance);

  const target = $derived((() => {
    const n = parseFloat(statementBalance.replace(/[$,]/g, ''));
    if (isNaN(n)) return null;
    return n;
  })());
  const diff = $derived(target !== null ? target - displayCleared : null);
  const reconciled = $derived(diff !== null && Math.abs(diff) < 0.005);

  const cleared = $derived(
    (data.transactions as any[])
      .filter((t) => t.status === 'cleared')
      .sort((a, b) => b.date.localeCompare(a.date))
  );
  const uncleared = $derived((data.transactions as any[]).filter((t) => t.status !== 'cleared'));

  const commodityFmt = $derived(parseCommodity($page.data.commodity ?? '$1,000.00'));
  const roundAmounts = $derived($page.data.settings?.display?.roundAmounts === true);
  const displayFmt = $derived(roundAmounts ? { ...commodityFmt, decimals: 0 } : commodityFmt);
  const showSymbol = $derived($page.data.settings?.display?.showCurrencySymbol !== false);
  function fmt(n: number) {
    const full = formatAmount(n, displayFmt);
    if (showSymbol) return full;
    return full.replace(displayFmt.symbol, '');
  }


  function fmtShort(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function amtColor(n: number) {
    return n >= 0 ? 'text-emerald-400' : 'text-rose-400';
  }

  // For liability rows: flip sign so charges show as positive (money spent) and payments as negative (money paid)
  function displayAmount(n: number) {
    return isLiability ? -n : n;
  }

  function toggleEnhance(tindex: number) {
    toggling = tindex;
    return async ({ update }: any) => {
      toggling = null;
      await update();
    };
  }

  function selectAccount(val: string) {
    goto(val ? `/reconcile?account=${encodeURIComponent(val)}` : '/reconcile', { replaceState: true });
  }
</script>

<LearningBanner id="reconcile" title="Matching your bank">
  <strong>Reconciling</strong> is a quick sanity check: does the balance in your records match what your bank says?
  If they don't match, something was missed or entered wrong. Do this once a month and you'll catch mistakes early.
</LearningBanner>

<div class="mb-6">
  <h1 class="text-xl font-semibold text-slate-100">Reconcile</h1>
  <p class="mt-0.5 text-sm text-slate-100">Match your journal against a bank or card statement.</p>
</div>

{#if data.reconcilableAccounts.length === 0}
  <div class="rounded-xl border border-slate-400 bg-slate-900 px-6 py-12 text-center">
    <p class="text-lg text-slate-100">No accounts to reconcile</p>
    <p class="mt-2 text-sm text-slate-100">
      Import a bank statement or add transactions first — accounts with transactions will appear here.
    </p>
  </div>
{:else}
<!-- Account picker -->
<div class="mb-5 flex flex-col gap-1.5">
  <span class="text-xs font-semibold tracking-wide text-slate-100">Account</span>
  <div class="w-72">
    <Combobox
      items={data.reconcilableAccounts}
      value={data.account}
      placeholder="Choose account…"
      onchange={(v) => selectAccount(v ?? '')}
      inputClass="w-full rounded-lg border border-slate-300 bg-slate-900 px-3 pr-8 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-100 focus:border-blue-300"
    />
  </div>
</div>

{#if data.account}
  <!-- Status bar -->
  <div class="mb-5 overflow-hidden rounded-xl border border-slate-400 bg-slate-900">
    <div class="flex items-center gap-6 px-5 py-4">
      <div class="flex flex-col gap-0.5">
        <span class="text-xs font-semibold tracking-wide text-slate-100">Cleared balance{isLiability ? ' (owed)' : ''}</span>
        <span class="font-mono text-lg font-medium {isLiability ? 'text-rose-400' : amtColor(displayCleared)}"><Amount value={displayCleared} /></span>
      </div>

      <div class="h-8 w-px bg-slate-800"></div>

      <div class="flex flex-col gap-0.5">
        <label for="statement-bal" class="text-xs font-semibold tracking-wide text-slate-100">Statement balance</label>
        <input id="statement-bal" type="text" bind:value={statementBalance} placeholder="e.g. 1,234.56"
          class="w-32 rounded-lg border border-slate-300 bg-slate-900 px-2 py-1 font-mono text-sm text-slate-100 outline-none focus:border-blue-300" />
        {#if isLiability}
          <span class="text-xs text-slate-100">Enter as shown on statement</span>
        {/if}
      </div>

      {#if diff !== null}
        <div class="h-8 w-px bg-slate-800"></div>
        <div class="flex flex-col gap-0.5">
          <span class="text-xs font-semibold tracking-wide text-slate-100">Difference</span>
          <span class="font-mono text-lg font-medium {reconciled ? 'text-emerald-400' : 'text-amber-400'}">
            {#if reconciled}✓ balanced{:else}<Amount value={diff} />{/if}
          </span>
        </div>
      {/if}

      <div class="ml-auto text-xs text-slate-100">
        {cleared.length} cleared · {uncleared.length} uncleared
      </div>
    </div>
  </div>

  <!-- Uncleared -->
  {#if uncleared.length > 0}
    <div class="mb-4 overflow-hidden rounded-xl border border-slate-400 bg-slate-900">
      <div class="border-b border-slate-400 px-5 py-3">
        <p class="text-xs font-semibold tracking-wide text-slate-100">Uncleared ({uncleared.length})</p>
      </div>
      <div class="divide-y divide-slate-800/40">
        {#each uncleared as tx}
          {@const txHref = (tx.txid || tx.tindex) ? `/tx/${tx.txid ?? tx.tindex}?ref=${encodeURIComponent($page.url.pathname + $page.url.search)}` : undefined}
          <div class="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-slate-800/30">
            <span class="w-14 shrink-0 font-mono text-sm text-slate-100">{fmtShort(tx.date)}</span>
            <a href={txHref} class="flex-1 text-sm text-slate-100 hover:text-slate-100 transition-colors">{tx.description}</a>
            <span class="shrink-0 font-mono text-sm {amtColor(displayAmount(tx.amount))}"><Amount value={displayAmount(tx.amount)} /></span>
            <form method="POST" action="?/toggle" use:enhance={() => toggleEnhance(tx.tindex)}>
              <input type="hidden" name="tindex" value={tx.tindex} />
              <input type="hidden" name="cleared" value="true" />
              <input type="hidden" name="account" value={data.account} />
              <button type="submit" disabled={toggling === tx.tindex}
                class="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-100 transition-colors hover:border-emerald-500/50 hover:text-emerald-400 disabled:opacity-40">
                {toggling === tx.tindex ? '…' : 'Clear'}
              </button>
            </form>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="mb-4 rounded-xl border border-slate-400 bg-slate-900 px-5 py-4">
      <p class="text-sm text-slate-100">No uncleared transactions.</p>
    </div>
  {/if}

  <!-- Cleared -->
  {#if cleared.length > 0}
    <div class="overflow-hidden rounded-xl border border-slate-400 bg-slate-900">
      <button
        type="button"
        onclick={() => (showCleared = !showCleared)}
        class="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-slate-800/30"
      >
        <span class="text-xs font-semibold tracking-wide text-slate-100">Cleared ({cleared.length})</span>
        <span class="text-xs text-slate-100">{showCleared ? 'hide' : 'show'}</span>
      </button>
      {#if showCleared}
        <div class="divide-y divide-slate-800/40 border-t border-slate-400">
          {#each cleared as tx}
            {@const txHref = (tx.txid || tx.tindex) ? `/tx/${tx.txid ?? tx.tindex}?ref=${encodeURIComponent($page.url.pathname + $page.url.search)}` : undefined}
            <div class="flex items-center gap-4 px-5 py-3 opacity-60 transition-opacity hover:opacity-100">
              <span class="w-14 shrink-0 font-mono text-sm text-slate-100">{fmtShort(tx.date)}</span>
              <a href={txHref} class="flex-1 text-sm text-slate-100 hover:text-slate-100 transition-colors">{tx.description}</a>
              <span class="shrink-0 font-mono text-sm {amtColor(displayAmount(tx.amount))}"><Amount value={displayAmount(tx.amount)} /></span>
              <span class="text-xs text-emerald-600">✓</span>
              <form method="POST" action="?/toggle" use:enhance={() => toggleEnhance(tx.tindex)}>
                <input type="hidden" name="tindex" value={tx.tindex} />
                <input type="hidden" name="cleared" value="false" />
                <input type="hidden" name="account" value={data.account} />
                <button type="submit" disabled={toggling === tx.tindex}
                  class="text-xs text-slate-100 transition-colors hover:text-slate-100 disabled:opacity-40">
                  undo
                </button>
              </form>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  {#if form?.error}
    <p class="mt-3 text-sm text-rose-400">{form.error}</p>
  {/if}
{/if}
{/if}
