<script lang="ts">
  import { accountTypeBadgeColors } from '$lib/account-colors.js';

  interface Props {
    type: string;
    active?: boolean;
    value?: string;
  }

  let { type, active, value }: Props = $props();

  const normalized = $derived(type.toLowerCase());
  const label = $derived(normalized.charAt(0).toUpperCase() + normalized.slice(1));

  const classes = $derived(
    accountTypeBadgeColors[normalized] ?? accountTypeBadgeColors.equity
  );
</script>

<span class="rounded border px-1.5 py-0.5 text-xs font-semibold {classes}">{label}{#if value}<span class="text-xs">{value}</span>{/if}</span>
