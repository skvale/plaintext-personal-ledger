<script lang="ts">
  import { accountType, accountBadgeClass } from '$lib/account-colors.js';

  let {
    account,
    size = 'sm',
  }: {
    account: string;
    size?: 'xs' | 'sm' | 'md' | 'lg';
  } = $props();

  const type = $derived(accountType(account));
  const badge = $derived(accountBadgeClass(account));
  const label = $derived(type.charAt(0).toUpperCase() + type.slice(1));
  const sizeClass = $derived(
    size === 'xs'
      ? 'px-0.5 py-0 text-xs leading-4'
      : size === 'sm'
        ? 'px-1 py-0.5 text-xs'
        : size === 'lg'
          ? 'px-2 py-1 text-sm'
          : 'px-1.5 py-0.5 text-xs');
</script>

<span class="inline-flex shrink-0 rounded border font-mono font-semibold capitalize align-text-bottom {sizeClass} {badge} truncate">{label}</span>
