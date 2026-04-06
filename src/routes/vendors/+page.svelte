<script lang="ts">
  import { goto } from '$app/navigation';
  import { Tooltip } from 'bits-ui';
  import LearningBanner from '$lib/components/LearningBanner.svelte';
  import MonthSelector from '$lib/components/MonthSelector.svelte';
  import Sparkline from '$lib/components/Sparkline.svelte';
  import { page } from '$app/stores';
  import { parseCommodity, formatAmount } from '$lib/format.js';
  import Amount from '$lib/components/Amount.svelte';

  let { data } = $props();


  let filter = $state('');

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
    goto(`/vendors?months=${n}`, { replaceState: true, noScroll: true });
  }

  function fmtMonth(ym: string) {
    const [y, m] = ym.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(m) - 1]} ${y}`;
  }

  function fmtDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  }

  const filteredMm = $derived(
    filter && mm
      ? { ...mm, vendors: mm.vendors.filter((p: any) => p.vendor.toLowerCase().includes(filter.toLowerCase())) }
      : mm
  );

  const filtered = $derived(
    filter
      ? data.vendors.filter((p: any) => p.vendor.toLowerCase().includes(filter.toLowerCase()))
      : data.vendors
  );

  const totalSpend = $derived(
    filtered.reduce((s: number, p: any) => s + p.total, 0)
  );
</script>

<LearningBanner id="vendors" title="Spending by vendor">
  Vendors are the people and businesses you exchange money with. This view groups transactions by who you paid,
  so you can spot things like "I spent $400 at Amazon this month across 12 small orders" that are easy to miss
  when looking at individual transactions.
</LearningBanner>

<div class="mb-6 flex items-center justify-between">
  <div>
    <h1 class="text-xl font-semibold text-slate-100">Vendors</h1>
    <p class="mt-1 text-sm text-slate-100">{data.vendors.length} unique vendors · <span class="font-mono"><Amount value={totalSpend} /></span> total spend</p>
  </div>
  <MonthSelector value={monthCount} onchange={setMonths} />
</div>

<!-- Search -->
<div class="mb-4">
  <input
    type="search"
    placeholder="Filter vendors…"
    bind:value={filter}
    class="w-full rounded-lg border border-slate-300 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-100 focus:border-blue-300"
  />
</div>

{#if filteredMm && filteredMm.months.length > 1}
  <!-- Multi-month table -->
  <div class="rounded-xl border border-slate-400 bg-slate-900 overflow-hidden">
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-slate-400 text-left">
            <th class="px-4 py-3 font-medium text-slate-100 whitespace-nowrap">Vendor</th>
            {#each filteredMm.months as month}
              <th class="px-4 py-3 font-medium text-slate-100 text-right whitespace-nowrap">{fmtMonth(month)}</th>
            {/each}
            <th class="px-4 py-3 font-medium text-slate-100 text-right whitespace-nowrap">Total</th>
          </tr>
        </thead>
        <Tooltip.Provider delayDuration={300}>
        <tbody>
          {#each filteredMm.vendors as p}
            <tr
              class="group border-b border-black/[0.08] dark:border-white/[0.06] transition-colors hover:bg-slate-800/50"
            >
              <Tooltip.Root>
                <Tooltip.Trigger class="px-4 py-2.5 whitespace-nowrap text-left">
                  <a
                    href="/register?q={encodeURIComponent(p.vendor)}&from="
                    class="text-slate-100 hover:text-blue-500 group-hover:underline underline-offset-2 transition-colors"
                  >{p.vendor}</a>
                </Tooltip.Trigger>
                {#if p.amounts.some((a: number) => a > 0)}
                  <Tooltip.Portal>
                    <Tooltip.Content
                      side="right"
                      sideOffset={4}
                      class="z-50 rounded-lg border border-slate-300 bg-slate-900 px-3 py-2 shadow-xl"
                    >
                      <p class="mb-1 text-xs text-slate-100 whitespace-nowrap">{p.vendor}</p>
                      <Sparkline values={p.amounts} labels={filteredMm?.months.map(m => fmtMonth(m).slice(0, 3))} width={180} height={56} showAxis />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                {/if}
              </Tooltip.Root>
              {#each p.amounts as amount}
                <td class="px-4 py-2.5 text-right font-mono text-sm tabular-nums whitespace-nowrap {amount > 0 ? 'text-rose-400' : 'text-slate-100'}">
                  {#if amount > 0}<Amount value={amount} />{:else}—{/if}
                </td>
              {/each}
              <td class="px-4 py-2.5 text-right font-mono text-sm font-semibold tabular-nums whitespace-nowrap text-rose-400">
                <Amount value={p.total} />
              </td>
            </tr>
          {/each}
        </tbody>
        </Tooltip.Provider>
      </table>
    </div>
  </div>
{:else if filtered.length === 0}
  <div class="rounded-xl border border-slate-400 bg-slate-900 py-16 text-center">
    <p class="text-slate-100">No vendors found.</p>
  </div>
{:else}
  <!-- Single month table -->
  <div class="rounded-xl border border-slate-400 bg-slate-900 overflow-hidden">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-400">
          <th class="px-4 py-3 text-left font-medium text-slate-100">Vendor</th>
          <th class="px-4 py-3 text-right font-medium text-slate-100">Count</th>
          <th class="px-4 py-3 text-right font-medium text-slate-100">Total</th>
          <th class="px-4 py-3 text-right font-medium text-slate-100">Last</th>
        </tr>
      </thead>
      <tbody>
        {#each filtered as p}
          <tr class="group border-b border-black/[0.08] dark:border-white/[0.06] transition-colors hover:bg-slate-800/50">
            <td class="px-4 py-2.5">
              <a
                href="/register?q={encodeURIComponent(p.vendor)}&from="
                class="text-slate-100 hover:text-blue-500 group-hover:underline underline-offset-2 transition-colors"
              >{p.vendor}</a>
            </td>
            <td class="px-4 py-2.5 text-right font-mono text-slate-100">{p.count}</td>
            <td class="px-4 py-2.5 text-right font-mono {p.total > 0 ? 'text-rose-400' : 'text-slate-100'}">
              {#if p.total > 0}<Amount value={p.total} />{:else}—{/if}
            </td>
            <td class="px-4 py-2.5 text-right text-slate-100">{fmtDate(p.lastDate)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

