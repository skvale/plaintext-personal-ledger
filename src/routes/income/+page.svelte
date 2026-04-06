<script lang="ts">
  import type { PageData } from './$types';
  import Chart from '$lib/Chart.svelte';
  import { goto } from '$app/navigation';
  import { theme } from '$lib/theme.svelte.js';
  import LearningBanner from '$lib/components/LearningBanner.svelte';
  import MonthlyReportTable from '$lib/components/MonthlyReportTable.svelte';
  import MonthSelector from '$lib/components/MonthSelector.svelte';
  import { page } from '$app/stores';
  import { parseCommodity, formatAmount } from '$lib/format.js';

  let { data }: { data: PageData } = $props();

  const commodityFmt = $derived(parseCommodity($page.data.commodity ?? '$1,000.00'));
  const roundAmounts = $derived($page.data.settings?.display?.roundAmounts === true);
  const displayFmt = $derived(roundAmounts ? { ...commodityFmt, decimals: 0 } : commodityFmt);
  const showSymbol = $derived($page.data.settings?.display?.showCurrencySymbol !== false);
  function fmt(n: number) {
    const full = formatAmount(Math.abs(n), displayFmt);
    if (showSymbol) return full;
    return full.replace(displayFmt.symbol, '');
  }

  const mm = $derived(data.multiMonth);
  const monthCount = $derived(data.monthCount ?? 1);

  function setMonths(n: number) {
    goto(`/income?months=${n}`, { replaceState: true, noScroll: true });
  }

  const tableSections = $derived(mm ? [
    { account: 'income', rows: mm.accounts.filter(a => a.type === 'income'), totals: mm.incomeTotals, amountColor: 'text-emerald-400' },
    { account: 'expenses', rows: mm.accounts.filter(a => a.type === 'expense'), totals: mm.expenseTotals, amountColor: 'text-rose-400' },
  ] : []);

  const tableFooter = $derived(mm ? { label: 'Net Income', amounts: mm.netTotals } : undefined);

  // Chart
  const barChartConfig = $derived({
    type: 'bar' as const,
    data: {
      labels: (data.monthly || []).map((d) => d.month),
      datasets: [
        {
          label: 'Income',
          data: (data.monthly || []).map((d) => d.income),
          backgroundColor: theme.isDark ? 'rgba(16, 185, 129, 0.7)' : 'rgba(5, 150, 105, 0.65)',
          hoverBackgroundColor: theme.isDark ? 'rgba(16, 185, 129, 0.9)' : 'rgba(5, 150, 105, 0.85)',
          borderRadius: 4, borderSkipped: false, order: 1
        },
        {
          label: 'Expenses',
          data: (data.monthly || []).map((d) => d.expenses),
          backgroundColor: theme.isDark ? 'rgba(244, 63, 94, 0.7)' : 'rgba(224, 42, 74, 0.65)',
          hoverBackgroundColor: theme.isDark ? 'rgba(244, 63, 94, 0.9)' : 'rgba(224, 42, 74, 0.85)',
          borderRadius: 4, borderSkipped: false, order: 2
        }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: {
          labels: { color: theme.chartColors().legend, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'rectRounded', font: { size: 11 }, padding: 16 }
        },
        tooltip: {
          backgroundColor: theme.chartColors().tooltipBg, borderColor: theme.chartColors().tooltipBorder,
          borderWidth: 1, titleColor: theme.chartColors().tooltipTitle, bodyColor: theme.chartColors().tooltipBody,
          padding: 10, bodySpacing: 6,
          callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ${showSymbol ? displayFmt.symbol : ''}${ctx.parsed.y.toLocaleString('en-US', { minimumFractionDigits: displayFmt.decimals })}` }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: theme.chartColors().tick, font: { size: 11 } } },
        y: {
          grid: { color: theme.chartColors().grid, drawBorder: false }, border: { display: false },
          ticks: { color: theme.chartColors().tick, font: { family: 'IBM Plex Mono', size: 11 }, callback: (v: any) => (showSymbol ? displayFmt.symbol : '') + Number(v).toLocaleString() }
        }
      }
    }
  });
</script>

<LearningBanner id="pnl" title="Income vs expenses">
  <strong>Profit &amp; Loss</strong> is your monthly scorecard: how much came in (income) vs. how much went out (expenses).
  If income is higher, you saved money. If expenses are higher, you spent more than you earned that month.
</LearningBanner>

<div class="mb-6 flex items-center justify-between">
  <h1 class="text-xl font-semibold text-slate-100">Profit & Loss</h1>
  <MonthSelector value={monthCount} onchange={setMonths} />
</div>

<!-- Chart -->
<div class="mb-5 rounded-xl border border-slate-400 bg-slate-900 p-5">
  <p class="mb-4 text-xs font-semibold tracking-wide text-slate-100">Monthly Overview</p>
  {#if data.monthly && data.monthly.length > 0}
    <Chart config={barChartConfig} height="200px" />
  {:else}
    <p class="py-8 text-center text-sm text-slate-100">No data for this period</p>
  {/if}
</div>

<!-- Table -->
{#if mm && mm.months.length > 0}
  <MonthlyReportTable months={mm.months} sections={tableSections} footer={tableFooter} signed />
{/if}
