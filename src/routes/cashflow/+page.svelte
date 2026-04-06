<script lang="ts">
  import type { PageData } from './$types';
  import Chart from '$lib/Chart.svelte';
  import { goto } from '$app/navigation';
  import { theme } from '$lib/theme.svelte.js';
  import LearningBanner from '$lib/components/LearningBanner.svelte';
  import MonthSelector from '$lib/components/MonthSelector.svelte';
  import MonthlyReportTable from '$lib/components/MonthlyReportTable.svelte';
  import { page } from '$app/stores';
  import { parseCommodity, formatAmount } from '$lib/format.js';

  const _props: { data: PageData } = $props();
  const data = $derived(_props.data);
  let months = $state(0);
  $effect(() => { months = data.months; });

  const commodityFmt = $derived(parseCommodity($page.data.commodity ?? '$1,000.00'));
  const roundAmounts = $derived($page.data.settings?.display?.roundAmounts === true);
  const displayFmt = $derived(roundAmounts ? { ...commodityFmt, decimals: 0 } : commodityFmt);
  const showSymbol = $derived($page.data.settings?.display?.showCurrencySymbol !== false);
  function fmt(n: number, signed = false) {
    const full = formatAmount(Math.abs(n), displayFmt);
    const formatted = showSymbol ? full : full.replace(displayFmt.symbol, '');
    if (!signed) return formatted;
    return (n >= 0 ? '+' : '−') + formatted;
  }

  function shortAccount(name: string) {
    const parts = name.split(':');
    return parts.slice(-2).join(':');
  }

  // Stable color mapping by account name (sorted alphabetically so colors don't shift)
  const ACCOUNT_COLORS: Record<string, string> = {};
  const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#f43f5e', '#ec4899', '#14b8a6', '#f97316', '#6366f1'];

  function accountChartColor(name: string): string {
    if (!ACCOUNT_COLORS[name]) {
      let hash = 0;
      for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
      ACCOUNT_COLORS[name] = PALETTE[Math.abs(hash) % PALETTE.length];
    }
    return ACCOUNT_COLORS[name];
  }

  const monthly = $derived(data.data?.monthly ?? []);
  const multi = $derived(data.data?.multi ?? []);

  // Leaf accounts only for chart (exclude parents whose children are also present)
  const allAccounts = $derived.by(() => {
    const names = [...new Set(monthly.flatMap((m) => m.accounts.map((a) => a.name)))].sort();
    return names.filter(n => !names.some(other => other !== n && other.startsWith(n + ':')));
  });

  const chartConfig = $derived({
    type: 'bar' as const,
    data: {
      labels: monthly.map((d) => d.month),
      datasets: [
        ...allAccounts.map((acct) => {
          const color = accountChartColor(acct);
          return {
            label: shortAccount(acct),
            data: monthly.map((m) => {
              const a = m.accounts.find((a) => a.name === acct);
              return a ? a.change : 0;
            }),
            backgroundColor: color + '99',
            borderColor: color,
            borderWidth: 1,
            borderRadius: 3,
            borderSkipped: false,
            stack: 'cash'
          };
        })
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: theme.chartColors().legend, boxWidth: 10, font: { size: 11 } } },
        tooltip: {
          backgroundColor: theme.chartColors().tooltipBg,
          borderColor: theme.chartColors().tooltipBorder,
          borderWidth: 1,
          titleColor: theme.chartColors().tooltipTitle,
          bodyColor: theme.chartColors().tooltipBody,
          callbacks: {
            label: (ctx: any) => {
              const v = ctx.parsed.y;
              const sign = v >= 0 ? '+' : '';
              return ` ${ctx.dataset.label}: ${sign}${showSymbol ? displayFmt.symbol : ''}${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: displayFmt.decimals })}`;
            }
          }
        }
      },
      scales: {
        x: { stacked: true, grid: { color: theme.chartColors().grid }, ticks: { color: theme.chartColors().tick, font: { size: 11 } } },
        y: {
          stacked: true,
          grid: { color: theme.chartColors().grid },
          ticks: {
            color: '#64748b',
            font: { family: 'IBM Plex Mono', size: 11 },
            callback: (v: any) => (Number(v) >= 0 ? '+' : '') + (showSymbol ? displayFmt.symbol : '') + Number(v).toLocaleString()
          }
        }
      }
    }
  });

  const tableSections = $derived([{
    account: 'assets',
    rows: multi.accounts,
    totals: multi.totals,
    amountColor: 'text-blue-500',
  }]);

  const tableFooter = $derived({ label: 'Net', amounts: multi.totals });
</script>

<LearningBanner id="cashflow" title="Money in & out">
  Cash flow shows how your bank and cash balances changed each month. Green means money came in, red means it went out.
  If checking shows <strong>+$2,000</strong>, your checking account grew by that much. The <strong>Net</strong> row tells you
  whether your total cash position grew or shrank that month.
  <br /><br />
  Transfers between your own accounts (e.g. checking &rarr; investments) won't appear in Profit &amp; Loss or change your Balance Sheet,
  but they show up here. If you mostly care about income vs expenses or net worth, check <a href="/income" class="underline underline-offset-2">P&amp;L</a> and <a href="/balancesheet" class="underline underline-offset-2">Balance Sheet</a> instead.
</LearningBanner>

<div class="mb-6 flex items-center justify-between">
  <div>
    <h1 class="text-xl font-semibold text-slate-100">Cash Flow</h1>
    <p class="mt-0.5 text-sm text-slate-100">How your bank and cash balances changed each month.</p>
  </div>
  <MonthSelector value={months} options={[3, 6, 12]} onchange={(n) => { months = n; goto(`/cashflow?months=${n}`, { replaceState: true, noScroll: true }); }} />
</div>

<!-- Chart -->
<div class="mb-5 rounded-xl border border-slate-400 bg-slate-900 p-5">
  <p class="mb-4 text-xs font-semibold tracking-wide text-slate-100">Monthly Cash Position Change</p>
  {#if monthly.some((d) => d.net !== 0)}
    <Chart config={chartConfig} height="200px" />
  {:else}
    <p class="py-8 text-center text-sm text-slate-100">No data for this period</p>
  {/if}
</div>

<!-- Table -->
{#if multi.months.length > 0}
  <MonthlyReportTable months={multi.months} sections={tableSections} footer={tableFooter} signed />
{/if}
