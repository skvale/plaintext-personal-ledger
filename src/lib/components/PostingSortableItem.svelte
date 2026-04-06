<script lang="ts">
  import { useSortable } from '@dnd-kit-svelte/sortable';
  import { CSS, styleObjectToString } from '@dnd-kit-svelte/utilities';
  import Combobox from '$lib/components/Combobox.svelte';

  let {
    id,
    accounts,
    account,
    amount,
    assertion,
    showAssertion = false,
    canRemove = true,
    onaccountchange,
    onamountchange,
    onassertionchange,
    onremove,
  }: {
    id: string;
    accounts: string[];
    account: string;
    amount: string;
    assertion?: string;
    showAssertion?: boolean;
    canRemove?: boolean;
    onaccountchange: (val: string) => void;
    onamountchange: (val: string) => void;
    onassertionchange?: (val: string) => void;
    onremove: () => void;
  } = $props();

  const { attributes, listeners, node, transform, transition, isDragging, isSorting } = useSortable({ get id() { return id; } });

  const style = $derived(
    styleObjectToString({
      transform: CSS.Transform.toString(transform.current),
      transition: isSorting.current ? transition.current : undefined,
      zIndex: isDragging.current ? 1 : undefined,
    })
  );
</script>

<div class="relative" bind:this={node.current} {style} {...attributes.current}>
  <div class="flex items-center gap-2 {isDragging.current ? 'invisible' : ''}">
    <span
      class="shrink-0 text-slate-100 select-none cursor-grab hover:text-slate-100"
      title="Drag to reorder"
      {...listeners.current}
    >⠿</span>
    <div class="min-w-0 flex-1">
      <Combobox
        items={accounts}
        value={account}
        onchange={onaccountchange}
        inputClass="min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 pr-8 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-100 focus:border-blue-300 dark:border-slate-300 dark:bg-slate-900"
      />
    </div>
    <input
      type="text"
      value={amount}
      oninput={(e) => onamountchange((e.target as HTMLInputElement).value)}
      placeholder=""
      class="w-36 shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-100 outline-none placeholder:text-slate-100 focus:border-blue-300 dark:border-slate-300 dark:bg-slate-900"
    />
    {#if showAssertion}
      <span class="shrink-0 text-sm text-slate-100">=</span>
      <input
        type="text"
        value={assertion ?? ''}
        oninput={(e) => onassertionchange?.((e.target as HTMLInputElement).value)}
        placeholder="balance"
        class="w-36 shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-100 outline-none placeholder:text-slate-100 focus:border-blue-300 dark:border-slate-300 dark:bg-slate-900"
      />
    {/if}
    <button
      type="button"
      onclick={onremove}
      disabled={!canRemove}
      title="Remove posting" aria-label="Remove posting"
      class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-rose-500/30 text-lg text-rose-400 transition-colors hover:border-rose-500/60 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-100 disabled:hover:bg-transparent"
    >×</button>
  </div>
  {#if isDragging.current}
    <div class="absolute inset-0 rounded-lg border-2 border-dashed border-blue-300/40 bg-blue-300/5"></div>
  {/if}
</div>
