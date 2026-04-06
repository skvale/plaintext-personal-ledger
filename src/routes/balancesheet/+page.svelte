<script lang="ts">
  import type { PageData } from './$types';
  import Chart from '$lib/Chart.svelte';
  import { theme } from '$lib/theme.svelte.js';
  import { goto } from '$app/navigation';
  import AccountBadge from '$lib/components/AccountBadge.svelte';
  import LearningBanner from '$lib/components/LearningBanner.svelte';
  import MonthlyReportTable from '$lib/components/MonthlyReportTable.svelte';
  import MonthSelector from '$lib/components/MonthSelector.svelte';
  import { page } from '$app/stores';
  import { parseCommodity, formatAmount } from '$lib/format.js';
  import Amount from '$lib/components/Amount.svelte';

  let { data }: { data: PageData } = $props();

  const commodityFmt = $derived(parseCommodity($page.data.commodity ?? '$1,000.00'));
  const roundAmounts = $derived($page.data.settings?.display?.roundAmounts === true);
  const displayFmt = $derived(roundAmounts ? { ...commodityFmt, decimals: 0 } : commodityFmt);
  const showSymbol = $derived($page.data.settings?.display?.showCurrencySymbol !== false);
  function fmt(n: number) {
    const full = formatAmount(n, displayFmt);
    if (showSymbol) return full;
    return full.replace(displayFmt.symbol, '');
  }

  const monthCount = $derived(data.monthCount ?? 1);
  const mm = $derived(data.multiMonth);

  function setMonths(n: number) {
    const url = n > 1 ? `/balancesheet?months=${n}` : '/balancesheet';
    goto(url, { replaceState: true, noScroll: true });
  }

  // Derive table sections from multi-month data
  const mmAssetRows = $derived(mm?.accounts.filter(a => a.type === 'asset') ?? []);
  const mmLiabRows = $derived(mm?.accounts.filter(a => a.type === 'liability') ?? []);
  const mmAssetTotals = $derived(mm?.assetTotals ?? []);
  const mmLiabTotals = $derived(mm?.liabTotals ?? []);

  const tableSections = $derived(mm ? [
    { account: 'assets', rows: mmAssetRows, totals: mmAssetTotals, amountColor: 'text-blue-500' },
    { account: 'liabilities', rows: mmLiabRows, totals: mmLiabTotals, amountColor: 'text-rose-400' },
  ] : []);

  const tableFooter = $derived(mm ? { label: 'Net Worth', amounts: mm.netWorths } : undefined);
  const heroNetWorth = $derived(mm?.netWorths?.at(-1) ?? data.netWorth);

  // Chart
  const chartLabels = $derived(mm ? mm.months : data.history.map(d => d.month));
  const chartData = $derived(mm ? mm.netWorths : data.history.map(d => d.netWorth));

  const netWorthChartConfig = $derived({
    type: 'line' as const,
    data: {
      labels: chartLabels,
      datasets: [{
        label: 'Net Worth',
        data: chartData,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.08)',
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: '#3b82f6',
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: theme.chartColors().tooltipBg,
          borderColor: theme.chartColors().tooltipBorder,
          borderWidth: 1,
          titleColor: theme.chartColors().tooltipTitle,
          bodyColor: theme.chartColors().tooltipBody,
          callbacks: {
            label: (ctx: any) => ` $${ctx.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
          }
        }
      },
      scales: {
        x: { grid: { color: theme.chartColors().grid }, ticks: { color: theme.chartColors().tick, font: { size: 11 } } },
        y: {
          grid: { color: theme.chartColors().grid },
          ticks: {
            color: theme.chartColors().tick,
            font: { family: 'IBM Plex Mono', size: 11 },
            callback: (v: any) => (showSymbol ? displayFmt.symbol : '') + Number(v).toLocaleString()
          }
        }
      }
    }
  });
</script>

<LearningBanner id="balancesheet" title="What you own & owe">
  Your <strong>balance sheet</strong> answers one question: "What do I have right now?" Add up everything you own
  (bank accounts, investments, cash) and subtract what you owe (credit cards, loans). The result is your net worth.
</LearningBanner>

<div class="mb-6 flex items-center justify-between">
  <h1 class="text-xl font-semibold text-slate-100 flex items-center gap-2">Balance Sheet <span class="text-sm font-normal text-slate-100">net worth = </span><AccountBadge account="assets" size="lg" /> <span class="text-slate-100">&minus;</span> <AccountBadge account="liabilities" size="lg" /></h1>
  <MonthSelector value={monthCount} onchange={setMonths} />
</div>

{#if monthCount <= 1}
  <!-- Net worth hero (single month only) -->
  <div class="mb-6 rounded-xl border border-slate-400 bg-slate-900 p-6">
    <p class="mb-1 text-xs font-semibold tracking-wide text-slate-100">Net Worth</p>
    <p class="text-4xl font-medium {heroNetWorth >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
      <Amount value={heroNetWorth} />
    </p>
  </div>
{/if}

<!-- Net worth chart (only for multi-month) -->
{#if monthCount > 1 && chartData.length > 1}
  <div class="mb-6 rounded-xl border border-slate-400 bg-slate-900 p-5">
    <p class="mb-4 text-xs font-semibold tracking-wide text-slate-100">Net Worth Over Time</p>
    <Chart config={netWorthChartConfig} height="200px" />
  </div>
{/if}

<!-- Table -->
{#if mm && mm.months.length > 0}
  <div class="mb-6">
    <MonthlyReportTable months={mm.months} sections={tableSections} footer={tableFooter} />
  </div>
{/if}
