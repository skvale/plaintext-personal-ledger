<script lang="ts">
  interface Posting {
    type: string;
    account: string;
    amount: string;
  }

  interface Props {
    title: string;
    date: string;
    postings: Posting[];
  }

  let { title, date, postings }: Props = $props();

  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    assets:      { bg: 'bg-blue-300/10',    text: 'text-blue-500',    border: 'border-blue-300/20' },
    liabilities: { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20' },
    equity:      { bg: 'bg-slate-500/10',   text: 'text-slate-100',   border: 'border-slate-400/20' },
    income:      { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
    expenses:    { bg: 'bg-rose-500/10',    text: 'text-rose-400',    border: 'border-rose-500/20' },
  };

  function colors(type: string) {
    return colorMap[type.toLowerCase()] ?? colorMap.assets;
  }
</script>

<div class="rounded-md border border-slate-300/60 bg-white/5 px-3 py-2.5">
  <div class="flex items-center gap-2 mb-2">
    <span class="text-[13.5px] font-medium text-slate-100">{title}</span>
    <span class="ml-auto text-xs text-slate-100">{date}</span>
  </div>
  {#each postings as posting, i}
    <div class="flex items-center justify-between gap-3 {i > 0 ? 'mt-1' : ''}">
      <div class="flex items-center min-w-0">
        <span class="inline-flex shrink-0 rounded border px-1 py-0.5 text-xs font-semibold capitalize {colors(posting.type).bg} {colors(posting.type).text} {colors(posting.type).border}">{posting.type}</span>
        <span class="font-mono text-xs {colors(posting.type).text}">{posting.account}</span>
      </div>
      <span class="shrink-0 text-sm tabular-nums text-slate-100">{posting.amount}</span>
    </div>
  {/each}
  <div class="mt-1.5 border-t border-slate-300/60 pt-1.5 text-xs text-slate-100 text-right tabular-nums">$0.00</div>
</div>
