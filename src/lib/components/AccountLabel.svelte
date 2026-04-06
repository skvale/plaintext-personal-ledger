<script lang="ts">
  import { accountColor, accountWithoutType } from '$lib/account-colors.js';
  import AccountBadge from '$lib/components/AccountBadge.svelte';

  let {
    account,
    size = 'sm',
    badgeSize,
  }: {
    account: string;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    /** @deprecated use size instead */
    badgeSize?: 'xs' | 'sm' | 'md' | 'lg';
  } = $props();

  const resolvedSize = $derived(badgeSize ?? size);
  const textClass = $derived(
    resolvedSize === 'xs' ? 'text-xs'
      : resolvedSize === 'sm' ? 'text-xs'
        : resolvedSize === 'lg' ? 'text-sm'
          : 'text-sm'
  );
  const sub = $derived(accountWithoutType(account));
</script>

<span class="inline-flex items-center whitespace-nowrap"><AccountBadge account={account} size={resolvedSize} />{#if sub}<span class="truncate font-mono {textClass} {accountColor(account)}">:{sub}</span>{/if}</span>
