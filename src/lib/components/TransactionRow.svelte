<script lang="ts">
  import AccountLabel from '$lib/components/AccountLabel.svelte';
  import Amount from '$lib/components/Amount.svelte';
  import { amountColor, accountSortKey, accountColor, accountDotClass } from '$lib/account-colors.js';
  import { parseCommodity, formatAmount } from '$lib/format.js';
  import { page } from '$app/stores';

  let {
    date,
    description,
    account,
    postings = [],
    amount,
    href,
    signed = false,
  }: {
    date: string;
    description: string;
    account?: string;
    postings?: { account: string; amount: number }[];
    amount: number;
    href?: string;
    signed?: boolean;
  } = $props();

  function fmtDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  const sorted = $derived([...postings].sort((a, b) => accountSortKey(a.account) - accountSortKey(b.account)));
  const posPostings = $derived(postings.filter(p => p.amount > 0));
  const amtAccount = $derived(
    posPostings.length === 1 ? posPostings[0].account
    : posPostings.length > 1 ? (posPostings.find(p => p.account.startsWith('expenses') || p.account.startsWith('income'))?.account ?? posPostings[0].account)
    : (account ?? sorted[0]?.account ?? '')
  );
  const amtColor = $derived(amountColor(amount, amtAccount));

  const commodityFmt = $derived(parseCommodity($page.data.commodity ?? '$1,000.00'));
  const roundAmounts = $derived($page.data.settings?.display?.roundAmounts === true);
  const displayFmt = $derived(roundAmounts ? { ...commodityFmt, decimals: 0 } : commodityFmt);
  const showSymbol = $derived($page.data.settings?.display?.showCurrencySymbol !== false);
  function fmt(n: number) {
    const full = formatAmount(Math.abs(n), displayFmt);
    if (showSymbol) return full;
    return full.replace(displayFmt.symbol, '');
  }
</script>

<a
  {href}
  class="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-slate-800/60"
>
  <span class="w-12 shrink-0 text-xs text-slate-100">{fmtDate(date)}</span>
  <div class="min-w-0 flex-1">
    <p class="truncate text-sm font-medium text-slate-100">{description}</p>
    {#if sorted.length >= 2}
      <div class="group/acct relative flex flex-col gap-0.5 min-w-0">
        <div class="min-w-0 truncate"><AccountLabel account={sorted[0].account} size="xs" /></div>
        <div class="flex items-center gap-1 min-w-0">
          <div class="min-w-0 truncate"><AccountLabel account={sorted[1].account} size="xs" /></div>
          {#if sorted.length > 2}
            <span class="shrink-0 text-xs text-slate-100">+{sorted.length - 2}</span>
          {/if}
        </div>
        <div class="tooltip-caret pointer-events-none absolute bottom-full left-0 mb-1.5 rounded border border-slate-300 bg-slate-900 px-2.5 py-1.5 shadow-lg opacity-0 transition-opacity group-hover/acct:opacity-100 z-20">
          {#each sorted as tp, tpi}
            <div class="flex items-center gap-1.5 whitespace-nowrap {tpi > 0 ? 'mt-0.5' : ''}">
              <span class="h-1.5 w-1.5 shrink-0 rounded-full {accountDotClass(tp.account)}"></span>
              <span class="font-mono text-xs {accountColor(tp.account)}">{tp.account}</span>
              <span class="ml-auto pl-4 text-xs tabular-nums text-right {amountColor(tp.amount, tp.account)}">{tp.amount < 0 ? '−' : ''}{fmt(tp.amount)}</span>
            </div>
          {/each}
        </div>
      </div>
    {:else if account}
      <p class="text-xs"><AccountLabel account={account} size="xs" /></p>
    {/if}
  </div>
  <span class="shrink-0 text-sm">
    <Amount value={amount} class={amtColor} />
  </span>
</a>
