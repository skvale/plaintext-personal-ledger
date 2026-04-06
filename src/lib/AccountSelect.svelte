<script lang="ts">
  interface Props {
    accounts: string[];
    value: string;
    placeholder?: string;
    onchange: (value: string) => void;
    name?: string;
    inputClass?: string;
    class?: string;
  }

  let { accounts, value, placeholder = '', onchange, name, inputClass, class: cls = '' }: Props = $props();

  let query = $state('');
  let open = $state(false);
  let highlightIndex = $state(0);
  let inputEl: HTMLInputElement;
  let listEl = $state<HTMLUListElement | undefined>(undefined);

  // Group accounts by top-level category
  const TOP_LEVELS = ['assets', 'liabilities', 'income', 'expenses', 'equity'];

  interface GroupedItem {
    type: 'category' | 'account';
    value: string;
    label: string;
    depth: number;
  }

  const grouped = $derived.by(() => {
    const sorted = [...accounts].sort((a, b) => a.localeCompare(b));
    const q = query.trim().toLowerCase();

    const filtered = q
      ? sorted.filter(a => a.toLowerCase().includes(q))
      : sorted;

    const items: GroupedItem[] = [];
    let lastCategory = '';

    for (const acct of filtered) {
      const cat = acct.split(':')[0];
      if (cat !== lastCategory && TOP_LEVELS.includes(cat)) {
        items.push({ type: 'category', value: cat, label: cat, depth: 0 });
        lastCategory = cat;
      }
      // Don't show the bare top-level if it's identical to the category header
      if (acct !== cat) {
        items.push({ type: 'account', value: acct, label: acct, depth: 1 });
      }
    }
    return items;
  });

  // Selectable items only (both categories and accounts)
  const selectableItems = $derived(grouped);
  const selectableCount = $derived(selectableItems.length);

  $effect(() => { query = value ?? ''; });

  function select(val: string) {
    query = val;
    open = false;
    onchange(val);
  }

  function clear() {
    query = '';
    open = false;
    onchange('');
  }

  function onkeydown(e: KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { open = true; highlightIndex = 0; }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); highlightIndex = Math.min(highlightIndex + 1, selectableCount - 1); scrollHighlighted(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlightIndex = Math.max(highlightIndex - 1, 0); scrollHighlighted(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const item = selectableItems[highlightIndex];
      if (item) select(item.value);
    }
    else if (e.key === 'Escape') { open = false; inputEl.blur(); }
  }

  function scrollHighlighted() {
    const el = listEl?.children[highlightIndex] as HTMLElement;
    el?.scrollIntoView({ block: 'nearest' });
  }

  function oninput() {
    open = true;
    highlightIndex = 0;
  }

  function onblur(e: FocusEvent) {
    if (!listEl?.contains(e.relatedTarget as Node)) {
      open = false;
      if (!accounts.includes(query) && !TOP_LEVELS.includes(query)) { query = value; }
    }
  }
</script>

<div class="relative {cls}">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="flex cursor-text items-center rounded-lg border border-slate-300 bg-slate-950 px-3 py-2 focus-within:border-blue-300"
    onmousedown={(e) => { if (e.target !== inputEl) { e.preventDefault(); if (open) { open = false; inputEl.blur(); } else { inputEl.focus(); } } }}
  >
    <input
      bind:this={inputEl}
      bind:value={query}
      type="text"
      {placeholder}
      autocomplete="off"
      spellcheck="false"
      class="flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-100 min-w-0"
      onfocus={() => { open = true; highlightIndex = 0; }}
      {onkeydown}
      {oninput}
      {onblur}
    />
    {#if value}
      <button
        type="button"
        onmousedown={(e) => { e.stopPropagation(); e.preventDefault(); clear(); }}
        class="ml-1 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-slate-100 hover:text-slate-100 text-sm"
      >×</button>
    {:else}
      <span class="ml-1 shrink-0 text-slate-100 text-lg leading-none transition-transform {open ? 'rotate-180' : ''}">▾</span>
    {/if}
  </div>

  {#if open && selectableCount > 0}
    <ul
      bind:this={listEl as HTMLUListElement}
      class="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-300 bg-slate-900 py-1 shadow-xl"
    >
      {#each selectableItems as item, i}
        <li>
          {#if item.type === 'category'}
            <button
              type="button"
              class="w-full px-3 py-2 text-left text-sm font-semibold capitalize tracking-wide transition-colors
                {i === highlightIndex ? 'bg-blue-300/20 text-blue-500' : 'text-slate-100 hover:bg-slate-800'}"
              onmousedown={(e) => { e.preventDefault(); select(item.value); }}
              onmousemove={() => highlightIndex = i}
            >{item.label}</button>
          {:else}
            <button
              type="button"
              class="w-full px-3 py-1.5 pl-6 text-left font-mono text-sm truncate transition-colors
                {i === highlightIndex ? 'bg-blue-300/20 text-blue-500' : 'text-slate-100 hover:bg-slate-800'}"
              onmousedown={(e) => { e.preventDefault(); select(item.value); }}
              onmousemove={() => highlightIndex = i}
            >{item.label}</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
