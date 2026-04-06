<script lang="ts">
  let {
    value = 1,
    options = [1, 3, 6],
    labels,
    onchange,
  }: {
    value?: number;
    options?: number[];
    labels?: Record<number, string>;
    onchange: (n: number) => void;
  } = $props();

  const defaultLabels: Record<number, string> = { 1: 'Current' };
  function label(n: number): string {
    return labels?.[n] ?? defaultLabels[n] ?? `${n}mo`;
  }
</script>

<div class="flex items-center gap-1">
  {#each options as n}
    <button
      onclick={() => onchange(n)}
      class="{value === n ? 'btn-pill-active' : 'btn-pill'}"
    >{label(n)}</button>
  {/each}
</div>
