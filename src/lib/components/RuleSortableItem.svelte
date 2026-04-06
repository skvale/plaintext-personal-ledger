<script lang="ts">
  import { useSortable } from '@dnd-kit-svelte/sortable';
  import { CSS, styleObjectToString } from '@dnd-kit-svelte/utilities';
  import Combobox from '$lib/components/Combobox.svelte';

  let {
    id,
    item,
    accounts,
    onupdate,
    onremove,
    onupdateassignment,
    onaddassignment,
    onremoveassignment,
    oncreateaccount,
  }: {
    id: string;
    item: { patterns: string; account: string; assignments?: { key: string; value: string }[] };
    accounts: string[];
    onupdate: (field: 'patterns' | 'account', value: string) => void;
    onremove: () => void;
    onupdateassignment: (idx: number, field: 'key' | 'value', val: string) => void;
    onaddassignment: () => void;
    onremoveassignment: (idx: number) => void;
    oncreateaccount?: (name: string) => void;
  } = $props();

  const { attributes, listeners, node, transform, transition, isDragging, isSorting } = useSortable({ get id() { return id; } });

  const style = $derived(
    styleObjectToString({
      transform: CSS.Transform.toString(transform.current),
      transition: isSorting.current ? transition.current : undefined,
      zIndex: isDragging.current ? 1 : undefined,
    })
  );

  let expanded = $state(false);
  const extraAssignments = $derived((item.assignments ?? []).filter(a => a.key !== 'account2'));
  const hasExtra = $derived(extraAssignments.length > 0);
  const isAccountField = (key: string) => /^account\d+$/.test(key);
</script>

<div class="relative" bind:this={node.current} {style} {...attributes.current}>
  <div
    class="rounded-md border border-slate-400 bg-slate-900 mb-1.5 transition-colors hover:border-slate-300
      {isDragging.current ? 'invisible' : ''}"
  >
    <!-- Main row: pattern → account -->
    <div class="group flex items-center gap-2 px-3 py-2">
      <span
        class="shrink-0 text-slate-100 select-none cursor-grab hover:text-slate-100"
        title="Drag to reorder"
        {...listeners.current}
      >⠿</span>

      <input
        type="text"
        placeholder="PATTERN|ANOTHER"
        value={item.patterns}
        oninput={(e) => onupdate('patterns', (e.target as HTMLInputElement).value)}
        class="flex-1 min-w-0 bg-transparent font-mono text-sm text-amber-400/80 outline-none placeholder:text-slate-100"
      />

      <span class="shrink-0 text-sm text-slate-100">→</span>

      <div class="flex-1 min-w-0">
        <Combobox
          items={accounts}
          value={item.account}
          onchange={(val) => onupdate('account', val)}
          oncreate={oncreateaccount}
          placeholder="expenses:…"
          inputClass="w-full border border-slate-300 rounded-md bg-slate-900 px-2 py-1 pr-6 font-mono text-sm text-emerald-400/80 placeholder:text-slate-100 focus:border-blue-300 outline-none"
        />
      </div>

      {#if hasExtra}
        <button
          type="button"
          onclick={() => (expanded = !expanded)}
          class="flex h-7 shrink-0 items-center gap-1 rounded-md border border-blue-300/30 bg-blue-300/5 px-2 text-xs font-mono text-blue-500 transition-colors hover:bg-blue-300/10"
        >
          <svg class="h-3 w-3 transition-transform {expanded ? 'rotate-180' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>
          +{extraAssignments.length}
        </button>
      {:else}
        <button
          type="button"
          onclick={() => { onaddassignment(); expanded = true; }}
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-400 text-slate-100 opacity-0 group-hover:opacity-100 transition-all hover:border-slate-600 hover:text-slate-100"
          title="Add extra fields"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      {/if}

      <button
        type="button"
        onclick={onremove}
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-rose-500/30 text-rose-400 transition-colors hover:border-rose-500/60 hover:bg-rose-500/10"
        aria-label="Remove mapping"
        title="Remove mapping"
      ><svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
    </div>

    <!-- Extra assignments -->
    {#if expanded && hasExtra}
      <div class="border-t border-slate-400 px-3 py-2 pl-9 space-y-1.5">
        {#each (item.assignments ?? []) as assign, i}
          {#if assign.key !== 'account2'}
            <div class="flex items-center gap-2">
              <input
                type="text"
                value={assign.key}
                oninput={(e) => onupdateassignment(i, 'key', (e.target as HTMLInputElement).value)}
                class="w-24 shrink-0 rounded border border-slate-300 bg-slate-900 px-1.5 py-0.5 font-mono text-xs text-slate-100 outline-none focus:border-blue-300"
                placeholder="field"
              />
              {#if isAccountField(assign.key)}
                <div class="flex-1 min-w-0">
                  <Combobox
                    items={accounts}
                    value={assign.value}
                    onchange={(val) => onupdateassignment(i, 'value', val)}
                    oncreate={oncreateaccount}
                    placeholder="account…"
                    inputClass="w-full border border-slate-300 rounded-md bg-slate-900 px-2 py-1 pr-6 font-mono text-sm text-slate-100 placeholder:text-slate-100 focus:border-blue-300 outline-none"
                  />
                </div>
              {:else}
                <input
                  type="text"
                  value={assign.value}
                  oninput={(e) => onupdateassignment(i, 'value', (e.target as HTMLInputElement).value)}
                  class="flex-1 rounded border border-slate-300 bg-slate-900 px-2 py-1 font-mono text-sm text-slate-100 outline-none focus:border-blue-300 placeholder:text-slate-100"
                  placeholder="value"
                />
              {/if}
              <button
                type="button"
                onclick={() => onremoveassignment(i)}
                aria-label="Remove field"
                class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-100 transition-colors hover:text-rose-400"
              ><svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
            </div>
          {/if}
        {/each}
        <button
          type="button"
          onclick={onaddassignment}
          class="text-xs text-slate-100 hover:text-slate-100 transition-colors"
        >+</button>
      </div>
    {/if}
  </div>
  {#if isDragging.current}
    <div class="absolute inset-0 mb-1.5 rounded-md border-2 border-dashed border-blue-300/40 bg-blue-300/5"></div>
  {/if}
</div>
