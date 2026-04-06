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
  }: {
    months: string[];
    sections: Section[];
    footer?: { label: string; amounts: number[] };
    signed?: boolean;
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

  function fmtSigned(n: number) {
    if (!signed) return fmt(n);
    return (n >= 0 ? '+' : '−') + fmt(n);
  }

  // Track expanded state per section
  let expanded = $state<Record<string, boolean>>({});

  function isExpanded(account: string) {
    return expanded[account] ?? true;
  }

  function toggle(account: string) {
    expanded[account] = !isExpanded(account);
  }
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
                <td class="px-4 py-2.5 text-right font-mono text-sm font-semibold whitespace-nowrap {section.amountColor}"><Amount value={amount} /></td>
              {/each}
            {:else}
              {#each months as _}<td></td>{/each}
            {/if}
          </tr>

          {#if isExpanded(section.account)}
            {#each section.rows as row}
              {@const hasChildren = section.rows.some(r => r.name.startsWith(row.name + ':'))}
              {@const parentInData = section.rows.some(r => row.name.startsWith(r.name + ':'))}
              {@const indent = parentInData ? (row.depth - 1) : 0}
              {@const label = parentInData ? row.name.split(':').pop() : row.name.split(':').slice(1).join(':')}
              <tr class="border-b border-black/[0.08] dark:border-white/[0.06] hover:border-b-slate-500 dark:hover:border-b-slate-500 transition-colors">
                <td class="px-5 py-2.5 whitespace-nowrap sticky left-0 bg-slate-900 z-10" style="padding-left: {20 + indent * 16}px">
                  <span class="font-mono text-sm {hasChildren ? 'font-medium' : ''} {section.amountColor}">{label}</span>
                </td>
                {#each row.amounts as amount}
                  <td class="px-4 py-2.5 text-right font-mono text-sm whitespace-nowrap {section.amountColor}">
                    {#if !Number.isNaN(amount)}<Amount value={amount} />{/if}
                  </td>
                {/each}
              </tr>
            {/each}
            <tr class="border-b border-slate-300">
              <td class="px-5 py-2.5 sticky left-0 bg-slate-900 z-10 align-baseline">
                <span class="inline-flex items-baseline gap-1.5">
                  <AccountBadge account={section.account} />
                  <span class="text-sm font-semibold text-slate-100">{section.totalLabel ?? 'Total'}</span>
                </span>
              </td>
              {#each section.totals as amount}
                <td class="px-4 py-2.5 text-right font-mono text-sm font-semibold whitespace-nowrap {section.amountColor}"><Amount value={amount} /></td>
              {/each}
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
          </tr>
        {/if}
      </tbody>
    </table>
  </div>
</div>
