<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import type { ForecastTransaction, RecurringRule } from '$lib/hledger.server.js';
  import LearningBanner from '$lib/components/LearningBanner.svelte';
  import MonthSelector from '$lib/components/MonthSelector.svelte';
  import Combobox from '$lib/components/Combobox.svelte';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { accountTail, accountColor, amountColor } from '$lib/account-colors.js';
  import AccountBadge from '$lib/components/AccountBadge.svelte';
  import { page } from '$app/stores';
  import { parseCommodity, formatAmount } from '$lib/format.js';
  import Amount from '$lib/components/Amount.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // --- Tab state ---
  let activeTab = $state<'forecast' | 'rules'>('forecast');

  // --- Forecast state ---
  const dataMonths = $derived(data.months as number);
  let months = $state(6);
  $effect(() => { months = dataMonths; });

  let editingIdx = $state<number | null>(null);
  let editTx = $state<ForecastTransaction | null>(null);
  let originalTx = $state<ForecastTransaction | null>(null);
  let updateRule = $state(false);
  let materializing = $state(false);

  function startEdit(tx: ForecastTransaction, idx: number) {
    editingIdx = idx;
    editTx = structuredClone(tx);
    originalTx = structuredClone(tx);
    updateRule = false;
  }

  const amountChanged = $derived(
    editTx && originalTx &&
    editTx.postings.some((p, i) => !p.auto && p.amount !== originalTx!.postings[i]?.amount)
  );

  function cancelEdit() { editingIdx = null; editTx = null; }

  const commodityFmt = $derived(parseCommodity($page.data.commodity ?? '$1,000.00'));
  const roundAmounts = $derived($page.data.settings?.display?.roundAmounts === true);
  const displayFmt = $derived(roundAmounts ? { ...commodityFmt, decimals: 0 } : commodityFmt);
  const showSymbol = $derived($page.data.settings?.display?.showCurrencySymbol !== false);
  function fmtCurrency(n: number) {
    const full = formatAmount(Math.abs(n), displayFmt);
    if (showSymbol) return full;
    return full.replace(displayFmt.symbol, '');
  }

  function fmt(n: number) {
    const full = formatAmount(n, displayFmt);
    if (showSymbol) return full;
    return full.replace(displayFmt.symbol, '');
  }

  const forecastTotals = $derived.by(() => {
    let totalExpenses = 0;
    let totalIncome = 0;
    for (const tx of data.transactions) {
      for (const p of tx.postings) {
        if (p.account.startsWith('expenses')) totalExpenses += Math.abs(p.amount);
        else if (p.account.startsWith('income')) totalIncome += Math.abs(p.amount);
      }
    }
    return { totalExpenses, totalIncome, netCashFlow: totalIncome - totalExpenses };
  });

  const projectedNetWorth = $derived(data.netWorth + forecastTotals.netCashFlow);

  const monthlyProjection = $derived.by(() => {
    const map = new Map<string, { income: number; expenses: number; txns: { tx: ForecastTransaction; idx: number }[] }>();
    data.transactions.forEach((tx, idx) => {
      const month = tx.date.slice(0, 7);
      if (!map.has(month)) map.set(month, { income: 0, expenses: 0, txns: [] });
      const entry = map.get(month)!;
      entry.txns.push({ tx, idx });
      for (const p of tx.postings) {
        if (p.account.startsWith('expenses')) entry.expenses += Math.abs(p.amount);
        else if (p.account.startsWith('income')) entry.income += Math.abs(p.amount);
      }
    });

    let running = data.netWorth;
    const result: { month: string; income: number; expenses: number; net: number; projectedBalance: number; txns: { tx: ForecastTransaction; idx: number }[] }[] = [];
    for (const [month, entry] of map) {
      const net = entry.income - entry.expenses;
      running += net;
      result.push({ month, ...entry, net, projectedBalance: running });
    }
    return result;
  });

  const fundingStatus = $derived.by(() => {
    const balances = { ...data.accountBalances };
    const status = new Map<number, { fundingAccount: string; balanceBefore: number; balanceAfter: number; shortfall: boolean }>();

    for (const tx of data.transactions) {
      const idx = data.transactions.indexOf(tx);
      const funding = tx.postings.find(p =>
        p.account.startsWith('assets') || p.account.startsWith('liabilities')
      );
      if (!funding) continue;

      const acct = funding.account;
      const before = balances[acct] ?? 0;
      const after = before + funding.amount;
      const shortfall = acct.startsWith('assets') && after < 0;

      status.set(idx, { fundingAccount: acct, balanceBefore: before, balanceAfter: after, shortfall });
      balances[acct] = after;
    }
    return status;
  });

  const shortfallCount = $derived([...fundingStatus.values()].filter(s => s.shortfall).length);

  const monthlyExpenseRate = $derived(
    forecastTotals.totalExpenses > 0 && data.transactions.length > 0
      ? forecastTotals.totalExpenses / months
      : data.currentMonth.expenses || 0
  );
  const runwayMonths = $derived(
    monthlyExpenseRate > 0 ? Math.floor(data.netWorth / monthlyExpenseRate) : Infinity
  );

  function fmtMonth(ym: string) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function materializeEnhance() {
    materializing = true;
    return async ({ result, update }: any) => {
      materializing = false;
      if (result.type === 'success') { editingIdx = null; editTx = null; }
      await update();
    };
  }

  // --- Rules state ---
  const frequencies = ['monthly', 'weekly', 'yearly', 'quarterly', 'biweekly', 'daily'];

  let rules = $state<RecurringRule[]>([]);
  let rulesDirty = $state(false);
  let rulesSaving = $state(false);

  $effect(() => {
    rules = structuredClone(data.rules);
    rulesDirty = false;
  });

  function markRules() { rulesDirty = true; }

  function deleteRule(id: number) {
    rules = rules.filter((r) => r.id !== id);
    markRules();
  }

  function updateRuleField(id: number, field: keyof RecurringRule, value: any) {
    rules = rules.map((r) => r.id === id ? { ...r, [field]: value } : r);
    markRules();
  }

  function updatePosting(ruleId: number, pi: number, field: 'account' | 'amount', value: string) {
    rules = rules.map((r) => {
      if (r.id !== ruleId) return r;
      const postings = r.postings.map((p, i) => i === pi ? { ...p, [field]: value } : p);
      return { ...r, postings };
    });
    markRules();
  }

  function addPostingToRule(ruleId: number) {
    rules = rules.map((r) =>
      r.id !== ruleId ? r : { ...r, postings: [...r.postings, { account: '', amount: '' }] }
    );
    markRules();
  }

  function removePostingFromRule(ruleId: number, pi: number) {
    rules = rules.map((r) => {
      if (r.id !== ruleId) return r;
      if (r.postings.length <= 2) return r;
      return { ...r, postings: r.postings.filter((_, i) => i !== pi) };
    });
    markRules();
  }

  // New rule form
  interface Posting { account: string; amount: string; }
  let newPostings = $state<Posting[]>([{ account: '', amount: '' }, { account: '', amount: '' }]);
  let addingRule = $state(false);

  $effect(() => { if (form?.ruleSaved) newPostings = [{ account: '', amount: '' }, { account: '', amount: '' }]; });

  function addNewPosting() { newPostings = [...newPostings, { account: '', amount: '' }]; }
  function removeNewPosting(i: number) {
    if (newPostings.length <= 2) return;
    newPostings = newPostings.filter((_, idx) => idx !== i);
  }

  const autoBalanceIdx = $derived(
    newPostings.length >= 2 && newPostings[newPostings.length - 1].amount === '' ? newPostings.length - 1 : -1
  );
  const explicitTotal = $derived(
    newPostings.reduce((sum, p, i) => {
      if (i === autoBalanceIdx) return sum;
      const n = parseFloat(p.amount.replace(/[$,]/g, ''));
      return sum + (isNaN(n) ? 0 : n);
    }, 0)
  );

  function saveRulesEnhance() {
    rulesSaving = true;
    return async ({ result, update }: any) => {
      rulesSaving = false;
      if (result.type === 'success') rulesDirty = false;
      await update();
    };
  }
</script>

<LearningBanner id="forecast" title="Future projections">
  This shows where your money will be in the coming months, based on your recurring bills and income.
  It helps you spot problems early — like your checking account running low before a big payment is due.
  Set up recurring rules in the <strong>Rules</strong> tab to define bills, subscriptions, and paychecks.
</LearningBanner>

<div class="mb-6 flex items-center justify-between">
  <div>
    <h1 class="text-xl font-semibold text-slate-100">Forecast</h1>
    <p class="mt-0.5 text-sm text-slate-100">
      Projecting {months} month{months !== 1 ? 's' : ''} from {data.transactions.length} recurring transaction{data.transactions.length !== 1 ? 's' : ''}
    </p>
  </div>
  {#if activeTab === 'forecast'}
    <MonthSelector value={months} onchange={(n) => { months = n; goto(`/forecast?months=${n}`, { replaceState: true }); }} />
  {/if}
</div>

<!-- Tab bar -->
<div class="mb-5 flex gap-1 rounded-lg border border-slate-400 bg-slate-900 p-1">
  <button
    type="button"
    onclick={() => (activeTab = 'forecast')}
    class="flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors
      {activeTab === 'forecast' ? 'bg-slate-800 text-slate-100' : 'text-slate-100 hover:text-slate-100'}"
  >Forecast</button>
  <button
    type="button"
    onclick={() => (activeTab = 'rules')}
    class="flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors
      {activeTab === 'rules' ? 'bg-slate-800 text-slate-100' : 'text-slate-100 hover:text-slate-100'}"
  >Rules</button>
</div>

{#if activeTab === 'forecast'}
  <!-- ==================== FORECAST TAB ==================== -->

  {#if form?.materialized}
    <div class="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-400">
      Transaction written to journal.
    </div>
  {/if}

  {#if shortfallCount > 0}
    <div class="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
      <strong>{shortfallCount} transaction{shortfallCount !== 1 ? 's' : ''}</strong> may not have enough funds in the source account to cover them. Look for the highlighted rows below.
    </div>
  {/if}

  {#if data.transactions.length === 0}
    <div class="rounded-xl border border-slate-400 bg-slate-900 px-6 py-12 text-center">
      <p class="text-lg text-slate-100">No upcoming transactions</p>
      <p class="mt-2 text-sm text-slate-100">
        Set up bills, subscriptions, or paychecks in the <button type="button" onclick={() => (activeTab = 'rules')} class="text-blue-500 hover:underline">Rules</button> tab and they'll appear here as a preview of what's coming.
      </p>
      <button type="button" onclick={() => { activeTab = 'rules'; addingRule = true; }}
        class="mt-5 btn-pill">
        + New rule
      </button>
    </div>
  {:else}
    <!-- Projection summary -->
    <div class="mb-6 grid grid-cols-4 gap-3">
      <div class="rounded-xl border border-slate-400 bg-slate-900 p-4">
        <p class="mb-2 text-xs font-semibold tracking-wide text-slate-100">Net Worth Now</p>
        <p class="font-mono text-xl font-medium {data.netWorth >= 0 ? 'text-emerald-400' : 'text-rose-400'}">{fmtCurrency(data.netWorth)}</p>
      </div>
      <div class="rounded-xl border border-slate-400 bg-slate-900 p-4">
        <p class="mb-2 text-xs font-semibold tracking-wide text-slate-100">Projected ({months}mo)</p>
        <p class="font-mono text-xl font-medium {projectedNetWorth >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
          {fmtCurrency(projectedNetWorth)}
        </p>
        <p class="mt-1 font-mono text-xs {forecastTotals.netCashFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
          {forecastTotals.netCashFlow >= 0 ? '+' : '−'}{fmtCurrency(forecastTotals.netCashFlow)}
        </p>
      </div>
      <div class="rounded-xl border border-slate-400 bg-slate-900 p-4">
        <p class="mb-2 text-xs font-semibold tracking-wide text-slate-100">Upcoming Expenses</p>
        <p class="font-mono text-xl font-medium text-rose-400">{fmtCurrency(forecastTotals.totalExpenses)}</p>
        {#if forecastTotals.totalIncome > 0}
          <p class="mt-1 font-mono text-xs text-emerald-400">+{fmtCurrency(forecastTotals.totalIncome)} income</p>
        {/if}
      </div>
      <div class="rounded-xl border border-slate-400 bg-slate-900 p-4">
        <p class="mb-2 text-xs font-semibold tracking-wide text-slate-100">Runway</p>
        {#if runwayMonths === Infinity}
          <p class="text-xl font-medium text-emerald-400">∞</p>
        {:else}
          <p class="font-mono text-xl font-medium {runwayMonths < 3 ? 'text-rose-400' : runwayMonths < 6 ? 'text-amber-400' : 'text-emerald-400'}">
            {runwayMonths} month{runwayMonths !== 1 ? 's' : ''}
          </p>
        {/if}
        <p class="mt-1 text-xs text-slate-100">at {fmtCurrency(monthlyExpenseRate)}/mo</p>
      </div>
    </div>

    <!-- Month-by-month projection -->
    <div class="flex flex-col gap-4">
      {#each monthlyProjection as proj}
        <div class="overflow-hidden rounded-xl border border-slate-400 bg-slate-900">
          <div class="flex items-center justify-between border-b border-slate-400 px-5 py-3">
            <p class="text-sm font-semibold text-slate-100">{fmtMonth(proj.month)}</p>
            <div class="flex items-center gap-4 text-sm font-mono">
              {#if proj.income > 0}
                <span class="text-emerald-400">+{fmtCurrency(proj.income)}</span>
              {/if}
              {#if proj.expenses > 0}
                <span class="text-rose-400">−{fmtCurrency(proj.expenses)}</span>
              {/if}
              <span class="text-slate-100">→</span>
              <span class="{proj.projectedBalance >= 0 ? 'text-slate-100' : 'text-rose-400'}">{fmtCurrency(proj.projectedBalance)}</span>
            </div>
          </div>
          <table class="w-full text-sm table-fixed">
            <colgroup>
              <col class="w-24" />
              <col />
              <col />
              <col />
              <col class="w-28" />
            </colgroup>
            <thead>
              <tr class="border-b border-slate-400 text-left">
                <th class="px-3 py-2 text-xs font-medium text-slate-100">Date</th>
                <th class="px-3 py-2 text-xs font-medium text-slate-100">Description</th>
                <th class="px-3 py-2 text-xs font-medium text-slate-100">Account</th>
                <th class="px-3 py-2 text-xs font-medium text-slate-100">Funded by</th>
                <th class="px-3 py-2 text-xs font-medium text-slate-100 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {#each proj.txns as { tx, idx }}
                {#if editingIdx === idx && editTx}
                  <tr class="border-b border-slate-400/60"><td colspan="5" class="px-5 py-4">
                    <div class="mb-3 flex items-center gap-3">
                      <span class="font-mono text-sm text-slate-100">{editTx.date}</span>
                      <span class="text-sm font-medium text-slate-100">{editTx.description || '(recurring)'}</span>
                    </div>
                    <div class="mb-3 flex flex-col gap-2 pl-2">
                      {#each editTx.postings as posting, pi}
                        <div class="flex items-center gap-3">
                          <div class="flex flex-1 items-center">
                            <AccountBadge account={posting.account} />
                            <span class="font-mono text-sm {accountColor(posting.account)}">{accountTail(posting.account)}</span>
                          </div>
                          {#if posting.auto}
                            <span class="w-28 text-right font-mono text-sm text-slate-100">auto</span>
                          {:else}
                            <input
                              type="text"
                              value={fmt(posting.amount)}
                              oninput={(e) => {
                                const v = parseFloat((e.target as HTMLInputElement).value.replace(/[$,]/g, ''));
                                if (!isNaN(v) && editTx) editTx.postings[pi].amount = v;
                              }}
                              class="w-28 rounded border border-slate-300 bg-slate-900 px-2 py-1 text-right font-mono text-sm text-slate-100 outline-none focus:border-blue-300"
                            />
                          {/if}
                        </div>
                      {/each}
                    </div>
                    <form method="POST" action="?/materialize" use:enhance={materializeEnhance} class="flex flex-col gap-2">
                      <input type="hidden" name="transactions" value={JSON.stringify([editTx])} />
                      <input type="hidden" name="updateRule" value={String(updateRule)} />
                      {#if amountChanged}
                        <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-100">
                          <input type="checkbox" bind:checked={updateRule} class="accent-blue-400" />
                          Update recurring rule with new amount
                        </label>
                      {/if}
                      <div class="flex items-center gap-2">
                        <button type="submit" disabled={materializing}
                          class="rounded-md bg-amber-500/20 px-3 py-1.5 text-sm font-semibold text-amber-300 transition-colors hover:bg-amber-500/30 disabled:opacity-40">
                          {materializing ? 'Saving…' : 'Materialize'}
                        </button>
                        <button type="button" onclick={cancelEdit}
                          class="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-100 hover:text-slate-100">
                          Cancel
                        </button>
                        {#if form?.error}
                          <span class="text-sm text-rose-400">{form.error}</span>
                        {/if}
                      </div>
                    </form>
                  </td></tr>
                {:else}
                  {@const primary = tx.postings.find(p => !p.auto)}
                  {@const fs = fundingStatus.get(idx)}
                  <tr class="border-b border-slate-400/60 last:border-0 transition-colors
                    {fs?.shortfall ? 'bg-rose-500/5 hover:bg-rose-500/10' : 'hover:bg-slate-800/40'}">
                    <td class="px-3 py-2 font-mono text-[11.5px] text-slate-100 whitespace-nowrap">{tx.date}</td>
                    <td class="px-3 py-2 text-sm truncate {fs?.shortfall ? 'text-rose-300' : 'text-slate-100'}">
                      {tx.description || '(recurring)'}
                      {#if fs?.shortfall}
                        <span class="ml-1 text-xs text-rose-400" title="{fs.fundingAccount} will be {fmtCurrency(Math.abs(fs.balanceAfter))} short">⚠</span>
                      {/if}
                    </td>
                    <td class="px-3 py-2 truncate">
                      {#if primary}
                        <span class="inline-flex items-center font-mono text-xs"><AccountBadge account={primary.account} /><span class="{accountColor(primary.account)}">{accountTail(primary.account)}</span></span>
                      {/if}
                    </td>
                    <td class="px-3 py-2 truncate">
                      {#if fs}
                        <div class="flex items-center font-mono text-xs">
                          <AccountBadge account={fs.fundingAccount} />
                          <span class="{accountColor(fs.fundingAccount)}">{accountTail(fs.fundingAccount)}</span>
                        </div>
                        <span class="text-xs {fs.shortfall ? 'text-rose-400' : 'text-slate-100'}">
                          {fs.shortfall ? '⚠ ' : ''}{fmtCurrency(fs.balanceAfter)} after
                        </span>
                      {/if}
                    </td>
                    <td class="px-3 py-2 text-right whitespace-nowrap">
                      {#if primary}
                        <Amount value={primary.amount} class="text-sm {amountColor(primary.amount, primary.account)}" />
                      {/if}
                      {#if tx.date <= new Date().toISOString().slice(0, 10)}
                        <button
                          type="button"
                          onclick={() => startEdit(tx, idx)}
                          class="ml-2 rounded-md border border-slate-300 px-2 py-0.5 text-xs text-slate-100 transition-colors hover:border-amber-500/50 hover:text-amber-400"
                        >Materialize</button>
                      {/if}
                    </td>
                  </tr>
                {/if}
              {/each}
            </tbody>
          </table>
        </div>
      {/each}
    </div>
  {/if}

{:else}
  <!-- ==================== RULES TAB ==================== -->

  <div class="mb-5 flex items-center justify-between">
    <p class="text-sm text-slate-100">
      {rules.length} recurring rule{rules.length !== 1 ? 's' : ''}
    </p>
    <div class="flex items-center gap-2">
      {#if rulesDirty}
        <span class="text-sm text-amber-400">Unsaved changes</span>
        <form method="POST" action="?/saveRules" use:enhance={saveRulesEnhance}>
          <input type="hidden" name="rules" value={JSON.stringify(rules)} />
          <button
            type="submit"
            disabled={rulesSaving}
            class="rounded-md bg-blue-300/10 px-4 py-1.5 text-sm font-medium text-blue-500 transition-colors hover:bg-blue-300/20 disabled:opacity-40"
          >{rulesSaving ? 'Saving…' : 'Save changes'}</button>
        </form>
      {:else if form?.ruleSaved}
        <span class="text-sm text-emerald-400">Saved</span>
      {/if}
      <button
        type="button"
        onclick={() => (addingRule = !addingRule)}
        class="{addingRule ? 'btn-pill-active' : 'btn-pill'}"
      >+ New rule</button>
    </div>
  </div>

  <!-- Add form -->
  {#if addingRule}
    <div class="mb-5 rounded-xl border border-slate-300 bg-slate-900 p-5">
      <p class="mb-4 text-sm font-semibold text-slate-100">New recurring rule</p>
      <form method="POST" action="?/addRule" use:enhance={() => { return async ({ result, update }) => { await update(); if (result.type === 'success') addingRule = false; }; }} class="flex flex-col gap-4">
        <input type="hidden" name="postings" value={JSON.stringify(newPostings)} />

        <div class="grid grid-cols-3 gap-3">
          <div class="flex flex-col gap-1.5">
            <label for="frequency" class="text-xs font-semibold tracking-wide text-slate-100">Frequency</label>
            <select id="frequency" name="frequency" required class="rounded-lg border border-slate-300 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-300">
              {#each frequencies as f}<option value={f}>{f}</option>{/each}
            </select>
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="from" class="text-xs font-semibold tracking-wide text-slate-100">Start date <span class="font-normal text-slate-100">(optional)</span></label>
            <DatePicker name="from" />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="description" class="text-xs font-semibold tracking-wide text-slate-100">Description <span class="font-normal text-slate-100">(optional)</span></label>
            <input id="description" name="description" type="text" placeholder="e.g. Rent, Mortgage" autocomplete="off" class="rounded-lg border border-slate-300 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-100 focus:border-blue-300" />
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <p class="text-xs font-semibold tracking-wide text-slate-100">Postings</p>
          <div class="flex flex-col gap-2">
            {#each newPostings as posting, i}
              <div class="flex items-center gap-2">
                <div class="flex-1">
                  <Combobox
                    items={data.accounts}
                    value={posting.account}
                    placeholder="Account"
                    onchange={(v) => { posting.account = v ?? ''; }}
                    inputClass="w-full rounded-lg border border-slate-300 bg-slate-900 px-3 pr-8 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-100 focus:border-blue-300"
                  />
                </div>
                <input type="text"
                  placeholder={i === autoBalanceIdx ? (explicitTotal !== 0 ? `≈ $${(-explicitTotal).toFixed(2)}` : 'auto') : ''}
                  bind:value={posting.amount}
                  class="w-28 rounded-lg border border-slate-300 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 outline-none placeholder:text-slate-100 focus:border-blue-300" />
                <button type="button" onclick={() => removeNewPosting(i)} disabled={newPostings.length <= 2}
                  title="Remove posting" aria-label="Remove posting"
                  class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-rose-500/30 text-lg text-rose-400 transition-colors hover:border-rose-500/60 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-100 disabled:hover:bg-transparent">×</button>
              </div>
            {/each}
          </div>
          <button type="button" onclick={addNewPosting} class="mt-1 w-full rounded-lg border border-dashed border-slate-300 py-2 text-sm text-slate-100 transition-colors hover:border-blue-300/50 hover:text-blue-500 hover:bg-blue-300/5">+ Add posting</button>
        </div>

        {#if form?.addError}
          <div class="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">{form.addError}</div>
        {/if}

        <div class="flex gap-2">
          <button type="submit" class="btn-primary">Save Rule</button>
          <button type="button" onclick={() => (addingRule = false)} class="btn-cancel">Cancel</button>
        </div>
      </form>
    </div>
  {/if}

  <!-- Rules list -->
  {#if rules.length === 0}
    <div class="rounded-xl border border-slate-400 bg-slate-900 px-6 py-10 text-center text-sm text-slate-100">
      No recurring rules yet.
      <button
        type="button"
        onclick={() => (addingRule = true)}
        class="ml-1 inline-flex items-center rounded-md border border-slate-300 px-2 py-0.5 text-sm text-slate-100 transition-colors hover:border-blue-300/50 hover:text-blue-500"
      >+ New rule</button>
    </div>
  {:else}
    <div class="flex flex-col gap-3">
      {#each rules as rule (rule.id)}
        <div class="overflow-hidden rounded-xl border border-slate-400 bg-slate-900">
          <div class="flex items-center gap-3 border-b border-slate-400 px-5 py-3">
            <select
              value={rule.frequency}
              onchange={(e) => updateRuleField(rule.id, 'frequency', (e.target as HTMLSelectElement).value)}
              class="rounded border border-slate-300 bg-slate-900 px-2 py-1 font-mono text-sm text-blue-500 outline-none focus:border-blue-300"
            >
              {#each frequencies as f}<option value={f}>{f}</option>{/each}
            </select>

            <span class="text-sm text-slate-100">from</span>
            <DatePicker
              bind:value={rule.from}
              onchange={() => updateRuleField(rule.id, 'from', rule.from || undefined)}
            />

            <input
              type="text"
              placeholder="description (optional)"
              value={rule.description ?? ''}
              oninput={(e) => updateRuleField(rule.id, 'description', (e.target as HTMLInputElement).value || undefined)}
              class="flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-100 focus:text-slate-100"
            />

            <button
              type="button"
              onclick={() => deleteRule(rule.id)}
              class="btn-delete"
            >Delete</button>
          </div>

          <div class="divide-y divide-slate-800/40">
            {#each rule.postings as posting, pi}
              <div class="flex items-center gap-2 px-5 py-2.5">
                <div class="flex-1">
                  <Combobox
                    items={data.accounts}
                    value={posting.account}
                    placeholder="Account"
                    onchange={(v) => updatePosting(rule.id, pi, 'account', v ?? '')}
                    inputClass="w-full rounded-lg border border-slate-300 bg-slate-900 px-3 pr-8 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-100 focus:border-blue-300"
                  />
                </div>
                <input
                  type="text"
                  value={posting.amount}
                  placeholder="auto"
                  oninput={(e) => updatePosting(rule.id, pi, 'amount', (e.target as HTMLInputElement).value)}
                  class="w-28 rounded-lg border border-slate-300 bg-slate-900 px-3 py-2 text-right font-mono text-sm text-slate-100 outline-none placeholder:text-slate-100 focus:border-blue-300"
                />
                <button
                  type="button"
                  onclick={() => removePostingFromRule(rule.id, pi)}
                  disabled={rule.postings.length <= 2}
                  title="Remove posting"
                  aria-label="Remove posting"
                  class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-rose-500/30 text-lg text-rose-400 transition-colors hover:border-rose-500/60 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-100 disabled:hover:bg-transparent"
                >×</button>
              </div>
            {/each}
            <div class="px-5 py-2.5">
              <button
                type="button"
                onclick={() => addPostingToRule(rule.id)}
                class="w-full rounded-lg border border-dashed border-slate-300 py-2 text-sm text-slate-100 transition-colors hover:border-blue-300/50 hover:text-blue-500 hover:bg-blue-300/5"
              >+ Add posting</button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if form?.saveError}
    <div class="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">{form.saveError}</div>
  {/if}
{/if}
