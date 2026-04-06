<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from '@dnd-kit-svelte/core';
  import { SortableContext, arrayMove } from '@dnd-kit-svelte/sortable';
  import SettingsSortableItem from '$lib/components/SettingsSortableItem.svelte';

  let { data, form } = $props();

  const ALL_ITEMS: Record<string, { label: string; icon: string; description: string; href: string }> = {
    welcome:      { label: 'Welcome',       icon: '👋', description: 'Getting started guide, opening balances, and resources', href: '/welcome' },
    dashboard:    { label: 'Dashboard',     icon: '◈',  description: 'Overview: net worth, recent spending, income', href: '/dashboard' },
    register:     { label: 'Register',      icon: '≡',  description: 'Full transaction list with search and filter', href: '/register' },
    accounts:     { label: 'Accounts',      icon: '◉',  description: 'Account tree with current balances', href: '/accounts' },
    balancesheet: { label: 'Balance Sheet',  icon: '⊞',  description: 'Assets, liabilities, and equity at a point in time', href: '/balancesheet' },
    pnl:          { label: 'P&L',           icon: '↑↓', description: 'Income vs expenses over a period', href: '/income' },
    cashflow:     { label: 'Cash Flow',     icon: '⇅',  description: 'Money flowing in and out of accounts', href: '/cashflow' },
    budget:       { label: 'Budget',        icon: '◎',  description: 'Track spending against planned amounts', href: '/budget' },
    portfolio:    { label: 'Portfolio',     icon: '◑',  description: 'Investment accounts with market values', href: '/portfolio' },
    vendors:      { label: 'Vendors',       icon: '⊙',  description: 'Vendors with spending history and trends', href: '/vendors' },
    forecast:     { label: 'Forecast',      icon: '◷',  description: 'Future balance projection and recurring rules', href: '/forecast' },
    reconcile:    { label: 'Reconcile',     icon: '✓',  description: 'Match transactions against bank statements', href: '/reconcile' },
    triage:       { label: 'Triage',        icon: '⚑',  description: 'Review transactions and assign accounts', href: '/triage' },
    docs:         { label: 'Documents',     icon: '◻',  description: 'Statement files and CSV import', href: '/docs' },
    mappings:     { label: 'Import Mappings', icon: '⊟',  description: 'Edit CSV import mappings (.rules files)', href: '/mappings' },
    git:          { label: 'History',       icon: '⎇',  description: 'Transaction history and git diff viewer', href: '/git' },
    check:        { label: 'Journal Check', icon: '✗',  description: 'Detect errors in the journal file', href: '/check' },
  };

  // Active sidebar items in current order
  let activeIds = $state<string[]>([]);
  $effect(() => {
    if (!data || !data.settings || !Array.isArray(data.settings.sidebar?.items)) return;
    activeIds = (data.settings.sidebar.items as string[]).filter((x): x is string => typeof x === 'string' && x in ALL_ITEMS);
  });

  // Items not in the sidebar
  const availableIds = $derived(
    data && data.settings && Array.isArray(data.settings.sidebar?.items)
      ? Object.keys(ALL_ITEMS).filter((id) => !activeIds.includes(id))
      : []
  );

  // Drag state (dnd-kit)
  let saving = $state(false);
  let activeDragId = $state<string | null>(null);
  const activeDragItem = $derived(activeDragId ? ALL_ITEMS[activeDragId] : null);

  function onDragStart(event: DragStartEvent) {
    activeDragId = event.active.id as string;
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    if (activeIds.length === 0) return;
    activeDragId = null;
    if (!over || active.id === over.id) return;

    const oldIndex = activeIds.indexOf(active.id as string);
    const newIndex = activeIds.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;

    activeIds = arrayMove(activeIds, oldIndex, newIndex);
    saving = true;
    const fd = new FormData();
    fd.set('order', JSON.stringify(activeIds));
    await fetch('?/reorder', { method: 'POST', body: fd });
    saving = false;
    await invalidateAll();
  }

  let learningEnabled = $state(false);
  let learningLevel = $state('beginner');
  let showCurrencySymbol = $state(true);
  let roundAmounts = $state(false);
  $effect(() => {
    if (!data || !data.settings) return;
    learningEnabled = data.settings.learning?.enabled ?? true;
    learningLevel = data.settings.learning?.level ?? 'beginner';
    showCurrencySymbol = data.settings.display?.showCurrencySymbol !== false;
    roundAmounts = data.settings.display?.roundAmounts === true;
  });
</script>

<div class="space-y-8 max-w-2xl">
  <div>
    <h1 class="text-lg font-semibold text-slate-100">Settings</h1>
    <p class="mt-0.5 text-sm text-slate-100">
      Saved to <code class="font-mono text-slate-100">settings.json</code> in your journal directory.
      Edit that file directly for full control.
    </p>
  </div>

  <!-- Sidebar items -->
  <section>
    <h2 class="mb-1 text-sm font-semibold text-slate-100">Sidebar</h2>
    <p class="mb-4 text-sm text-slate-100">
      Drag to reorder. {saving ? 'Saving...' : ''}
    </p>

    <!-- Active items (draggable) -->
    <DndContext {onDragStart} {onDragEnd}>
      <SortableContext items={activeIds.length > 0 ? activeIds.map(id => ({ id })) : []}>
        {#each activeIds as id (id)}
          {@const item = ALL_ITEMS[id]}
          {#if item}
            <SettingsSortableItem {id} {item} onUnpin={() => {
              activeIds = activeIds.filter((x) => x !== id);
            }} getActiveIds={() => activeIds} />
          {/if}
        {/each}
      </SortableContext>

      <DragOverlay>
        {#if activeDragItem}
          <div class="flex items-center gap-3 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 shadow-lg">
            <span class="text-slate-100 select-none">⠿</span>
            <span class="w-5 text-center text-sm text-slate-100">{activeDragItem.icon}</span>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-slate-100">{activeDragItem.label}</p>
              <p class="text-xs text-slate-100">{activeDragItem.description}</p>
            </div>
          </div>
        {/if}
      </DragOverlay>
    </DndContext>

    <!-- Available items -->
    {#if availableIds.length > 0}
      <p class="mt-5 mb-2 text-xs font-semibold tracking-wide text-slate-100">Available</p>
      <div class="space-y-1">
        {#each availableIds as id (id)}
          {@const item = ALL_ITEMS[id]}
          {#if item}
            <div class="flex items-center gap-3 rounded-lg border border-slate-400/60 bg-slate-900/50 px-3 py-2.5">
              <span class="w-5 text-center text-sm text-slate-100">{item.icon}</span>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-slate-100">{item.label}</p>
                <p class="text-xs text-slate-100">{item.description}</p>
              </div>
              <a
                href={item.href}
                class="rounded-md px-2.5 py-1 text-xs font-medium text-slate-100 hover:text-slate-100 transition-colors"
              >Preview</a>
              <button
                type="button"
                title="Pin"
                class="flex items-center gap-1 rounded-md bg-blue-300/10 px-2.5 py-1 text-xs font-medium text-blue-500 hover:bg-blue-300/20 transition-colors"
                onclick={async () => {
                  if (!activeIds.includes(id)) activeIds = [...activeIds, id];
                  await fetch('/api/settings', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sidebar: { items: activeIds } }),
                  });
                }}
              >
                <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M15 9.34V7a1 1 0 0 1 1-1 7 7 0 0 0-8 0 1 1 0 0 1 1 1v2.34L7.11 11.23A2 2 0 0 0 6 13v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1a2 2 0 0 0-1.11-1.79Z"/></svg>
                Pin
              </button>
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </section>

  <!-- Display -->
  <section>
    <h2 class="mb-1 text-sm font-semibold text-slate-100">Display</h2>
    <p class="mb-4 text-sm text-slate-100">
      How amounts and numbers are shown.
    </p>
    <form
      method="POST"
      action="?/setDisplay"
      use:enhance={() => async ({ result }) => {
        if (result.type === 'success') await invalidateAll();
      }}
      class="rounded-lg border border-slate-400 bg-slate-900 p-4 space-y-4"
    >
      <label class="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          name="showCurrencySymbol"
          value="true"
          checked={showCurrencySymbol}
          onchange={(e) => {
            showCurrencySymbol = (e.target as HTMLInputElement).checked;
            (e.target as HTMLInputElement).form?.requestSubmit();
          }}
          class="accent-blue-400 w-4 h-4"
        />
        <div>
          <p class="text-sm font-medium text-slate-100">Show currency symbol</p>
          <p class="text-xs text-slate-100">Display $, £, etc. next to amounts</p>
        </div>
      </label>
      <label class="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          name="roundAmounts"
          value="true"
          checked={roundAmounts}
          onchange={(e) => {
            roundAmounts = (e.target as HTMLInputElement).checked;
            (e.target as HTMLInputElement).form?.requestSubmit();
          }}
          class="accent-blue-400 w-4 h-4"
        />
        <div>
          <p class="text-sm font-medium text-slate-100">Round to nearest dollar</p>
          <p class="text-xs text-slate-100">Hide cents everywhere except transaction details</p>
        </div>
      </label>
    </form>
  </section>

  <!-- Learning mode -->
  <section id="learning">
    <h2 class="mb-1 text-sm font-semibold text-slate-100">Learning Mode</h2>
    <p class="mb-4 text-sm text-slate-100">
      New to personal finance or double-entry accounting? Learning mode shows explanations and guides throughout the UI.
    </p>
    <form
      method="POST"
      action="?/setLearning"
      use:enhance={() => async ({ result }) => {
        if (result.type === 'success') await invalidateAll();
      }}
      class="rounded-lg border border-slate-400 bg-slate-900 p-4 space-y-4"
    >
      <label class="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          name="enabled"
          value="true"
          checked={learningEnabled}
          onchange={(e) => (learningEnabled = (e.target as HTMLInputElement).checked)}
          class="accent-blue-400 w-4 h-4"
        />
        <div>
          <p class="text-sm font-medium text-slate-100">Enable learning mode</p>
          <p class="text-xs text-slate-100">Show tooltips, concept explanations, and tour prompts</p>
        </div>
      </label>

      {#if learningEnabled}
        <div class="pl-7 space-y-2">
          <p class="text-sm text-slate-100 font-medium">Detail level</p>
          {#each [
            { value: 'beginner', label: 'Beginner', desc: 'Plain English with help banners on each page' },
            { value: 'advanced', label: 'Advanced', desc: 'Full accounting language, no hand-holding' }
          ] as opt}
            <label class="flex items-start gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="level"
                value={opt.value}
                checked={learningLevel === opt.value}
                onchange={() => (learningLevel = opt.value as typeof learningLevel)}
                class="mt-1 accent-blue-400"
              />
              <div class="flex flex-col">
                <span class="text-sm font-medium text-slate-100">{opt.label}</span>
                <span class="text-xs text-slate-100">{opt.desc}</span>
              </div>
            </label>
          {/each}
        </div>
      {/if}

      <div class="flex items-center gap-3 pt-1 whitespace-nowrap">
        <button
          type="submit"
          class="rounded-md bg-blue-300/10 px-3 py-1.5 text-sm font-medium text-blue-500 hover:bg-blue-300/20 transition-colors"
        >
          Save
        </button>
        {#if form?.success}
          <span class="text-sm text-emerald-400">Saved</span>
        {/if}
        {#if data?.settings?.learning?.completedTours?.length + (data?.settings?.learning?.dismissedTips?.length ?? 0) > 0}
          {@const totalDismissed = (data?.settings?.learning?.completedTours?.length ?? 0) + (data?.settings?.learning?.dismissedTips?.length ?? 0)}
          <button
            type="button"
            onclick={async () => {
              await fetch('/api/dismiss-tour', { method: 'DELETE' });
              await invalidateAll();
            }}
            class="ml-auto rounded-md px-3 py-1.5 text-sm text-slate-100 hover:text-slate-100 transition-colors"
          >
            Reset {totalDismissed} dismissed tip{totalDismissed === 1 ? '' : 's'}
          </button>
        {/if}
      </div>
    </form>
  </section>

  <!-- Import settings -->
  <section id="import">
    <h2 class="mb-1 text-sm font-semibold text-slate-100">Import</h2>
    <p class="mb-4 text-sm text-slate-100">
      Settings for CSV import behavior.
    </p>
    <form
      method="POST"
      action="?/setImport"
      use:enhance={() => async ({ result }) => {
        if (result.type === 'success') await invalidateAll();
      }}
      class="rounded-lg border border-slate-400 bg-slate-900 p-4 space-y-4"
    >
      <label class="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          name="suggestions"
          value="true"
          checked={data?.settings?.import?.suggestions !== false}
          class="accent-blue-400 w-4 h-4"
        />
        <div>
          <p class="text-sm font-medium text-slate-100">Smart account suggestions</p>
          <p class="text-xs text-slate-100">Suggest expense accounts for unmapped transactions based on description keywords and journal history</p>
        </div>
      </label>
      <button
        type="submit"
        class="rounded-md bg-blue-300/10 px-3 py-1.5 text-sm font-medium text-blue-500 hover:bg-blue-300/20 transition-colors"
      >
        Save
      </button>
    </form>
  </section>

  <!-- Raw JSON editor -->
  <section>
    <h2 class="mb-1 text-sm font-semibold text-slate-100">Raw JSON</h2>
    <p class="mb-4 text-sm text-slate-100">
      Edit <code class="font-mono text-slate-100">settings.json</code> directly for full control,
      including section labels, custom links, and dividers.
      See <code class="font-mono text-slate-100">settings.schema.json</code> for the complete reference.
    </p>
    <form
      method="POST"
      action="?/save"
      use:enhance={() => async ({ result }) => {
        if (result.type === 'success') await invalidateAll();
      }}
      class="space-y-3"
    >
      <textarea
        name="json"
        rows="20"
        spellcheck="false"
        class="w-full rounded-lg border border-slate-300 bg-slate-900 px-3 py-2.5 font-mono text-sm text-slate-100 outline-none focus:border-blue-300 resize-y"
        value={data.rawJson}
      ></textarea>
      <div class="flex items-center gap-3">
        <button
          type="submit"
          class="rounded-md bg-blue-300/10 px-3 py-1.5 text-sm font-medium text-blue-500 hover:bg-blue-300/20 transition-colors"
        >
          Save JSON
        </button>
        {#if form?.error}
          <span class="text-sm text-rose-400">{form.error}</span>
        {/if}
        {#if form?.success}
          <span class="text-sm text-emerald-400">Saved</span>
        {/if}
      </div>
    </form>
  </section>
</div>
