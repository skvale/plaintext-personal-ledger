<script lang="ts">
  import AccountBadge from '$lib/components/AccountBadge.svelte';
  import Amount from '$lib/components/Amount.svelte';
  import { parseCommodity, formatAmount } from '$lib/format.js';
  import { page } from '$app/stores';

  interface Section {
    account: string;            // e.g. 'assets', 'income'
    rows: { name: string; depth: number; amounts: number[] }[];
    totals: number[];
    amountColor: string;        // e.g. 'text-emerald-400'
    totalLabel?: string;        // defaults to 'Total'
  }

  let {
    months,
    sections,
    footer,
    signed = false,
    totalsColumn = true,
  }: {
    months: string[];
    sections: Section[];
    footer?: { label: string; amounts: number[] };
    signed?: boolean;
    totalsColumn?: boolean;
  } = $props();

  const commodityFmt = $derived(parseCommodity($page.data.commodity ?? '$1,000.00'));
  const roundAmounts = $derived($page.data.settings?.display?.roundAmounts === true);
  const displayFmt = $derived(roundAmounts ? { ...commodityFmt, decimals: 0 } : commodityFmt);
  const showSymbol = $derived($page.data.settings?.display?.showCurrencySymbol !== false);
  function fmt(n: number) {
    const full = formatAmount(Math.abs(n), displayFmt);
    if (showSymbol) return full;
    return full.replace(displayFmt.symbol, '');
  }

  function fmtMonth(ym: string) {
    const [y, m] = ym.split('-');
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${names[parseInt(m) - 1]} ${y}`;
  }

  function getAmountColor(account: string, amount: number, defaultColor: string) {
    if (amount === 0) return 'text-slate-500';
    if (account === 'income') return amount < 0 ? 'text-rose-400' : 'text-emerald-400';
    if (account === 'expenses') return amount < 0 ? 'text-emerald-400' : 'text-rose-400';
    return defaultColor;
  }

  // Track expanded state per section
  let expanded = $state<Record<string, boolean>>({});

  function isExpanded(account: string) {
    return expanded[account] ?? true;
  }

  function toggle(account: string) {
    expanded[account] = !isExpanded(account);
  }

  // Track collapsed sub-accounts (keyed by full account name)
  let collapsedSubs = $state<Set<string>>(new Set());

  function toggleSub(name: string) {
    const next = new Set(collapsedSubs);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    collapsedSubs = next;
  }

  function isSubCollapsed(name: string) {
    return collapsedSubs.has(name);
  }

  // A row is hidden if any of its ancestors are collapsed
  function isHidden(name: string): boolean {
    const parts = name.split(':');
    for (let i = 1; i < parts.length - 1; i++) {
      if (collapsedSubs.has(parts.slice(0, i + 1).join(':'))) return true;
    }
    return false;
  }

  const canShowTotals = $derived(totalsColumn && months.length > 1);
  let showTotals = $state(true);
  const visibleTotals = $derived(canShowTotals && showTotals);
  const sum = (amounts: number[]) => amounts.reduce((a, b) => a + b, 0);
</script>

<div class="rounded-xl border border-slate-400 bg-slate-900 overflow-hidden">
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-black/[0.08] dark:border-white/[0.06] text-left">
          <th class="px-5 py-3 font-medium text-slate-100 whitespace-nowrap sticky left-0 bg-slate-900 z-10">Account</th>
          {#each months as month}
            <th class="px-4 py-3 font-medium text-slate-100 text-right whitespace-nowrap">{fmtMonth(month)}</th>
          {/each}
          {#if canShowTotals}
            <th class="px-4 py-3 font-medium text-right whitespace-nowrap border-l border-slate-400/40 cursor-pointer select-none" onclick={() => showTotals = !showTotals}>
              {#if showTotals}
                <span class="text-slate-100 hover:text-slate-400 transition-colors">Total ×</span>
              {:else}
                <span class="text-slate-500 hover:text-slate-100 transition-colors" title="Show totals">∑</span>
              {/if}
            </th>
          {/if}
        </tr>
      </thead>
      <tbody>
        {#each sections as section}
          <!-- Section header (collapsible) -->
          <tr class="border-b border-black/[0.08] dark:border-white/[0.06] cursor-pointer" onclick={() => toggle(section.account)}>
            <td class="px-5 py-2.5 sticky left-0 bg-slate-900 z-10">
              <span class="inline-flex items-center gap-2">
                <svg class="h-4 w-4 text-slate-100 transition-transform {isExpanded(section.account) ? 'rotate-90' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                <AccountBadge account={section.account} />
              </span>
            </td>
            {#if !isExpanded(section.account)}
              {#each section.totals as amount}
                <td class="px-4 py-2.5 text-right font-mono text-sm font-semibold whitespace-nowrap {getAmountColor(section.account, amount, section.amountColor)}"><Amount value={amount} /></td>
              {/each}
              {#if visibleTotals}
                <td class="px-4 py-2.5 text-right font-mono text-sm font-semibold whitespace-nowrap border-l border-slate-400/40 {getAmountColor(section.account, sum(section.totals), section.amountColor)}"><Amount value={sum(section.totals)} /></td>
              {/if}
            {:else}
              {#each months as _}<td></td>{/each}
              {#if visibleTotals}<td class="border-l border-slate-400/40"></td>{/if}
            {/if}
          </tr>

          {#if isExpanded(section.account)}
            {#each section.rows as row}
              {@const parts = row.name.split(':')}
              {@const hasChildren = section.rows.some(r => r.name.startsWith(row.name + ':'))}
              {@const sectionPrefix = section.account + ':'}
              {@const findParent = (pts: string[]): number => {
                for (let i = pts.length - 2; i >= 1; i--) {
                  const parent = sectionPrefix + pts.slice(1, i + 1).join(':');
                  if (section.rows.some(r => r.name === parent)) return i;
                }
                return -1;
              }}
              {@const parentIdx = findParent(parts)}
              {@const parentInData = parentIdx >= 1}
              {@const indent = parentInData ? parentIdx : 0}
              {@const label = parentInData ? parts.slice(parentIdx + 1).join(':') : parts.slice(1).join(':')}
              {#if !isHidden(row.name)}
                <tr class="border-b border-black/[0.08] dark:border-white/[0.06] hover:border-b-slate-500 dark:hover:border-b-slate-500 transition-colors {hasChildren ? 'cursor-pointer' : ''}"
                  onclick={hasChildren ? () => toggleSub(row.name) : undefined}>
                  <td class="px-5 py-2.5 whitespace-nowrap sticky left-0 bg-slate-900 z-10" style="padding-left: {20 + indent * 16}px">
                    <span class="inline-flex items-center gap-1.5">
                      {#if hasChildren}
                        <svg class="h-3 w-3 shrink-0 text-slate-400 transition-transform {isSubCollapsed(row.name) ? '' : 'rotate-90'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                      {:else}
                        <span class="h-3 w-3 shrink-0"></span>
                      {/if}
                      <span class="font-mono text-sm {hasChildren ? 'font-medium text-slate-300 dark:text-slate-100' : 'text-slate-500 dark:text-slate-300'}">{label}</span>
                    </span>
                  </td>
                  {#each row.amounts as amount}
                    <td class="px-4 py-2.5 text-right font-mono text-sm whitespace-nowrap {getAmountColor(section.account, amount, section.amountColor)}">
                      {#if !Number.isNaN(amount)}<Amount value={amount} />{/if}
                    </td>
                  {/each}
                  {#if visibleTotals}
                    {@const rowTotal = sum(row.amounts)}
                    <td class="px-4 py-2.5 text-right font-mono text-sm whitespace-nowrap border-l border-slate-400/40 {getAmountColor(section.account, rowTotal, section.amountColor)}">
                      {#if !Number.isNaN(rowTotal)}<Amount value={rowTotal} />{/if}
                    </td>
                  {/if}
                </tr>
              {/if}
            {/each}
            <tr class="border-b border-slate-300">
              <td class="px-5 py-2.5 sticky left-0 bg-slate-900 z-10 align-baseline">
                <span class="inline-flex items-baseline gap-1.5">
                  <AccountBadge account={section.account} />
                  <span class="text-sm font-semibold text-slate-100">{section.totalLabel ?? 'Total'}</span>
                </span>
              </td>
              {#each section.totals as amount}
                <td class="px-4 py-2.5 text-right font-mono text-sm font-semibold whitespace-nowrap {getAmountColor(section.account, amount, section.amountColor)}"><Amount value={amount} /></td>
              {/each}
              {#if visibleTotals}
                <td class="px-4 py-2.5 text-right font-mono text-sm font-semibold whitespace-nowrap border-l border-slate-400/40 {getAmountColor(section.account, sum(section.totals), section.amountColor)}"><Amount value={sum(section.totals)} /></td>
              {/if}
            </tr>
          {/if}
        {/each}

        <!-- Footer row (Net Worth / Net Income / Net) -->
        {#if footer}
          <tr class="border-t-2 border-slate-300">
            <td class="px-5 py-3 text-sm font-semibold text-slate-100 sticky left-0 bg-slate-900 z-10">{footer.label}</td>
            {#each footer.amounts as amount}
              <td class="px-4 py-3 text-right font-mono text-sm font-semibold whitespace-nowrap {amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
                <Amount value={amount} />
              </td>
            {/each}
            {#if visibleTotals}
              {@const footerTotal = sum(footer.amounts)}
              <td class="px-4 py-3 text-right font-mono text-sm font-semibold whitespace-nowrap border-l border-slate-400/40 {footerTotal >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
                <Amount value={footerTotal} />
              </td>
            {/if}
          </tr>
        {/if}
      </tbody>
    </table>
  </div>
</div>
