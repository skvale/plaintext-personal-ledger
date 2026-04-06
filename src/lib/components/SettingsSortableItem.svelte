<script lang="ts">
  import { useSortable } from '@dnd-kit-svelte/sortable';
  import { CSS, styleObjectToString } from '@dnd-kit-svelte/utilities';

  let {
    id,
    item,
    onUnpin,
    getActiveIds,
  }: {
    id: string;
    item: { label: string; icon: string; description: string };
    onUnpin?: () => void;
    getActiveIds?: () => string[];
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
  <div
    class="flex items-center gap-3 rounded-lg border border-slate-400 bg-slate-900 px-3 py-2.5 mb-1
      {isDragging.current ? 'invisible' : ''}"
  >
    <span class="text-slate-100 select-none cursor-grab hover:text-slate-100" title="Drag to reorder" {...listeners.current}>⠿</span>
    <span class="w-5 text-center text-sm text-slate-100">{item.icon}</span>
    <div class="flex-1 min-w-0">
      <p class="text-sm font-medium text-slate-100">{item.label}</p>
      <p class="text-xs text-slate-100">{item.description}</p>
    </div>
    <button
      type="button"
      title="Unpin"
      class="flex items-center gap-1 rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-100 hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
      onclick={async () => {
        onUnpin?.();
        const items = getActiveIds?.() ?? [];
        await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sidebar: { items } }),
        });
      }}
    >
      <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M15 9.34V7a1 1 0 0 1 1-1 7 7 0 0 0-8 0 1 1 0 0 1 1 1v2.34L7.11 11.23A2 2 0 0 0 6 13v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1a2 2 0 0 0-1.11-1.79Z"/></svg>
      Unpin
    </button>
  </div>
  {#if isDragging.current}
    <div class="absolute inset-0 mb-1 rounded-lg border-2 border-dashed border-blue-300/40 bg-blue-300/5"></div>
  {/if}
</div>
