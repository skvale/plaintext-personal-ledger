<script lang="ts">
  import AccountTypeBadge from '$lib/components/AccountTypeBadge.svelte';

  interface Props {
    values?: {
      assets?: number;
      liabilities?: number;
      equity?: number;
      income?: number;
      expenses?: number;
    };
    fmt?: (n: number) => string;
    class?: string;
  }

  let { values, fmt, class: className }: Props = $props();

  function isActive(v: number | undefined): boolean | undefined {
    if (!values) return undefined;
    return (v ?? 0) !== 0;
  }

  function valueStr(v: number | undefined): string | undefined {
    if (!values || !fmt || (v ?? 0) === 0) return undefined;
    const n = v!;
    return ` ${n > 0 ? '+' : '−'}${fmt(Math.abs(n))}`;
  }
</script>

<span class="flex items-center gap-1.5 font-mono text-sm font-semibold flex-wrap {className ?? ''}">
  <AccountTypeBadge type="assets" active={isActive(values?.assets)} value={valueStr(values?.assets)} />
  <span class="text-slate-100">=</span>
  <AccountTypeBadge type="liabilities" active={isActive(values?.liabilities)} value={valueStr(values?.liabilities)} />
  <span class="text-slate-100">+</span>
  <AccountTypeBadge type="equity" active={isActive(values?.equity)} value={valueStr(values?.equity)} />
  <span class="text-slate-100">+ (</span>
  <AccountTypeBadge type="income" active={isActive(values?.income)} value={valueStr(values?.income)} />
  <span class="text-slate-100">−</span>
  <AccountTypeBadge type="expenses" active={isActive(values?.expenses)} value={valueStr(values?.expenses)} />
  <span class="text-slate-100">)</span>
</span>
