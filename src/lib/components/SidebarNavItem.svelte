<script lang="ts">
  import { page } from '$app/stores';
  import { useSortable } from '@dnd-kit-svelte/sortable';
  import { CSS, styleObjectToString } from '@dnd-kit-svelte/utilities';

  let {
    id,
    item,
    uncategorizedCount = 0,
    onsidebarclose,
  }: {
    id: string;
    item: { kind: 'link'; href: string; label: string; icon: string; id: string } | { kind: 'divider' } | { kind: 'section'; label: string };
    uncategorizedCount?: number;
    onsidebarclose?: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  const { attributes, listeners, node, transform, transition, isDragging, isSorting } = useSortable({ id });

  const style = $derived(
    styleObjectToString({
      transform: CSS.Transform.toString(transform.current),
      transition: transition.current ?? undefined,
      zIndex: isDragging.current ? 1 : undefined,
    })
  );
</script>

<div class="relative" bind:this={node.current} {style} {...attributes.current}>
  {#if item.kind === 'divider'}
    <div class="divider-gradient mx-3 my-1 cursor-grab {isDragging.current ? 'invisible' : ''}" {...listeners.current}></div>
    {#if isDragging.current}
      <div class="absolute inset-0 mx-1 rounded-md border-2 border-dashed border-blue-300/40 bg-blue-300/5"></div>
    {/if}
  {:else if item.kind === 'section'}
    <div class="mt-2 px-3 pb-0.5 text-xs font-semibold uppercase tracking-widest text-slate-100 cursor-grab {isDragging.current ? 'invisible' : ''}" {...listeners.current}>{item.label}</div>
    {#if isDragging.current}
      <div class="absolute inset-0 mx-1 rounded-md border-2 border-dashed border-blue-300/40 bg-blue-300/5"></div>
    {/if}
  {:else if item.kind === 'link'}
    <a
      href={item.href}
      onclick={() => onsidebarclose?.()}
      class="relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium
        {isDragging.current ? 'invisible' : ''}
{$page.url.pathname === item.href || (item.href !== '/' && $page.url.pathname.startsWith(item.href + '/'))
          ? 'text-blue-400'
          : 'text-slate-100 hover:bg-slate-800 hover:text-slate-100'}"
    >
      {#if ($page.url.pathname === item.href || (item.href !== '/' && $page.url.pathname.startsWith(item.href + '/'))) && !isDragging.current}
        <div class="absolute inset-0 rounded-md bg-blue-400/10" style="view-transition-name: nav-pill;"></div>
      {/if}
      <span class="relative text-sm text-slate-100 cursor-grab hover:text-slate-100 select-none" {...listeners.current}>⠿</span>
      <span class="relative w-4 text-center text-sm">{item.icon}</span>
      <span class="relative flex-1">{item.label}</span>
      {#if item.href === '/triage' && uncategorizedCount > 0}
        <span class="relative rounded-full bg-amber-500/20 px-1.5 py-0.5 text-xs font-semibold text-amber-400">
          {uncategorizedCount}
        </span>
      {/if}
    </a>
    {#if isDragging.current}
      <div class="absolute inset-0 mx-1 rounded-md border-2 border-dashed border-blue-300/40 bg-blue-300/5"></div>
    {/if}
  {/if}
</div>
