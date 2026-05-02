<script lang="ts">
  import type { PageData } from './$types';
  import Chart from '$lib/Chart.svelte';
  import { goto } from '$app/navigation';
  import { theme } from '$lib/theme.svelte.js';
  import { onMount } from 'svelte';
  import LearningBanner from '$lib/components/LearningBanner.svelte';
  import PeriodStepper from '$lib/components/PeriodStepper.svelte';
  import TransactionRow from '$lib/components/TransactionRow.svelte';
  import Amount from '$lib/components/Amount.svelte';
  import { page } from '$app/stores';
  import { parseCommodity, formatAmount } from '$lib/format.js';

  let { data }: { data: PageData } = $props();

  // Active month as YYYY-MM, null = current month
  const dataMonth = $derived(data.month as string | null);
  let activeMonth = $state<string | null>(null);
  $effect(() => { activeMonth = dataMonth; });

  const today = new Date();
  const currentYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const isCurrentMonth = $derived(!activeMonth || activeMonth === currentYM);

  function toYM(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function parseYM(ym: string): Date {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1);
  }

  function navigate(delta: number) {
    const base = activeMonth ? parseYM(activeMonth) : new Date(today.getFullYear(), today.getMonth(), 1);
    base.setMonth(base.getMonth() + delta);
    const next = toYM(base);
    if (next > currentYM) return; // never go past current month
    const url = next === currentYM ? '/dashboard' : `/dashboard?month=${next}`;
    goto(url, { replaceState: true });
  }

  const displayMonth = $derived(
    (() => {
      const d = activeMonth ? parseYM(activeMonth) : today;
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    })()
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

  function fmtDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function amtColor(amount: number) {
    return amount > 0 ? 'text-rose-400' : 'text-emerald-400';
  }

  function amtGlow(amount: number) {
    return amount > 0 ? 'glow-rose' : 'glow-emerald';
  }

  const savingsRate = $derived(
    data.monthSummary.income > 0
      ? Math.round(((data.monthSummary.income - data.monthSummary.expenses) / data.monthSummary.income) * 100)
      : 0
  );

  // Learning mode
  const learningEnabled = $derived(data.settings?.learning?.enabled ?? false);

  // Dashboard tips for the carousel
  const dashboardTips = [
    { text: 'Your <strong>savings rate</strong> shows how much of your paycheck you actually kept. If you earned $5,000 and spent $4,000, that\'s a 20% savings rate — a solid foundation.' },
    { text: 'Every purchase moves money between two places. Buy $5 coffee? It leaves your bank account and goes to <span class="inline-flex whitespace-nowrap items-center align-text-bottom"><span class="inline-flex rounded border font-mono font-semibold capitalize px-0.5 py-0 text-xs leading-4 border-rose-500/30 bg-rose-500/10 text-rose-400">Expenses</span><span class="font-mono text-rose-400 text-sm">:food</span></span>. That\'s why the numbers always balance — nothing disappears.' },
    { text: '<span class="inline-flex shrink-0 rounded border font-mono font-semibold capitalize align-text-bottom px-0.5 py-0 text-xs leading-4 border-[#6ee7b7] bg-[#ecfdf5] text-[#047857] dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">Income</span> = money coming in (paychecks, side gigs). <span class="inline-flex shrink-0 rounded border font-mono font-semibold capitalize align-text-bottom px-0.5 py-0 text-xs leading-4 border-[#fca5a5] bg-[#fef2f2] text-[#dc2626] dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400">Expenses</span> = money going out (rent, groceries). The gap between them is what you\'re saving each month.' },
    { text: 'Don\'t stress about your <strong>net worth</strong> number today. What matters is the direction — is it going up over time? Even small, steady growth means you\'re on the right track.' },
    { text: 'Putting each transaction in the right <strong>account</strong> is the single most useful thing you can do. It turns "I spent $3,000" into "I spent $800 on food, $1,200 on rent, $400 on transport…"' },
    { text: 'The stats at the top give you a monthly health check at a glance: what you own, what you earned, what you spent, and how much you kept.' },
  ];

  // Sparkline data from monthly history
  const incomeSparkline = $derived(data.monthlyHistory?.map((m: any) => m.income) ?? []);
  const expenseSparkline = $derived(data.monthlyHistory?.map((m: any) => m.expenses) ?? []);
  const savingsSparkline = $derived(
    data.monthlyHistory?.map((m: any) => m.income > 0 ? ((m.income - m.expenses) / m.income) * 100 : 0) ?? []
  );
  const netWorthSparkline = $derived((data.netWorthHistory ?? []).slice(-6).map((h: any) => h.netWorth));

  // Draw a mini sparkline on a canvas
  function drawSparkline(canvas: HTMLCanvasElement, values: number[], color: string) {
    if (!canvas || values.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const step = w / (values.length - 1);

    // Fill gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color + '30');
    grad.addColorStop(1, color + '00');

    ctx.beginPath();
    ctx.moveTo(0, h);
    values.forEach((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * h * 0.8 - h * 0.1;
      if (i === 0) ctx.lineTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * h * 0.8 - h * 0.1;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Sparkline refs
  let sparkNW = $state<HTMLCanvasElement | undefined>(undefined);
  let sparkInc = $state<HTMLCanvasElement | undefined>(undefined);
  let sparkExp = $state<HTMLCanvasElement | undefined>(undefined);
  let sparkSav = $state<HTMLCanvasElement | undefined>(undefined);

  onMount(() => {
    // Small delay to ensure canvas dimensions are available
    requestAnimationFrame(() => {
      if (sparkNW) drawSparkline(sparkNW, netWorthSparkline, '#34d399');
      if (sparkInc) drawSparkline(sparkInc, incomeSparkline, '#34d399');
      if (sparkExp) drawSparkline(sparkExp, expenseSparkline, '#f87171');
      if (sparkSav) drawSparkline(sparkSav, savingsSparkline, '#60a5fa');
    });
  });

  // Expense category colors
  const categoryColors = [
    '#f87171', '#fb923c', '#fbbf24', '#34d399', '#60a5fa',
    '#a78bfa', '#f472b6', '#94a3b8', '#e879f9', '#2dd4bf'
  ];

  const expenseTotal = $derived((data.expenseCategories || []).reduce((s: number, c: any) => s + c.amount, 0));
  const maxExpense = $derived(Math.max(...(data.expenseCategories || []).map((c: any) => c.amount), 1));
</script>

<LearningBanner id="dashboard" title="Quick tips" tips={dashboardTips} />

<div class="mb-6 flex items-center justify-between animate-in animate-in-1">
  <h1 class="text-xl font-semibold text-slate-100">Dashboard</h1>
  <PeriodStepper label={displayMonth} onprev={() => navigate(-1)} onnext={() => navigate(1)} disableNext={isCurrentMonth} />
</div>

<!-- Uncategorized alert -->
{#if data.uncategorizedCount > 0}
  <div class="mb-5 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 animate-in animate-in-2">
    <span class="text-sm text-amber-400">{data.uncategorizedCount} unassigned transaction{data.uncategorizedCount !== 1 ? 's' : ''}</span>
    <a href="/triage" class="text-sm font-medium text-amber-400 hover:underline">Review →</a>
  </div>
{/if}

<!-- Stats -->
<div class="mb-6 grid grid-cols-4 gap-3 animate-in animate-in-2">
  <!-- Net Worth — hero card with animated gradient border -->
  <div class="gradient-border relative overflow-hidden rounded-xl bg-slate-900 p-4">
    <div class="sparkline-wrap"><canvas bind:this={sparkNW}></canvas></div>
    <p class="relative mb-2 text-xs font-semibold tracking-wide text-slate-100">Net Worth</p>
    <p class="relative text-xl font-medium {data.netWorth >= 0 ? 'text-emerald-400 glow-emerald' : 'text-rose-400 glow-rose'}">
      <Amount value={data.netWorth} />
    </p>
  </div>

  <!-- Income -->
  <div class="glass-card relative overflow-hidden rounded-xl border border-slate-400 p-4">
    <div class="sparkline-wrap"><canvas bind:this={sparkInc}></canvas></div>
    <p class="relative mb-2 text-xs font-semibold tracking-wide text-slate-100">Income</p>
    <p class="relative text-xl font-medium {data.monthSummary.income > 0 ? 'text-emerald-400 glow-emerald' : 'text-rose-400 glow-rose'}"><Amount value={data.monthSummary.income} /></p>
  </div>

  <!-- Expenses -->
  <div class="glass-card relative overflow-hidden rounded-xl border border-slate-400 p-4">
    <div class="sparkline-wrap"><canvas bind:this={sparkExp}></canvas></div>
    <p class="relative mb-2 text-xs font-semibold tracking-wide text-slate-100">Expenses</p>
    <p class="relative text-xl font-medium text-rose-400 glow-rose"><Amount value={data.monthSummary.expenses} /></p>
  </div>

  <!-- Savings Rate -->
  <div class="glass-card relative overflow-hidden rounded-xl border border-slate-400 p-4">
    <div class="sparkline-wrap"><canvas bind:this={sparkSav}></canvas></div>
    <p class="relative mb-2 text-xs font-semibold tracking-wide text-slate-100">Savings Rate</p>
    <p class="relative text-xl font-medium {savingsRate >= 20 ? 'text-emerald-400 glow-emerald' : savingsRate < 0 ? 'text-rose-400 glow-rose' : 'text-slate-100'}">
      {savingsRate}%
    </p>
  </div>
</div>

<!-- Charts + Recent -->
<div class="grid grid-cols-2 gap-4">
  <!-- Expense breakdown -->
  <div class="glass-card rounded-xl border border-slate-400 p-5 animate-in animate-in-4">
    <p class="mb-4 text-xs font-semibold tracking-wide text-slate-100">Expenses</p>
    {#if data.expenseCategories && data.expenseCategories.length > 0}
      <div class="flex flex-col gap-2.5">
        {#each data.expenseCategories as cat, i}
          {@const pct = expenseTotal > 0 ? (cat.amount / expenseTotal * 100) : 0}
          {@const barPct = (cat.amount / maxExpense) * 100}
          <div class="flex items-center gap-2.5">
            <span class="w-[72px] shrink-0 truncate text-sm text-slate-100">{cat.shortName}</span>
            <div class="relative flex-1 h-5 rounded-md overflow-hidden bg-slate-800/50">
              <div
                class="absolute inset-y-0 left-0 rounded-md transition-all"
                style="width: {barPct}%; background: {categoryColors[i % categoryColors.length]}; opacity: 0.7;"
              ></div>
            </div>
            <span class="shrink-0 font-mono text-xs text-slate-100 w-8 text-right">{pct.toFixed(0)}%</span>
            <span class="shrink-0 font-mono text-sm tabular-nums text-slate-100 w-20 text-right">{fmt(cat.amount)}</span>
          </div>
        {/each}
      </div>
    {:else}
      <p class="py-8 text-center text-sm text-slate-100">No expenses this period</p>
    {/if}
  </div>

  <!-- Transactions -->
  <div class="glass-card rounded-xl border border-slate-400 p-5 animate-in animate-in-5">
    <p class="mb-4 text-xs font-semibold tracking-wide text-slate-100">Transactions</p>
    {#if data.recentTransactions && data.recentTransactions.length > 0}
      <div class="flex flex-col gap-1">
        {#each data.recentTransactions as txn, i}
          <div class="animate-in" style="animation-delay: {300 + i * 40}ms">
            <TransactionRow
              date={txn.date}
              description={txn.description}
              account={txn.account}
              postings={txn.postings}
              amount={txn.amount ?? 0}
              href={(txn.txid || txn.tindex) ? `/tx/${txn.txid ?? txn.tindex}?ref=${encodeURIComponent('/dashboard')}` : undefined}
            />
          </div>
        {/each}
      </div>
      <a href="/register" class="mt-3 block text-center text-sm text-slate-100 hover:text-slate-100 transition-colors">View all →</a>
    {:else}
      <p class="py-8 text-center text-sm text-slate-100">No transactions this period</p>
    {/if}
  </div>
</div>
