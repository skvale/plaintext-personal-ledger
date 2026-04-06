<script lang="ts">
  import { page } from '$app/stores';
  import { parseCommodity, splitAmount } from '$lib/format.js';

  let { value, class: cls = '', symbol: symbolOverride, precise = false }: { value: number; class?: string; symbol?: boolean; precise?: boolean } = $props();

  const commodityFmt = $derived(parseCommodity($page.data.commodity ?? '$1,000.00'));
  const showCurrencySymbol = $derived(symbolOverride ?? ($page.data.settings?.display?.showCurrencySymbol !== false));
  const roundAmounts = $derived(!precise && ($page.data.settings?.display?.roundAmounts === true));
  const displayFmt = $derived(roundAmounts ? { ...commodityFmt, decimals: 0 } : commodityFmt);
  const parts = $derived(splitAmount(value, displayFmt));
</script>

<span class="italic tabular-nums {cls}">{parts.sign}{#if showCurrencySymbol}<span class="text-[0.85em]" style="vertical-align: 0.15em; margin-right: 0.05em">{parts.symbol}</span>{/if}{parts.number}</span>
