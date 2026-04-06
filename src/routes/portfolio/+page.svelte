<script lang="ts">
  import Chart from '$lib/Chart.svelte';
  import { theme } from '$lib/theme.svelte.js';
  import LearningBanner from '$lib/components/LearningBanner.svelte';
  import AccountBadge from '$lib/components/AccountBadge.svelte';
  import TransactionRow from '$lib/components/TransactionRow.svelte';
  import { page } from '$app/stores';
  import { parseCommodity, formatAmount } from '$lib/format.js';
  import Amount from '$lib/components/Amount.svelte';

  let { data } = $props();

  const commodityFmt = $derived(parseCommodity($page.data.commodity ?? '$1,000.00'));
  const roundAmounts = $derived($page.data.settings?.display?.roundAmounts === true);
  const displayFmt = $derived(roundAmounts ? { ...commodityFmt, decimals: 0 } : commodityFmt);
  const showSymbol = $derived($page.data.settings?.display?.showCurrencySymbol !== false);
  function fmt(n: number) {
    const full = formatAmount(Math.abs(n), displayFmt);
    if (showSymbol) return full;
    return full.replace(displayFmt.symbol, '');
  }

  function fmtDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function shortName(name: string) {
    return name.split(':').slice(2).join(':') || name.split(':').pop() || name;
  }

  function fmtPct(n: number, base: number) {
    if (base === 0) return '0%';
    const pct = (n / base) * 100;
    return (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
  }

  function fmtSigned(n: number) {
    return (n >= 0 ? '+' : '−') + fmt(n);
  }

  const totalValue = $derived(
    data.accounts.reduce((s: number, a: any) => s + a.balance, 0)
  );

  const costBasis = $derived(totalValue - data.gains.total);

  // Build gains data aligned to the same months as history
  const gainsByMonth = $derived(
    new Map(data.gains.monthly.map((g: any) => [g.month, g.cumulative]))
  );

  const historyConfig = $derived({
    type: 'line' as const,
    data: {
      labels: data.history.map((h: any) => h.month),
      datasets: [
        {
          label: 'Cost Basis',
          data: data.history.map((h: any) => h.total - (gainsByMonth.get(h.month) ?? 0)),
          borderColor: theme.isDark ? '#60a5fa' : '#1a66c8',
          backgroundColor: (theme.isDark ? '#60a5fa' : '#1a66c8') + '25',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 4,
          order: 2,
        },
        {
          label: 'Total',
          data: data.history.map((h: any) => h.total),
          borderColor: theme.isDark ? '#34d399' : '#059669',
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 4,
          borderWidth: 2,
          order: 1,
        },
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: theme.chartColors().legend,
            font: { size: 11 },
            boxWidth: 12,
            padding: 16,
          }
        },
        tooltip: {
          backgroundColor: theme.chartColors().tooltipBg,
          borderColor: theme.chartColors().tooltipBorder,
          borderWidth: 1,
          titleColor: theme.chartColors().tooltipTitle,
          bodyColor: theme.chartColors().tooltipBody,
          callbacks: {
            label: (ctx: any) => {
              const val = ctx.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 0 });
              if (ctx.datasetIndex === 0) return ` Cost Basis: $${val}`;
              const gains = (gainsByMonth.get(data.history[ctx.dataIndex]?.month) ?? 0);
              return ` Total: $${val} (${gains >= 0 ? '+' : '−'}$${Math.abs(gains).toLocaleString('en-US', { minimumFractionDigits: 0 })} gains)`;
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: theme.chartColors().legend, font: { size: 11 } } },
        y: { grid: { color: theme.chartColors().grid }, ticks: { color: theme.chartColors().tick, font: { family: 'IBM Plex Mono', size: 11 }, callback: (v: any) => `$${(v / 1000).toFixed(0)}k` } }
      }
    }
  });
</script>

<LearningBanner id="portfolio" title="Investment tracking">
  Track your investment accounts here. You'll see current value vs. what you put in, gains and losses over time,
  and how your total portfolio is performing — all in one place.
</LearningBanner>

<div class="mb-6">
  <h1 class="text-xl font-semibold text-slate-100">Portfolio</h1>
</div>

<!-- Summary cards -->
<div class="mb-6 grid grid-cols-4 gap-3">
  <div class="rounded-xl border border-slate-400 bg-slate-900 p-4">
    <p class="mb-2 text-xs font-semibold tracking-wide text-slate-100">Total Value</p>
    <p class="text-xl font-medium text-emerald-400"><Amount value={totalValue} /></p>
    <p class="mt-1 text-xs text-slate-100">Cost basis <Amount value={costBasis} /></p>
  </div>
  <div class="rounded-xl border border-slate-400 bg-slate-900 p-4">
    <p class="mb-2 text-xs font-semibold tracking-wide text-slate-100">Total Gain/Loss</p>
    <p class="text-xl font-medium {data.gains.total >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
      {fmtSigned(data.gains.total)}
    </p>
    <p class="mt-1 font-mono text-xs {data.gains.total >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
      {fmtPct(data.gains.total, costBasis)}
    </p>
  </div>
  <div class="rounded-xl border border-slate-400 bg-slate-900 p-4">
    <p class="mb-2 text-xs font-semibold tracking-wide text-slate-100">YTD</p>
    <p class="text-xl font-medium {data.gains.periods.ytd >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
      {fmtSigned(data.gains.periods.ytd)}
    </p>
    <p class="mt-1 font-mono text-xs {data.gains.periods.ytd >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
      {fmtPct(data.gains.periods.ytd, costBasis)}
    </p>
  </div>
  <div class="rounded-xl border border-slate-400 bg-slate-900 p-4">
    <p class="mb-2 text-xs font-semibold tracking-wide text-slate-100">Last Month</p>
    <p class="text-xl font-medium {data.gains.periods.m1 >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
      {fmtSigned(data.gains.periods.m1)}
    </p>
    <p class="mt-1 font-mono text-xs {data.gains.periods.m1 >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
      {fmtPct(data.gains.periods.m1, costBasis)}
    </p>
  </div>
</div>

{#if data.accounts.length === 0}
  <div class="rounded-xl border border-slate-400 bg-slate-900 py-16 text-center">
    <p class="mb-2 text-2xl">◉</p>
    <p class="text-sm font-medium text-slate-100">No investment accounts found</p>
    <p class="mt-1 text-xs text-slate-100">Add accounts under <code class="font-mono">assets:investments</code></p>
  </div>
{:else}
  <div class="mb-4 grid grid-cols-2 gap-4">
    <!-- Allocation -->
    <div class="rounded-xl border border-slate-400 bg-slate-900 p-5">
      <p class="mb-4 text-xs font-semibold tracking-wide text-slate-100">Accounts</p>
      <div class="flex flex-col gap-3">
        {#each data.accounts as acct}
          {@const pct = totalValue > 0 ? Math.round((acct.balance / totalValue) * 100) : 0}
          <div>
            <div class="mb-1 flex items-center justify-between">
              <div class="flex items-center">
                <AccountBadge account={acct.name} />
                <span class="font-mono text-sm text-blue-500">:{shortName(acct.name)}</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-xs text-slate-100">{pct}%</span>
                <span class="text-sm text-emerald-400"><Amount value={acct.balance} /></span>
              </div>
            </div>
            <div class="h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div class="h-full rounded-full bg-blue-300" style="width: {pct}%"></div>
            </div>
          </div>
        {/each}
      </div>
    </div>

    <!-- History chart -->
    <div class="rounded-xl border border-slate-400 bg-slate-900 p-5">
      <p class="mb-4 text-xs font-semibold tracking-wide text-slate-100">Value & Gains (12 mo)</p>
      {#if data.history.length > 1}
        <Chart config={historyConfig} />
      {:else}
        <p class="py-8 text-center text-sm text-slate-100">Not enough history</p>
      {/if}
    </div>
  </div>

  <!-- Recent transactions -->
  <div class="rounded-xl border border-slate-400 bg-slate-900 p-5">
    <p class="mb-4 text-xs font-semibold tracking-wide text-slate-100">Recent Activity</p>
    {#if data.recentTxns.length === 0}
      <p class="py-4 text-center text-sm text-slate-100">No transactions</p>
    {:else}
      <div class="flex flex-col gap-1">
        {#each data.recentTxns as txn}
          {@const investPosting = txn.postings.find((p: any) => p.account.startsWith('assets:investments'))}
          <TransactionRow
            date={txn.date}
            description={txn.description}
            account={investPosting?.account}
            amount={investPosting?.amount ?? 0}
            href={(txn.txid || txn.tindex) ? `/tx/${txn.txid ?? txn.tindex}?ref=${encodeURIComponent('/portfolio')}` : undefined}
            signed
          />
        {/each}
      </div>
      <a href="/register?account=assets%3Ainvestments" class="mt-3 block text-center text-sm text-slate-100 hover:text-slate-100">View all →</a>
    {/if}
  </div>
{/if}
