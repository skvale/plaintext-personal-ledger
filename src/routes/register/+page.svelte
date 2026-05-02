<script lang="ts">
  import { page } from '$app/stores';
  import type { PageData } from './$types';
  import { goto } from '$app/navigation';
  import Combobox from '$lib/components/Combobox.svelte';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import LearningBanner from '$lib/components/LearningBanner.svelte';
  import PeriodStepper from '$lib/components/PeriodStepper.svelte';
  import { accountColor, accountDotClass, accountSortKey, amountColor } from '$lib/account-colors.js';
  import AccountLabel from '$lib/components/AccountLabel.svelte';
  import { parseCommodity, formatAmount } from '$lib/format.js';
  import Amount from '$lib/components/Amount.svelte';

  let { data }: { data: PageData } = $props();

  let account = $state<string>('');
  let query = $state<string>('');
  let from = $state<string>('');
  let to = $state<string>('');
  let currentPage = $state(Number($page.url.searchParams.get('page')) || 1);

  $effect(() => {
    account = data.account;
    query = data.query;
    from = data.from;
    to = data.to;
    currentPage = Number($page.url.searchParams.get('page')) || 1;
  });
  const pageSize = 100;

  const pageCount = $derived(Math.max(1, Math.ceil(data.transactions.length / pageSize)));
  const paginated = $derived(
    [...data.transactions]
      .reverse()
      .slice((currentPage - 1) * pageSize, currentPage * pageSize)
  );


  function applyFilters(replace = false) {
    // If the query matches an account name, use the account filter instead
    if (query && !account) {
      const q = query.toLowerCase();
      const match = data.accounts.find(a => a.toLowerCase().includes(q));
      if (match) {
        account = match;
        query = '';
      }
    }

    const params = new URLSearchParams();
    if (account) params.set('account', account);
    if (query) params.set('q', query);
    params.set('from', from);
    if (to) params.set('to', to);
    goto(`/register?${params.toString()}`, { replaceState: replace, keepFocus: true });
  }

  function clearFilters() {
    account = '';
    query = '';
    currentPage = 1;
    periodMode = 'all';
    periodAnchor = { year: new Date().getFullYear(), month: new Date().getMonth() };
    from = '';
    to = '';
    goto('/register', { replaceState: true });
  }

  function goToPage(p: number) {
    const url = new URL($page.url);
    if (p <= 1) url.searchParams.delete('page');
    else url.searchParams.set('page', String(p));
    goto(url.toString(), { replaceState: true, keepFocus: true, noScroll: true });
  }

  type PeriodMode = 'month' | 'year' | 'all';

  // Derive period mode and anchor from URL params
  function initPeriod(): { mode: PeriodMode; anchor: { year: number; month: number } } {
    const f = data.from;
    const t = data.to;
    if (!f && !t) return { mode: 'all', anchor: { year: new Date().getFullYear(), month: new Date().getMonth() } };
    if (f) {
      const d = new Date(f + 'T00:00:00');
      const anchor = { year: d.getFullYear(), month: d.getMonth() };
      // Check if it's a year range: from=YYYY-01-01, to=YYYY+1-01-01
      if (f.endsWith('-01-01') && t === `${anchor.year + 1}-01-01`) {
        return { mode: 'year', anchor };
      }
      return { mode: 'month', anchor };
    }
    return { mode: 'all', anchor: { year: new Date().getFullYear(), month: new Date().getMonth() } };
  }

  const initial = initPeriod();
  let periodMode = $state<PeriodMode>(initial.mode);
  let periodAnchor = $state<{ year: number; month: number }>(initial.anchor);

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const fmtDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  function setPeriodMode(mode: PeriodMode) {
    periodMode = mode;
    if (mode === 'all') {
      from = '';
      to = '';
      applyFilters();
      return;
    }
    const now = new Date();
    periodAnchor = { year: now.getFullYear(), month: now.getMonth() };
    applyPeriod();
  }

  function navigatePeriod(delta: number) {
    if (periodMode === 'month') {
      let m = periodAnchor.month + delta;
      let y = periodAnchor.year;
      while (m < 0) { m += 12; y--; }
      while (m > 11) { m -= 12; y++; }
      periodAnchor = { year: y, month: m };
    } else if (periodMode === 'year') {
      periodAnchor = { year: periodAnchor.year + delta, month: periodAnchor.month };
    }
    applyPeriod();
  }

  function showThisMonth() {
    periodMode = 'month';
    const now = new Date();
    periodAnchor = { year: now.getFullYear(), month: now.getMonth() };
    applyPeriod();
  }

  function applyPeriod() {
    if (periodMode === 'month') {
      from = fmtDate(new Date(periodAnchor.year, periodAnchor.month, 1));
      to = fmtDate(new Date(periodAnchor.year, periodAnchor.month + 1, 1));
    } else if (periodMode === 'year') {
      from = `${periodAnchor.year}-01-01`;
      to = `${periodAnchor.year + 1}-01-01`;
    }
    applyFilters();
  }

  const periodLabel = $derived.by(() => {
    if (periodMode === 'all') return 'All time';
    if (periodMode === 'year') return String(periodAnchor.year);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[periodAnchor.month]} ${periodAnchor.year}`;
  });

  const hasFilters = $derived(!!(account || query || from || to));

  let debounceTimer: ReturnType<typeof setTimeout>;
  function debounceSearch() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      // Only apply if we're still on the register page
      if ($page.url.pathname === '/register') applyFilters();
    }, 400);
  }

  // For expenses: sum of matching postings. For assets/liabilities: current balance.
  const isBalanceAccount = $derived(
    account.startsWith('assets') || account.startsWith('liabilities')
  );

  const filteredTotal = $derived(
    data.transactions.reduce((sum, txn) => {
      const matchingPostings = account
        ? txn.postings.filter(p => p.account === account || p.account.startsWith(account + ':'))
        : txn.postings.filter(p => p.account.startsWith('expenses'));
      return sum + matchingPostings.reduce((s, p) => s + Math.abs(p.amount), 0);
    }, 0)
  );

  // Running balance from last transaction (only meaningful when filtering by account)
  const currentBalance = $derived(
    data.transactions.length > 0 && account
      ? data.transactions[data.transactions.length - 1].balance ?? 0
      : 0
  );

  const commodityFmt = $derived(parseCommodity($page.data.commodity ?? '$1,000.00'));
  const roundAmounts = $derived($page.data.settings?.display?.roundAmounts === true);
  const displayFmt = $derived(roundAmounts ? { ...commodityFmt, decimals: 0 } : commodityFmt);
  const showSymbol = $derived($page.data.settings?.display?.showCurrencySymbol !== false);
  function fmt(n: number) {
    const full = formatAmount(Math.abs(n), displayFmt);
    if (showSymbol) return full;
    return full.replace(displayFmt.symbol, '');
  }

  function postingPrefix(n: number): string {
    if (n > 0) return '+';
    if (n < 0) return '−';
    return '';
  }

  function fmtDateShort(d: string) {
    const dt = new Date(d + 'T00:00:00');
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Pick the most meaningful posting to surface in table view
  function primaryPosting(txn: import('$lib/types.js').Transaction) {
    const posts = txn.postings.filter(p => !p.account.startsWith('equity'));
    const nonZero = posts.filter(p => p.amount !== 0);
    const pool = nonZero.length > 0 ? nonZero : posts;
    return (
      pool.find(p => p.account.startsWith('expenses')) ??
      pool.find(p => p.account.startsWith('income')) ??
      pool[0]
    );
  }

</script>

<LearningBanner id="register" title="Your transactions">
  This is your transaction list — every time money moves, it shows up here. You can filter by date range,
  search for a vendor, or pick a specific account. Click any row to see the full breakdown of where the money went.
</LearningBanner>

<!-- Header -->
<div class="mb-4 flex items-center justify-between">
  <div class="flex items-baseline gap-3">
    <h1 class="text-xl font-semibold text-slate-100">Register</h1>
    <span class="text-sm text-slate-100">{data.transactions.length} transactions</span>
    {#if hasFilters && account && isBalanceAccount}
      <span class="text-slate-100">·</span>
      <span class="text-sm {currentBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}">{fmt(currentBalance)} <span class="font-sans text-xs text-slate-100">balance</span></span>
    {:else if hasFilters && filteredTotal > 0}
      <span class="text-slate-100">·</span>
      <span class="text-sm text-rose-400">{fmt(filteredTotal)} <span class="font-sans text-xs text-slate-100">{account || 'expenses'}</span></span>
    {/if}
    {#if data.isDefaultView}
      <span class="text-xs text-slate-100">· <button class="underline underline-offset-2 hover:text-slate-100" onclick={showThisMonth}>show this month</button></span>
    {/if}
  </div>
  <div class="flex items-center gap-2">
    <div class="flex items-center gap-1">
      {#each [['month','Month'],['year','Year'],['all','All']] as [mode, label]}
        <button
          onclick={() => setPeriodMode(mode as PeriodMode)}
          class="{periodMode === mode ? 'btn-pill-active' : 'btn-pill'}"
        >{label}</button>
      {/each}
    </div>
    {#if periodMode !== 'all'}
      <PeriodStepper label={periodLabel} onprev={() => navigatePeriod(-1)} onnext={() => navigatePeriod(1)} />
    {/if}
    <button
      class="btn-secondary"
      onclick={clearFilters}
    >
      Clear
    </button>
  </div>
</div>

<!-- Filters -->
<div class="mb-3 flex items-end gap-2">
  <div class="flex min-w-0 flex-1 flex-col gap-1">
    <span class="text-xs font-medium text-slate-100">Description</span>
    <input
      class="w-full rounded-lg border border-slate-300 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-100 focus:border-blue-300"
      type="search"
      placeholder="Search…"
      bind:value={query}
      onkeydown={(e) => { if (e.key === 'Enter') { clearTimeout(debounceTimer); applyFilters(); } }}
      oninput={() => debounceSearch()}
    />
  </div>
  <div class="flex w-56 shrink-0 flex-col gap-1">
    <span class="text-xs font-medium text-slate-100">Account</span>
    <Combobox
      items={data.accounts}
      value={account}
      placeholder="All accounts"
      allowTopLevel
      onchange={(v) => { if (v !== account) { account = v ?? ''; applyFilters(); } }}
      inputClass="w-full rounded-lg border border-slate-300 bg-slate-900 px-3 pr-8 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-100 focus:border-blue-300"
    />
  </div>
  <div class="flex w-40 shrink-0 flex-col gap-1">
    <span class="text-xs font-medium text-slate-100">From</span>
    <DatePicker bind:value={from} onchange={() => { periodMode = 'month'; applyFilters(); }} />
  </div>
  <div class="flex w-40 shrink-0 flex-col gap-1">
    <span class="text-xs font-medium text-slate-100">To</span>
    <DatePicker bind:value={to} onchange={() => { periodMode = 'month'; applyFilters(); }} />
  </div>
</div>


<!-- Transaction groups -->
{#if paginated.length === 0}
  <div class="rounded-xl border border-slate-400 bg-slate-900 py-16 text-center">
    <p class="text-slate-100">No transactions found.</p>
  </div>
{:else}
  <div class="register-table rounded-xl border border-slate-400 [&>:first-child]:rounded-t-[11px] [&>:last-child]:rounded-b-[11px]">
    <!-- Header -->
    <div class="grid grid-cols-[6rem_1fr_1fr_7rem] border-b border-slate-400 bg-slate-900 text-left text-sm">
      <div class="px-3 py-2 font-medium text-slate-100">Date</div>
      <div class="px-3 py-2 font-medium text-slate-100">Description</div>
      <div class="px-3 py-2 font-medium text-slate-100">Account</div>
      <div class="px-3 py-2 font-medium text-slate-100 text-right">Amount</div>
    </div>
    <!-- Rows -->
    {#each paginated as txn}
      {@const isOpening = /opening.balance/i.test(txn.description)}
      {@const docPath = txn.tindex !== undefined ? data.docsByTindex[txn.tindex] : undefined}
      {@const pipeIdx = txn.description.indexOf('|')}
      {@const vendor = pipeIdx >= 0 ? txn.description.slice(0, pipeIdx).trim() : txn.description}
      {@const note = pipeIdx >= 0 ? txn.description.slice(pipeIdx + 1).trim() : ''}
      {@const primary = primaryPosting(txn)}
      {@const vis = txn.postings.filter(p => !p.account.startsWith('equity'))}
      {@const tblSorted = vis.length >= 2 ? [...vis].sort((a, b) => accountSortKey(a.account) - accountSortKey(b.account)) : []}
      {@const tblFirst = tblSorted[0] ?? null}
      {@const tblSecond = tblSorted[1] ?? null}
      {@const txHref = (txn.txid || txn.tindex) ? `/tx/${txn.txid ?? txn.tindex}?ref=${encodeURIComponent($page.url.pathname + $page.url.search)}` : ''}
      <a
        href={txHref || undefined}
        class="group grid grid-cols-[6rem_1fr_1fr_7rem] items-center border-b border-slate-400/60 last:border-0 transition-colors cursor-pointer text-sm no-underline
          bg-slate-900 hover:bg-slate-800/50"
      >
        <div class="px-3 py-2 text-[11.5px] text-slate-100 whitespace-nowrap">{fmtDateShort(txn.date)}</div>
        <div class="px-3 py-2 min-w-0">
          <div class="flex items-center gap-2 min-w-0">
            <div class="min-w-0 flex-1 flex flex-col justify-center" style="height: 2.25rem;">
              {#if note}
                <p class="flex items-center gap-1.5 leading-tight">
                  <span class="truncate font-medium text-slate-100">{vendor}</span>
                  {#if txn.isBill}
                    <span class="shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium {txn.billPaid ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}">{txn.billPaid ? 'Paid' : 'Unpaid'}</span>
                  {/if}
                  {#if docPath}
                    {@const docName = docPath.split('/').pop() ?? docPath}
                    <span
                      class="group/doc relative shrink-0 flex items-center rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-100 transition-colors hover:border-blue-300/40 hover:text-blue-500"
                      onclick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(`/docs/file?p=${encodeURIComponent(docPath)}`, '_blank'); }}
                      onkeydown={() => {}}
                      role="button"
                      tabindex="-1"
                    >📎
                      <span class="tooltip-caret pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded border border-slate-300 bg-slate-900 px-2 py-1 text-xs text-slate-100 opacity-0 shadow-lg transition-opacity group-hover/doc:opacity-100" style="--caret-left: calc(50% - 6px)">{docName}</span>
                    </span>
                  {/if}
                </p>
                <p class="truncate text-xs leading-tight text-slate-100">{note}</p>
              {:else}
                <p class="flex items-center gap-1.5">
                  <span class="truncate font-medium text-slate-100">{vendor}</span>
                  {#if txn.isBill}
                    <span class="shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium {txn.billPaid ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}">{txn.billPaid ? 'Paid' : 'Unpaid'}</span>
                  {/if}
                  {#if docPath}
                    {@const docName2 = docPath.split('/').pop() ?? docPath}
                    <span
                      class="group/doc relative shrink-0 flex items-center rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-100 transition-colors hover:border-blue-300/40 hover:text-blue-500"
                      onclick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(`/docs/file?p=${encodeURIComponent(docPath)}`, '_blank'); }}
                      onkeydown={() => {}}
                      role="button"
                      tabindex="-1"
                    >📎
                      <span class="tooltip-caret pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded border border-slate-300 bg-slate-900 px-2 py-1 text-xs text-slate-100 opacity-0 shadow-lg transition-opacity group-hover/doc:opacity-100" style="--caret-left: calc(50% - 6px)">{docName2}</span>
                    </span>
                  {/if}
                </p>
              {/if}
            </div>
          </div>
        </div>
        <div class="px-3 py-2 min-w-0">
          {#if tblFirst && tblSecond}
            <!-- Two+ postings: stacked with badge + account -->
            <div class="group/acct relative flex flex-col gap-0.5 min-w-0">
              <div class="min-w-0"><AccountLabel account={tblFirst.account} badgeSize="xs" /></div>
              <div class="flex items-center gap-1 min-w-0">
                <AccountLabel account={tblSecond.account} badgeSize="xs" />
                {#if vis.length > 2}
                  <span class="shrink-0 text-xs text-slate-100">+{vis.length - 2}</span>
                {/if}
              </div>
              <div class="tooltip-caret pointer-events-none absolute bottom-full left-0 mb-1.5 rounded border border-slate-300 bg-slate-900 px-2.5 py-1.5 shadow-lg opacity-0 transition-opacity group-hover/acct:opacity-100 z-20">
                {#each [...txn.postings].sort((a, b) => accountSortKey(a.account) - accountSortKey(b.account)) as tp, tpi}
                  <div class="flex items-center gap-1.5 whitespace-nowrap {tpi > 0 ? 'mt-0.5' : ''}">
                    <span class="h-1.5 w-1.5 shrink-0 rounded-full {accountDotClass(tp.account)}"></span>
                    <span class="font-mono text-xs {accountColor(tp.account)}">{tp.account}</span>
                    <span class="ml-auto pl-4 text-xs tabular-nums text-right {amountColor(tp.amount, tp.account)}">{tp.amount < 0 ? '−' : ''}{fmt(tp.amount)}</span>
                  </div>
                {/each}
              </div>
            </div>
          {:else if primary}
            <!-- 1 or 3+ postings: show primary, tooltip for all -->
            <div class="group/acct relative flex items-center gap-1 min-w-0">
              <AccountLabel account={primary.account} badgeSize="xs" />
              {#if vis.length > 1}
                <span class="shrink-0 text-xs text-slate-100">+{vis.length - 1}</span>
              {/if}
              <div class="tooltip-caret pointer-events-none absolute bottom-full left-0 mb-1.5 rounded border border-slate-300 bg-slate-900 px-2.5 py-1.5 shadow-lg opacity-0 transition-opacity group-hover/acct:opacity-100 z-20">
                {#each [...txn.postings].sort((a, b) => accountSortKey(a.account) - accountSortKey(b.account)) as tp, tpi}
                  <div class="flex items-center gap-1.5 whitespace-nowrap {tpi > 0 ? 'mt-0.5' : ''}">
                    <span class="h-1.5 w-1.5 shrink-0 rounded-full {accountDotClass(tp.account)}"></span>
                    <span class="font-mono text-xs {accountColor(tp.account)}">{tp.account}</span>
                    <span class="ml-auto pl-4 text-xs tabular-nums text-right {amountColor(tp.amount, tp.account)}">{tp.amount < 0 ? '−' : ''}{fmt(tp.amount)}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
        <div class="px-3 py-2 text-sm text-right whitespace-nowrap">
          {#if true}
            {@const posPostings = vis.filter(p => p.amount > 0)}
            {@const totalAmt = posPostings.reduce((s, p) => s + p.amount, 0)}
            {@const amtAccount = posPostings.length === 1 ? posPostings[0].account : (primary?.account ?? '')}
            <Amount value={totalAmt} class={amountColor(totalAmt, amtAccount)} />
          {/if}
        </div>
      </a>
    {/each}
  </div>
{/if}

<!-- Pagination -->
{#if pageCount > 1}
  <div class="mt-6 flex items-center justify-end gap-3">
    <button
      class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-100 disabled:opacity-30 hover:not-disabled:border-slate-400 hover:not-disabled:text-slate-100"
      onclick={() => goToPage(currentPage - 1)}
      disabled={currentPage <= 1}
    >← Prev</button>
    <span class="text-sm text-slate-100">{currentPage} / {pageCount}</span>
    <button
      class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-100 disabled:opacity-30 hover:not-disabled:border-slate-400 hover:not-disabled:text-slate-100"
      onclick={() => goToPage(currentPage + 1)}
      disabled={currentPage >= pageCount}
    >Next →</button>
  </div>
{/if}

<style>
  .register-table :global(thead tr:first-child th:first-child) { border-top-left-radius: 11px; }
  .register-table :global(thead tr:first-child th:last-child) { border-top-right-radius: 11px; }
  .register-table :global(tbody tr:last-child td:first-child) { border-bottom-left-radius: 11px; }
  .register-table :global(tbody tr:last-child td:last-child) { border-bottom-right-radius: 11px; }
</style>
