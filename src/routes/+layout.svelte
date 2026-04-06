<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { invalidateAll, goto, beforeNavigate, afterNavigate } from '$app/navigation';
  import SailboatLogo from '$lib/components/SailboatLogo.svelte';
  import { theme } from '$lib/theme.svelte.js';
  import { Dialog } from 'bits-ui';
  import type { SidebarItemConfig } from '$lib/settings.js';
  import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from '@dnd-kit-svelte/core';
  import { SortableContext, arrayMove } from '@dnd-kit-svelte/sortable';
  import SidebarNavItem from '$lib/components/SidebarNavItem.svelte';

  let { children, data } = $props();

  // Registry of all available built-in nav items
  const NAV_REGISTRY: Record<string, { href: string; label: string; icon: string; key?: string }> = {
    dashboard:    { href: '/dashboard',   label: 'Dashboard',    icon: '◈',  key: 'g d' },
    register:     { href: '/register',   label: 'Register',     icon: '≡',  key: 'g r' },
    accounts:     { href: '/accounts',   label: 'Accounts',     icon: '◉',  key: 'g a' },
    balancesheet: { href: '/balancesheet', label: 'Balance Sheet', icon: '⊞' },
    pnl:          { href: '/income',     label: 'P&L',          icon: '↑↓' },
    cashflow:     { href: '/cashflow',   label: 'Cash Flow',    icon: '⇅' },
    budget:       { href: '/budget',     label: 'Budget',       icon: '◎',  key: 'g b' },
    portfolio:    { href: '/portfolio',  label: 'Portfolio',    icon: '◑',  key: 'g p' },
    vendors:      { href: '/vendors',    label: 'Vendors',      icon: '⊙',  key: 'g v' },
    forecast:     { href: '/forecast',   label: 'Forecast',     icon: '◷',  key: 'g f' },
    reconcile:    { href: '/reconcile',  label: 'Reconcile',    icon: '✓',  key: 'g c' },
    triage:       { href: '/triage',     label: 'Triage',       icon: '⚑',  key: 'g t' },
    docs:         { href: '/docs',       label: 'Documents',    icon: '◻' },
    mappings:     { href: '/mappings',   label: 'Import Mappings', icon: '⊟', key: 'g m' },
    git:          { href: '/git',        label: 'History',      icon: '⎇' },
    check:        { href: '/check',      label: 'Journal Check', icon: '✗' },
    welcome:      { href: '/welcome',    label: 'Welcome',      icon: '👋', key: 'g w' },
    settings:     { href: '/settings',   label: 'Settings',     icon: '⚙',  key: 'g s' }
  };

  // Resolved nav items from settings
  type ResolvedNavItem =
    | { kind: 'link'; href: string; label: string; icon: string; id: string }
    | { kind: 'divider' }
    | { kind: 'section'; label: string };

  function resolveNav(items: SidebarItemConfig[]): ResolvedNavItem[] {
    return items.flatMap((item): ResolvedNavItem[] => {
      if (item === 'divider') return [{ kind: 'divider' }];
      if (typeof item === 'string') {
        const reg = NAV_REGISTRY[item];
        if (!reg) return [];
        return [{ kind: 'link', id: item, href: reg.href, label: reg.label, icon: reg.icon }];
      }
      if (item.type === 'section') return [{ kind: 'section', label: item.label }];
      if (item.type === 'custom') return [{ kind: 'link', id: item.href, href: item.href, label: item.label, icon: item.icon }];
      return [];
    });
  }

  // Keyboard navigation — derived from NAV_REGISTRY key bindings
  const routeMap: Record<string, string> = Object.fromEntries(
    Object.values(NAV_REGISTRY)
      .filter((item) => item.key)
      .map((item) => [item.key!.split(' ')[1], item.href])
  );

  let contentEl = $state<HTMLDivElement | undefined>(undefined);

  // Save scroll positions per URL so back navigation restores them
  const scrollPositions = new Map<string, number>();

  beforeNavigate(({ from }) => {
    if (from?.url && contentEl) {
      scrollPositions.set(from.url.pathname + from.url.search, contentEl.scrollTop);
    }
  });

  let prevPathname = '';
  afterNavigate(({ from, type }) => {
    showAllGlossary = false;
    if (!contentEl) return;
    const key = $page.url.pathname + $page.url.search;
    const saved = scrollPositions.get(key);
    // Don't scroll if only query params changed (e.g. month selector)
    const samePage = from?.url.pathname === $page.url.pathname;
    if ((type === 'popstate' || type === 'link') && saved !== undefined) {
      contentEl.scrollTo({ top: saved });
      scrollPositions.delete(key);
    } else if (!samePage) {
      contentEl.scrollTo({ top: 0 });
    }
  });

  let sidebarOpen = $state(false);
  let showHelp = $state(false);
  let showGlossary = $state(false);
  let showAllGlossary = $state(false);
  let searchEl = $state<HTMLInputElement | undefined>(undefined);
  let searchQuery = $state('');

  // Sidebar drag-and-drop reorder (dnd-kit)
  // Each nav item needs a stable ID for dnd-kit
  function navItemId(item: SidebarItemConfig, idx: number): string {
    if (item === 'divider') return `divider-${idx}`;
    if (typeof item === 'string') return item;
    if (item.type === 'section') return `section-${item.label}`;
    if (item.type === 'custom') return `custom-${item.href}`;
    return `item-${idx}`;
  }

  interface DndNavItem { id: string; config: SidebarItemConfig }
  let dndItems = $state<DndNavItem[]>([]);
  $effect(() => {
    if (data?.settings?.sidebar?.items?.map) {
      dndItems = data.settings.sidebar.items.map((c, i) => ({ id: navItemId(c, i), config: c }));
    }
  });

  const navItems = $derived(resolveNav(dndItems.map(d => d.config)));

  let activeNavId = $state<string | null>(null);
  const activeNavItem = $derived(activeNavId ? navItems[dndItems.findIndex(d => d.id === activeNavId)] : null);

  function onNavDragStart(event: DragStartEvent) {
    activeNavId = event.active.id as string;
  }

  async function onNavDragEnd({ active, over }: DragEndEvent) {
    activeNavId = null;
    if (!over || active.id === over.id) return;

    const oldIndex = dndItems.findIndex(d => d.id === active.id);
    const newIndex = dndItems.findIndex(d => d.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    dndItems = arrayMove(dndItems, oldIndex, newIndex);
    const items = dndItems.map(d => d.config);
    // Save in background — local state is already correct, no need to re-render
    fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sidebar: { items } })
    });
  }

  const learningEnabled = $derived(data.settings?.learning?.enabled ?? false);

  // Keyboard shortcut items for the help dialog — follows sidebar order
  const navShortcutItems = $derived(
    dndItems
      .map(d => typeof d.config === 'string' ? NAV_REGISTRY[d.config] : null)
      .filter((reg): reg is NonNullable<typeof reg> => !!reg?.key)
      .map(reg => ({ key: reg.key!, label: reg.label, href: reg.href }))
  );

  const glossaryTerms = [
    { term: 'Transaction', def: 'A financial event — buying groceries, getting paid, transferring money. Each transaction has a date, description, and two or more postings.' },
    { term: 'Posting', def: 'One line of a transaction. A $50 grocery purchase has two postings: +$50 to expenses:food and −$50 from assets:checking. Postings always balance to zero.' },
    { term: 'Account', def: 'A category for money. Organized in a tree like folders: assets:bank:checking, expenses:food:restaurants. There are 5 top-level types: assets, liabilities, income, expenses, equity.' },
    { term: 'Journal', def: 'The plain text file where all your transactions live. It\'s the single source of truth for your finances — human-readable and version-controlled.' },
    { term: 'Debit', def: 'The "where money went" side of a transaction. Buying $50 of groceries puts a $50 debit on expenses:food — your food spending went up by $50.' },
    { term: 'Credit', def: 'The "where money came from" side. That same grocery purchase puts a $50 credit on checking — $50 left your bank account to pay for it.' },
    { term: 'Double-Entry', def: 'Every transaction affects at least two accounts. Money never appears or disappears — it just moves. This is why all postings in a transaction sum to zero.' },
    { term: 'Balance Sheet', def: 'A snapshot of what you own (assets) vs. what you owe (liabilities) at a point in time. The difference is your net worth.' },
    { term: 'P&L / Income Statement', def: 'A summary of money in (income) vs. money out (expenses) over a time period. Shows whether you\'re saving or overspending.' },
    { term: 'Reconcile', def: 'Confirming your records match your bank\'s records. Mark transactions as "cleared" once verified. Catches errors and missing entries.' },
    { term: 'Net Worth', def: 'Assets minus liabilities. Everything you own minus everything you owe. The single number that summarizes your financial position.' },
    { term: 'Commodity', def: 'The unit of an amount — usually a currency like USD or EUR, but can also be stock shares (AAPL), crypto (BTC), or anything you track.' },
    { term: 'Forecast', def: 'A projection of future transactions based on your recurring rules. Shows what your balances will look like if nothing unexpected happens.' },
    { term: 'Budget', def: 'A spending target you set for an account (usually expenses). Compare what you planned to spend vs. what you actually spent.' },
    { term: 'Vendor', def: 'Who you paid or who paid you. The name that appears on a transaction — a store, employer, landlord, etc.' },
    { term: 'Recurring', def: 'A transaction that happens on a schedule — rent, subscriptions, paychecks. Defined as rules that generate forecast entries.' },
    { term: 'Cost Basis', def: 'What you originally paid for an investment. The difference between current value and cost basis is your unrealized gain or loss.' },
    { term: 'Unrealized Gain', def: 'The increase in value of an investment you still hold. It\'s "unrealized" because you haven\'t sold — the gain only becomes real when you do.' },
  ];

  // Map routes to relevant glossary terms
  const pageTerms: Record<string, string[]> = {
    '/dashboard':   ['Transaction', 'Net Worth', 'Account', 'Posting'],
    '/register':    ['Transaction', 'Posting', 'Double-Entry', 'Debit', 'Credit', 'Account'],
    '/accounts':    ['Account', 'Double-Entry', 'Commodity'],
    '/balancesheet': ['Balance Sheet', 'Net Worth', 'Account'],
    '/income':      ['P&L / Income Statement', 'Account'],
    '/cashflow':    ['Account', 'Net Worth'],
    '/budget':      ['Budget', 'Account'],
    '/portfolio':   ['Commodity', 'Cost Basis', 'Unrealized Gain', 'Account'],
    '/vendors':      ['Vendor', 'Transaction'],
    '/forecast':    ['Forecast', 'Recurring', 'Account'],
    '/reconcile':   ['Reconcile', 'Transaction', 'Account'],
    '/triage':      ['Transaction', 'Account', 'Posting'],
    '/add':         ['Transaction', 'Posting', 'Double-Entry', 'Account'],
    '/docs':        ['Journal', 'Transaction'],
    '/git':         ['Journal'],
    '/check':       ['Journal', 'Account'],
    '/welcome':     ['Journal', 'Transaction', 'Account', 'Double-Entry'],
    '/tx':          ['Transaction', 'Posting', 'Double-Entry', 'Debit', 'Credit', 'Account'],
  };

  const filteredGlossary = $derived(() => {
    const path = $page.url.pathname;
    // Match exact or prefix (for /tx/123 etc.)
    const terms = pageTerms[path] ?? Object.entries(pageTerms).find(([k]) => k !== '/' && path.startsWith(k))?.[1];
    if (!terms) return glossaryTerms;
    return glossaryTerms.filter(g => terms.includes(g.term));
  });

  function handleSearch(e: Event) {
    e.preventDefault();
    if (searchQuery.trim()) {
      goto(`/register?q=${encodeURIComponent(searchQuery.trim())}`);
      searchQuery = '';
    }
  }

  onMount(() => {
    // Sync theme with html class applied by inline script in app.html
    theme.isDark = document.documentElement.classList.contains('dark');

    const es = new EventSource('/events');
    es.addEventListener('journal-changed', () => invalidateAll());

    let gDown = false;
    let gTimer: ReturnType<typeof setTimeout>;

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

      if (e.key === 'Escape') {
        if (inInput) (target as HTMLElement).blur();
        showHelp = false;
        showGlossary = false;
        sidebarOpen = false;
        gDown = false;
        return;
      }

      if (e.key === '?' && !inInput) {
        showHelp = !showHelp;
        return;
      }

      if (e.key === 'g' && gDown && !inInput && learningEnabled) {
        showHelp = false;
        showGlossary = !showGlossary;
        gDown = false;
        return;
      }

      if (e.key === '/' && !inInput) {
        e.preventDefault();
        searchEl?.focus();
        return;
      }

      if (inInput) return;

      if (e.key === 'n') { showHelp = false; goto(`/add?from=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }

      if (e.key === 'g') {
        gDown = true;
        clearTimeout(gTimer);
        gTimer = setTimeout(() => { gDown = false; }, 1200);
        return;
      }

      if (gDown) {
        const dest = routeMap[e.key];
        if (dest) { showHelp = false; goto(dest); gDown = false; clearTimeout(gTimer); }
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      es.close();
      document.removeEventListener('keydown', onKey);
      clearTimeout(gTimer);
    };
  });

  function toggleTheme() {
    theme.isDark = !theme.isDark;
    document.documentElement.classList.toggle('dark', theme.isDark);
    try { localStorage.setItem('theme', theme.isDark ? 'dark' : 'light'); } catch {}
  }
</script>

<!-- Mobile overlay backdrop -->
{#if sidebarOpen}
  <div
    class="fixed inset-0 z-40 bg-black/60 md:hidden"
    role="button"
    tabindex="-1"
    onclick={() => (sidebarOpen = false)}
    onkeydown={(e) => e.key === 'Enter' && (sidebarOpen = false)}
  ></div>
{/if}

<div class="flex h-screen overflow-hidden bg-slate-950">
  <!-- Sidebar -->
  <aside
    class="sidebar fixed inset-y-0 left-0 z-50 flex w-52 shrink-0 flex-col border-r border-slate-400 bg-slate-900 transition-transform md:relative md:translate-x-0
      {sidebarOpen ? 'translate-x-0' : '-translate-x-full'}"
  >
    <!-- Brand -->
    <div class="flex items-center gap-2.5 border-b border-slate-400 px-4 py-4">
      <SailboatLogo withText class="h-10 shrink-0" />
      <button
        onclick={() => (sidebarOpen = false)}
        class="btn-close ml-auto text-base md:hidden"
        aria-label="Close menu"
      >×</button>
    </div>

    <!-- Add Transaction CTA -->
    <div class="border-b border-slate-400 p-3">
      <a
        href="/add"
        onclick={() => (sidebarOpen = false)}
        class="cta-glow flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors
          {$page.url.pathname === '/add'
          ? 'bg-blue-400 text-white'
          : 'bg-blue-300/20 text-blue-400 hover:bg-blue-300/30'}"
      >
        <span class="text-base leading-none">+</span>
        Add Transaction
      </a>
    </div>

    <!-- Nav -->
    <nav class="sidebar-nav-scroll flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
      <DndContext onDragStart={onNavDragStart} onDragEnd={onNavDragEnd}>
        <SortableContext items={dndItems}>
          {#each dndItems as dndItem, i (dndItem.id)}
            {@const resolved = navItems[i]}
            {#if resolved}
              <SidebarNavItem id={dndItem.id} item={resolved} uncategorizedCount={data.uncategorizedCount} onsidebarclose={() => (sidebarOpen = false)} />
            {/if}
          {/each}
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {#if activeNavItem && activeNavItem.kind === 'link'}
            <div class="flex items-center gap-2.5 rounded-md bg-slate-900 border border-slate-300 px-3 py-2 text-sm font-medium text-slate-100 shadow-md shadow-black/30">
              <span class="!text-slate-100 text-sm">⠿</span>
              <span class="w-4 text-center text-sm">{activeNavItem.icon}</span>
              <span>{activeNavItem.label}</span>
            </div>
          {:else if activeNavItem && activeNavItem.kind === 'divider'}
            <div class="divider-gradient mx-3 my-1 w-40"></div>
          {:else if activeNavItem && activeNavItem.kind === 'section'}
            <div class="px-3 pb-0.5 text-xs font-semibold uppercase tracking-widest text-slate-100">{activeNavItem.label}</div>
          {/if}
        </DragOverlay>
      </DndContext>
      <!-- Settings always at bottom of nav -->
      <a
        href="/settings"
        onclick={() => (sidebarOpen = false)}
        class="mt-auto flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors
          {$page.url.pathname === '/settings'
          ? 'bg-blue-400/10 text-blue-400'
          : 'text-slate-100 hover:bg-slate-800 hover:text-slate-100'}"
      >
        <span class="w-4 text-center text-sm">⚙</span>
        <span class="flex-1">Settings</span>
      </a>
    </nav>

    <!-- Journal health -->
    <div class="p-3" style="border-top: 1px solid transparent; border-image: linear-gradient(to right, transparent, var(--color-slate-700), transparent) 1;">
      {#if data.journalCheck.ok}
        <div class="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-100">
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
          Journal OK
        </div>
      {:else}
        <a
          href="/check"
          class="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/10"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
          Journal error
          <span class="ml-auto text-xs text-rose-500/60">▸</span>
        </a>
      {/if}
    </div>

    <!-- Keyboard hint -->
    <div class="p-3" style="border-top: 1px solid transparent; border-image: linear-gradient(to right, transparent, var(--color-slate-700), transparent) 1;">
      <button
        onclick={() => (showHelp = true)}
        class="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-slate-100 transition-colors hover:text-slate-100"
      >
        <span>⌨</span> Keyboard shortcuts
        <kbd class="ml-auto rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-slate-100">?</kbd>
      </button>
    </div>
  </aside>

  <!-- Main content -->
  <main class="flex min-w-0 flex-1 flex-col overflow-hidden">
    <!-- Top bar -->
    <div class="flex shrink-0 items-center gap-3 border-b border-slate-400 px-4 py-2">
      <!-- Hamburger (mobile) -->
      <button
        onclick={() => (sidebarOpen = true)}
        class="flex h-8 w-8 items-center justify-center rounded-md text-slate-100 hover:bg-slate-800 hover:text-slate-100 md:hidden"
        aria-label="Open menu"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <!-- Search -->
      <form onsubmit={handleSearch} class="flex flex-1 max-w-xs items-center">
        <div class="relative flex-1">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-100">/</span>
          <input
            bind:this={searchEl}
            bind:value={searchQuery}
            type="search"
            placeholder="Search transactions…"
            class="w-full rounded-lg border border-slate-300 bg-slate-900 py-1.5 pl-7 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-100 focus:border-blue-300"
          />
        </div>
      </form>

      <div class="flex items-center gap-2 ml-auto">
        <!-- Glossary toggle (only when learning mode is on) -->
        {#if learningEnabled}
          <button
            onclick={() => (showGlossary = !showGlossary)}
            title="Accounting glossary (g g)"
            class="flex items-center gap-1.5 rounded-full border border-blue-400/30 bg-blue-400/10 px-3 py-1.5 text-sm font-medium text-blue-400 transition-colors hover:border-blue-400/50 hover:text-blue-400"
          >
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Glossary
          </button>
        {/if}
        <!-- Theme toggle -->
        <button
          onclick={toggleTheme}
          title={theme.isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          class="flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-100 transition-colors hover:border-slate-600 hover:text-slate-100"
        >
          {#if theme.isDark}
            <span class="text-sm">☀</span> Light
          {:else}
            <span class="text-sm">☾</span> Dark
          {/if}
        </button>
      </div>
    </div>

    <!-- Page content -->
    <div bind:this={contentEl} class="flex-1 overflow-y-auto">
      <div class="mx-auto max-w-5xl px-4 pb-8 pt-5 sm:px-8">
        {#if data.hledgerMissing}
          <div class="rounded-xl border border-rose-500/30 bg-rose-500/5 p-6 mb-6">
            <h2 class="text-lg font-semibold text-rose-400 mb-2">hledger not found</h2>
            <p class="text-sm text-slate-100 mb-4">
              This app requires <a href="https://hledger.org" class="text-blue-500 underline underline-offset-2" target="_blank">hledger</a> to be installed and available on your PATH.
            </p>
            <div class="rounded-lg bg-slate-800 p-4 font-mono text-sm text-slate-100 space-y-2">
              <p class="text-slate-100"># macOS (Homebrew)</p>
              <p>brew install hledger</p>
              <p class="text-slate-100 mt-3"># Linux / WSL</p>
              <p>curl -sO https://hledger.org/install.sh && bash install.sh</p>
              <p class="text-slate-100 mt-3"># Or via Stack / Cabal</p>
              <p>stack install hledger</p>
            </div>
            <p class="text-sm text-slate-100 mt-4">Once installed, restart the dev server.</p>
          </div>
        {/if}
        {@render children()}
      </div>
    </div>
  </main>
</div>

<!-- Keyboard shortcuts help modal -->
<Dialog.Root bind:open={showHelp}>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-50 bg-black/60" />
    <Dialog.Content class="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-300 bg-slate-900 p-6 shadow-2xl">
      <div class="mb-4 flex items-center justify-between">
        <Dialog.Title class="text-base font-semibold text-slate-100">Keyboard Shortcuts</Dialog.Title>
        <Dialog.Close class="btn-close h-8 w-8 rounded-lg text-lg">×</Dialog.Close>
      </div>
      <Dialog.Description class="sr-only">List of keyboard shortcuts for navigating the application</Dialog.Description>
      <div class="space-y-1 text-sm">
        {#each [
          { key: 'n', label: 'New transaction', href: '/add' },
          { key: '/', label: 'Focus search' },
          { key: '?', label: 'Toggle this help' },
          { key: 'Esc', label: 'Close modal' },
        ] as item}
          <div class="flex items-center justify-between gap-4 px-2 py-1.5">
            <span class="text-slate-100">{item.label}</span>
            <kbd class="rounded border border-slate-300 bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-100">{item.key}</kbd>
          </div>
        {/each}
        <div class="border-t border-slate-400 my-2"></div>
        {#each navShortcutItems as item}
          <a
            href={item.href}
            onclick={() => (showHelp = false)}
            class="flex items-center justify-between gap-4 rounded-md px-2 py-1.5 transition-colors hover:bg-slate-800"
          >
            <span class="text-slate-100">{item.label}</span>
            <kbd class="rounded border border-slate-300 bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-100">{item.key}</kbd>
          </a>
        {/each}
        <div class="border-t border-slate-400 my-2"></div>
        <button
          onclick={() => { showHelp = false; showGlossary = true; }}
          class="flex w-full items-center justify-between gap-4 rounded-md px-2 py-1.5 transition-colors hover:bg-slate-800"
        >
          <span class="text-slate-100">Glossary</span>
          <kbd class="rounded border border-slate-300 bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-100">g g</kbd>
        </button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<!-- Glossary slide-out panel -->
<Dialog.Root bind:open={showGlossary}>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-50 bg-black/40" />
    <Dialog.Content
      class="fixed right-0 top-0 z-50 h-full w-full max-w-sm overflow-y-auto border-l border-slate-300 bg-slate-900 p-6 shadow-2xl"
      style="animation: slide-in-right 0.25s ease-out both;"
    >
      <div class="mb-5 flex items-center justify-between">
        <Dialog.Title class="text-base font-semibold text-slate-100">Accounting Glossary</Dialog.Title>
        <Dialog.Close class="btn-close h-8 w-8 rounded-lg text-lg">×</Dialog.Close>
      </div>
      <Dialog.Description class="mb-5 text-sm leading-relaxed text-slate-100">
        Terms relevant to this page.
      </Dialog.Description>
      <div class="space-y-4">
        {#each filteredGlossary() as { term, def }}
          <div class="rounded-lg border border-slate-400 bg-slate-800/40 px-4 py-3">
            <dt class="mb-1 text-sm font-semibold text-blue-500">{term}</dt>
            <dd class="text-sm leading-relaxed text-slate-100">{def}</dd>
          </div>
        {/each}
      </div>
      {#if filteredGlossary().length < glossaryTerms.length}
        <button
          onclick={() => { showAllGlossary = !showAllGlossary; }}
          class="mt-4 w-full text-center text-sm text-slate-100 hover:text-slate-100 transition-colors"
        >{showAllGlossary ? 'Show fewer' : `Show all ${glossaryTerms.length} terms`}</button>
        {#if showAllGlossary}
          <div class="mt-4 space-y-4">
            {#each glossaryTerms.filter(g => !filteredGlossary().includes(g)) as { term, def }}
              <div class="rounded-lg border border-slate-400/50 bg-slate-800/20 px-4 py-3">
                <dt class="mb-1 text-sm font-semibold text-slate-100">{term}</dt>
                <dd class="text-sm leading-relaxed text-slate-100">{def}</dd>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
