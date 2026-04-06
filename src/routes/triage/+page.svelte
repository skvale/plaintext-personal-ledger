<script lang="ts">
  import { enhance } from '$app/forms';
  import type { UncategorizedTxn } from '$lib/types.js';
  import Combobox from '$lib/components/Combobox.svelte';
  import LearningBanner from '$lib/components/LearningBanner.svelte';
  import { page } from '$app/stores';
  import { parseCommodity, formatAmount } from '$lib/format.js';
  import AccountBadge from '$lib/components/AccountBadge.svelte';
  import Amount from '$lib/components/Amount.svelte';

  let { data } = $props();

  // Track per-row state: saving, saved, error
  type RowState = { saving: boolean; saved: boolean; error: string };
  let rowStates = $state<Record<number, RowState>>({});

  // Pre-fill account from suggestions
  let rowAccounts = $state<Record<number, string>>({});
  $effect(() => {
    rowAccounts = Object.fromEntries(
      data.transactions.map((t: UncategorizedTxn) => [
        t.tindex,
        (data.suggestions as Record<string, { account: string; source: string }>)[t.description]?.account ?? ''
      ])
    );
  });

  // Pending bulk apply after a single save
  let pendingBulk = $state<{ description: string; account: string; tindexes: number[] } | null>(null);
  let bulkSaving = $state(false);
  let bulkDone = $state(false);

  function getRowState(tindex: number): RowState {
    return rowStates[tindex] ?? { saving: false, saved: false, error: '' };
  }

  function rowEnhance(tindex: number) {
    rowStates[tindex] = { saving: true, saved: false, error: '' };
    const txn = data.transactions.find((t: UncategorizedTxn) => t.tindex === tindex);

    return async ({ result, update }: any) => {
      if (result.type === 'success') {
        rowStates[tindex] = { saving: false, saved: true, error: '' };

        // Check for other transactions with same description
        if (txn) {
          const account = rowAccounts[tindex];
          const similar = data.transactions.filter(
            (t: UncategorizedTxn) => t.tindex !== tindex && t.description === txn.description
          );
          if (similar.length > 0 && account) {
            pendingBulk = {
              description: txn.description,
              account,
              tindexes: similar.map((t: UncategorizedTxn) => t.tindex)
            };
            bulkDone = false;
          }
        }

        await update();
      } else {
        rowStates[tindex] = {
          saving: false,
          saved: false,
          error: result.data?.error ?? 'Failed'
        };
      }
    };
  }

  const commodityFmt = $derived(parseCommodity($page.data.commodity ?? '$1,000.00'));
  const roundAmounts = $derived($page.data.settings?.display?.roundAmounts === true);
  const displayFmt = $derived(roundAmounts ? { ...commodityFmt, decimals: 0 } : commodityFmt);
  const showSymbol = $derived($page.data.settings?.display?.showCurrencySymbol !== false);
  function fmt(n: number) {
    const full = formatAmount(n, displayFmt);
    if (showSymbol) return full;
    return full.replace(displayFmt.symbol, '');
  }

  function fmtDate(d: string) {
    const dt = new Date(d + 'T00:00:00');
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  let expensesOnly = $state(true);
  const triageAccounts = $derived(
    data.accounts.filter((a: string) =>
      a !== 'expenses:unknown' && (!expensesOnly || a.startsWith('expenses:'))
    )
  );

  // Per-row rule state
  let createRule = $state<Record<number, boolean>>({});
  let rulePatterns = $state<Record<number, string>>({});

  function guessRulesFile(otherAccount: string): string {
    if (/checking/i.test(otherAccount)) {
      return data.rulesFiles.find((f: string) => f.includes('checking')) ?? data.rulesFiles[0] ?? '';
    }
    if (/credit.card/i.test(otherAccount)) {
      return data.rulesFiles.find((f: string) => f.includes('credit')) ?? data.rulesFiles[0] ?? '';
    }
    return data.rulesFiles[0] ?? '';
  }

  let ruleFiles = $state<Record<number, string>>({});

  function isDuplicatePattern(tindex: number): boolean {
    const file = ruleFiles[tindex];
    const pattern = rulePatterns[tindex];
    if (!file || !pattern) return false;
    return (data.rulePatterns[file] ?? []).includes(pattern);
  }

  const suggestions = $derived(
    data.suggestions as Record<string, { account: string; source: 'journal' | 'rule' }>
  );
</script>

<LearningBanner id="triage" title="Categorizing imports">
  When you import a bank statement, some transactions don't have a category yet — they end up here.
  Pick the right account for each one (like "expenses:food" or "expenses:transport") so your reports are accurate.
  You can also create a rule so that vendor gets categorized automatically next time.
</LearningBanner>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-lg font-semibold text-slate-100">Triage</h1>
      <p class="mt-0.5 text-sm text-slate-100">
        {data.transactions.length} unassigned transaction{data.transactions.length === 1
          ? ''
          : 's'}
      </p>
    </div>
    <label class="flex cursor-pointer items-center gap-1.5 text-sm text-slate-100 hover:text-slate-100">
      <input
        type="checkbox"
        class="accent-blue-400"
        bind:checked={expensesOnly}
      />
      Only show <span class="inline-flex"><AccountBadge account="expenses" /></span> accounts
    </label>
  </div>

  <!-- Bulk apply banner -->
  {#if pendingBulk && !bulkDone}
    <div class="rounded-lg border border-blue-800/50 bg-blue-950/30 px-4 py-3 flex items-center justify-between gap-4">
      <div class="min-w-0">
        <p class="text-sm font-medium text-blue-500">
          Apply <span class="font-mono">{pendingBulk.account}</span> to {pendingBulk.tindexes.length} more like this?
        </p>
        <p class="mt-0.5 text-xs text-blue-500/70 truncate">{pendingBulk.description}</p>
      </div>
      <div class="flex shrink-0 gap-2">
        <form
          method="POST"
          action="?/recategorizeMany"
          use:enhance={() => {
            bulkSaving = true;
            return async ({ result, update }: any) => {
              bulkSaving = false;
              if (result.type === 'success') {
                bulkDone = true;
                pendingBulk = null;
                await update();
              }
            };
          }}
        >
          <input type="hidden" name="tindexes" value={JSON.stringify(pendingBulk.tindexes)} />
          <input type="hidden" name="account" value={pendingBulk.account} />
          <button
            type="submit"
            disabled={bulkSaving}
            class="rounded-md bg-blue-300/20 px-3 py-1.5 text-sm font-medium text-blue-500 hover:bg-blue-300/30 disabled:opacity-50 transition-colors"
          >
            {bulkSaving ? '…' : 'Apply all'}
          </button>
        </form>
        <button
          type="button"
          onclick={() => (pendingBulk = null)}
          class="rounded-md px-3 py-1.5 text-sm text-slate-100 hover:text-slate-100 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  {/if}

  {#if data.transactions.length === 0}
    <div class="rounded-lg border border-slate-400 bg-slate-900 py-16 text-center">
      <p class="text-2xl mb-3 text-emerald-500">✓</p>
      <p class="text-sm font-medium text-slate-100">All transactions assigned</p>
      <p class="mt-1 text-xs text-slate-100">Nothing in expenses:unknown</p>
    </div>
  {:else}
    <div class="space-y-2">
      {#each data.transactions as txn (txn.tindex)}
        {@const state = getRowState(txn.tindex)}
        {@const suggestion = suggestions[txn.description]}
        <div
          class="rounded-lg border px-4 py-3 transition-colors
            {state.saved
            ? 'border-emerald-800/40 bg-emerald-950/20'
            : 'border-slate-400 bg-slate-900'}"
        >
          <!-- Top row: date + description + amount -->
          <div class="mb-2.5 flex items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <p class="truncate text-[13.5px] font-medium text-slate-100">
                  {txn.description}
                </p>
                {#if suggestion && !state.saved}
                  <span
                    class="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium {suggestion.source === 'journal'
                      ? 'bg-blue-300/15 text-blue-500'
                      : 'bg-purple-500/15 text-purple-400'}"
                  >
                    {suggestion.source === 'journal' ? 'past entry' : 'rule'}
                  </span>
                {/if}
              </div>
              <p class="mt-0.5 font-mono text-xs text-slate-100">
                {fmtDate(txn.date)} · {txn.otherAccount}
              </p>
            </div>
            <span class="shrink-0 font-mono text-[13.5px] text-rose-400">
              <Amount value={txn.amount} />
            </span>
          </div>

          <!-- Bottom row: account input + save -->
          <form
            method="POST"
            action="?/recategorize"
            use:enhance={() => rowEnhance(txn.tindex)}
            class="space-y-2"
          >
            <input type="hidden" name="tindex" value={txn.tindex} />
            <div class="flex gap-2">
              <div class="relative flex-1">
                <Combobox
                  items={triageAccounts}
                  value={rowAccounts[txn.tindex] ?? ''}
                  onchange={(v) => (rowAccounts[txn.tindex] = v)}
                  name="account"
                  placeholder="expenses:…"
                  disabled={state.saving || state.saved}
                  inputClass="w-full rounded-md border border-slate-300 bg-white dark:bg-slate-800 px-3 pr-8 py-1.5 font-mono text-sm text-slate-900 dark:text-slate-100 outline-none placeholder:text-slate-100 dark:placeholder:text-slate-100 focus:border-blue-300 disabled:opacity-50"
                />
              </div>
              <button
                type="submit"
                disabled={state.saving || state.saved || !rowAccounts[txn.tindex]}
                class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40
                  {state.saved
                  ? 'bg-emerald-600 text-white'
                  : 'bg-blue-300/10 text-blue-500 hover:bg-blue-300/20'}"
              >
                {state.saving ? '…' : state.saved ? '✓ Saved' : 'Save'}
              </button>
            </div>

            <!-- Create rule toggle -->
            <div class="flex items-center gap-2">
              <label class="flex cursor-pointer items-center gap-1.5 text-sm text-slate-100 hover:text-slate-100">
                <input
                  type="checkbox"
                  class="accent-blue-400"
                  checked={!!createRule[txn.tindex]}
                  onchange={(e) => {
                    createRule[txn.tindex] = (e.target as HTMLInputElement).checked;
                    if (createRule[txn.tindex] && !rulePatterns[txn.tindex]) {
                      rulePatterns[txn.tindex] = txn.description.toUpperCase();
                      ruleFiles[txn.tindex] = guessRulesFile(txn.otherAccount);
                    }
                  }}
                  disabled={state.saving || state.saved}
                />
                Also save as import config
              </label>
            </div>

            {#if createRule[txn.tindex] && !state.saved}
              {@const isDupe = isDuplicatePattern(txn.tindex)}
              <div class="flex gap-2 pl-5">
                <div class="relative flex-1">
                  <input
                    type="text"
                    name="pattern"
                    placeholder="PATTERN|ANOTHER"
                    bind:value={rulePatterns[txn.tindex]}
                    class="w-full rounded-md border px-3 py-1.5 font-mono text-sm text-amber-400/80 outline-none placeholder:text-slate-100 focus:border-blue-300
                      {isDupe ? 'border-amber-600 bg-amber-950/20 dark:bg-amber-950/20' : 'border-slate-300 bg-white dark:bg-slate-800'}"
                  />
                  {#if isDupe}
                    <span class="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-amber-500">duplicate</span>
                  {/if}
                </div>
                <select
                  name="rulesFile"
                  bind:value={ruleFiles[txn.tindex]}
                  class="rounded-md border border-slate-300 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-300"
                >
                  {#each data.rulesFiles as f}
                    <option value={f}>{f}</option>
                  {/each}
                </select>
              </div>
              {#if isDupe}
                <p class="pl-5 text-xs text-amber-500/80">This pattern already exists in the selected file — saving will be skipped.</p>
              {/if}
            {/if}
          </form>

          {#if state.error}
            <p class="mt-1.5 text-sm text-rose-400">{state.error}</p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
