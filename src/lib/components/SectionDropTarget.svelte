<script lang="ts">
  import { useSortable } from '@dnd-kit-svelte/sortable';
  import { CSS, styleObjectToString } from '@dnd-kit-svelte/utilities';

  let { id, label }: { id: string; label: string } = $props();

  const { attributes, node, transform, transition, isSorting } = useSortable({ get id() { return id; }, disabled: true });

  const style = $derived(
    styleObjectToString({
      transform: CSS.Transform.toString(transform.current),
      transition: isSorting.current ? transition.current : undefined,
    })
  );
</script>

<div bind:this={node.current} {style} {...attributes.current}>
  <div class="flex items-center gap-2 py-1">
    <div class="h-px flex-1 bg-slate-800"></div>
    <span class="text-xs font-semibold tracking-wide text-slate-100">{label}</span>
    <div class="h-px flex-1 bg-slate-800"></div>
  </div>
</div>
