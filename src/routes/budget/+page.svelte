<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import Combobox from '$lib/components/Combobox.svelte';
  import LearningBanner from '$lib/components/LearningBanner.svelte';
  import { accountTail, accountColor } from '$lib/account-colors.js';
  import AccountBadge from '$lib/components/AccountBadge.svelte';
  import { page } from '$app/stores';
  import { parseCommodity, formatAmount } from '$lib/format.js';
  import Amount from '$lib/components/Amount.svelte';

  function focus(el: HTMLElement) {
    el.focus();
  }

  let { data, form } = $props();

  let newAccount = $state('');
  let newAmount = $state('');
  let addError = $state('');

  $effect(() => { if (form?.error) addError = form.error; });
  let editingAccount = $state<string | null>(null);
  let editAmount = $state('');

  const periods = [
    { value: 'thismonth', label: 'This month' },
    { value: 'lastmonth', label: 'Last month' },
    { value: 'ytd', label: 'Year to date' }
  ];

  const commodityFmt = $derived(parseCommodity($page.data.commodity ?? '$1,000.00'));
  const roundAmounts = $derived($page.data.settings?.display?.roundAmounts === true);
  const displayFmt = $derived(roundAmounts ? { ...commodityFmt, decimals: 0 } : commodityFmt);
  const showSymbol = $derived($page.data.settings?.display?.showCurrencySymbol !== false);
  function fmt(n: number) {
    const full = formatAmount(n, displayFmt);
    if (showSymbol) return full;
    return full.replace(displayFmt.symbol, '');
  }

  function pct(actual: number, budget: number) {
    if (budget <= 0) return 0;
    return Math.min(100, Math.round((actual / budget) * 100));
  }

  function barColor(actual: number, budget: number) {
    const p = actual / budget;
    if (p >= 1) return 'bg-rose-500';
    if (p >= 0.85) return 'bg-amber-500';
    return 'bg-blue-300';
  }

  function startEdit(account: string, current: number) {
    editingAccount = account;
    editAmount = String(current);
  }

  const totalBudget = $derived(
    data.budgetStatus.reduce((s: number, b: any) => s + b.budget, 0)
  );
  const totalActual = $derived(
    data.budgetStatus.reduce((s: number, b: any) => s + b.actual, 0)
  );

  const budgetedAccounts = $derived(new Set(data.entries.map((e: any) => e.account)));
  const expenseAccounts = $derived(
    data.accounts.filter((a: string) => a.startsWith('expenses:') && !budgetedAccounts.has(a))
  );
</script>

<LearningBanner id="budget" title="Spending limits">
  Set spending limits for each category — like $600 for groceries or $200 for dining out — and see how you're
  tracking against them. The goal isn't to be perfect, it's to notice patterns before they become problems.
</LearningBanner>

<div class="mb-6 flex items-center justify-between">
  <h1 class="text-xl font-semibold text-slate-100">Budget</h1>
  <div class="flex gap-1">
    {#each periods as p}
      <button
        onclick={() => goto(`/budget?period=${p.value}`, { replaceState: true })}
        class="rounded-md border border-slate-300 bg-slate-900 px-2.5 py-1 text-sm transition-colors
          {data.period === p.value ? 'border-blue-300/50 text-blue-500' : 'text-slate-100 hover:border-slate-400 hover:text-slate-100'}"
      >{p.label}</button>
    {/each}
  </div>
</div>

{#if data.budgetStatus.length === 0}
  <div class="mb-6 rounded-xl border border-slate-400 bg-slate-900 py-16 text-center">
    <p class="mb-2 text-2xl">◎</p>
    <p class="text-sm font-medium text-slate-100">No budgets set</p>
    <p class="mt-1 text-xs text-slate-100">Add an account below to start tracking.</p>
  </div>
{:else}
  <!-- Summary -->
  <div class="mb-5 grid grid-cols-3 gap-3">
    {#each [
      { label: 'Total Budget', value: fmt(totalBudget), color: 'text-slate-100' },
      { label: 'Spent', value: fmt(totalActual), color: totalActual > totalBudget ? 'text-rose-400' : 'text-slate-100' },
      { label: 'Remaining', value: fmt(totalBudget - totalActual), color: totalBudget - totalActual < 0 ? 'text-rose-400' : 'text-emerald-400' }
    ] as stat}
      <div class="rounded-xl border border-slate-400 bg-slate-900 p-4">
        <p class="mb-2 text-xs font-semibold tracking-wide text-slate-100">{stat.label}</p>
        <p class="font-mono text-xl font-medium {stat.color}">{stat.value}</p>
      </div>
    {/each}
  </div>

  <!-- Budget rows -->
  <div class="mb-6 flex flex-col gap-2">
    {#each data.budgetStatus as b}
      <div class="rounded-xl border border-slate-400 bg-slate-900 p-4">
        <div class="mb-3 flex items-center justify-between gap-4">
          <div class="min-w-0 flex-1">
            <div class="flex items-center min-w-0">
              <AccountBadge account={b.account} />
              <p class="truncate font-mono text-sm {accountColor(b.account)}">{accountTail(b.account)}</p>
            </div>
          </div>
          <div class="flex items-center gap-4">
            <span class="text-sm {b.actual > b.budget ? 'text-rose-400' : 'text-slate-100'}">
              <Amount value={b.actual} />
            </span>
            <span class="text-sm text-slate-100">/</span>
            {#if editingAccount === b.account}
              <form
                method="POST"
                action="?/set"
                use:enhance={() => async ({ update }) => { editingAccount = null; await update(); }}
                class="flex items-center gap-1.5"
              >
                <input type="hidden" name="account" value={b.account} />
                <input
                  type="text"
                  name="amount"
                  bind:value={editAmount}
                  class="w-24 rounded border border-blue-300 bg-slate-900 px-2 py-1 font-mono text-sm text-slate-100 outline-none"
                  use:focus
                />
                <button type="submit" class="text-sm text-blue-500 hover:underline">Save</button>
                <button type="button" onclick={() => editingAccount = null} class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-slate-300 text-sm text-slate-100 transition-colors hover:border-slate-400 hover:text-slate-100">×</button>
              </form>
            {:else}
              <button
                onclick={() => startEdit(b.account, b.budget)}
                class="font-mono text-sm text-slate-100 hover:text-slate-100 transition-colors"
                title="Edit budget"
              ><Amount value={b.budget} /></button>
            {/if}

            <form method="POST" action="?/remove" use:enhance>
              <input type="hidden" name="account" value={b.account} />
              <button
                type="submit"
                class="rounded px-2 py-0.5 text-sm text-slate-100 transition-colors hover:bg-rose-900/40 hover:text-rose-400"
                title="Remove budget"
              >Remove</button>
            </form>
          </div>
        </div>

        <!-- Progress bar -->
        <div class="h-2 overflow-hidden rounded-full bg-slate-800">
          <div
            class="h-full rounded-full transition-all {barColor(b.actual, b.budget)}"
            style="width: {pct(b.actual, b.budget)}%"
          ></div>
        </div>
        <div class="mt-1.5 flex justify-between">
          <span class="text-xs text-slate-100">{pct(b.actual, b.budget)}% used</span>
          {#if b.actual > b.budget}
            <span class="text-xs font-medium text-rose-400">over by <Amount value={b.actual - b.budget} /></span>
          {:else}
            <span class="text-xs text-slate-100"><Amount value={b.budget - b.actual} /> left</span>
          {/if}
        </div>
      </div>
    {/each}
  </div>
{/if}


<!-- Add budget -->
<div class="rounded-xl border border-slate-400 bg-slate-900 p-5">
  <p class="mb-4 text-xs font-semibold tracking-wide text-slate-100">Add Budget Account</p>
  <form
    method="POST"
    action="?/set"
    use:enhance={() => async ({ result, update }) => { if (result.type === 'success') { newAccount = ''; newAmount = ''; addError = ''; } await update(); }}
    class="flex gap-2"
  >
    <div class="flex-1">
      <Combobox
        items={expenseAccounts}
        value={newAccount}
        name="account"
        placeholder=""
        onchange={(v) => { newAccount = v ?? ''; addError = ''; }}
        inputClass="w-full rounded-lg border border-slate-300 bg-slate-900 px-3 pr-8 py-2 font-mono text-sm text-slate-100 outline-none placeholder:text-slate-100 focus:border-blue-300"
      />
    </div>
    <input
      type="text"
      name="amount"
      placeholder=""
      bind:value={newAmount}
      oninput={() => { addError = ''; }}
      class="w-28 rounded-lg border border-slate-300 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 outline-none placeholder:text-slate-100 focus:border-blue-300"
    />
    <button
      type="submit"
      disabled={!newAccount || !newAmount}
      class="btn-primary disabled:opacity-40"
    >Add</button>
  </form>
  {#if addError}
    <p class="mt-2 text-sm text-rose-400">{addError}</p>
  {/if}
</div>

