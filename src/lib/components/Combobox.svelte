<script lang="ts">
  import { Combobox } from 'bits-ui';
  import { accountColor, accountWithoutType } from '$lib/account-colors.js';
  import AccountBadge from '$lib/components/AccountBadge.svelte';
  import AccountLabel from '$lib/components/AccountLabel.svelte';

  interface Props {
    items: string[];
    value: string;
    onchange?: (val: string) => void;
    /** Called when a new freeform value is created (not in items list) */
    oncreate?: (val: string) => void;
    placeholder?: string;
    name?: string;
    disabled?: boolean;
    inputClass?: string;
    /** Group items by top-level prefix (e.g. "assets", "expenses") */
    grouped?: boolean;
    /** Allow selecting top-level accounts (e.g. "expenses") as values */
    allowTopLevel?: boolean;
  }

  let { items, value, onchange, oncreate, placeholder = '', name, disabled = false, inputClass = '', grouped = true, allowTopLevel = false }: Props = $props();

  // svelte-ignore state_referenced_locally
  let inputValue = $state(value);
  let open = $state(false);
  let userTyped = $state(false);

  // Only sync inputValue from parent when user isn't actively typing
  $effect(() => { if (!userTyped) inputValue = value; });

  const TOP_LEVELS = ['assets', 'liabilities', 'income', 'expenses', 'equity'];

  interface DisplayItem {
    value: string;
    label: string;
  }

  const filtered = $derived(
    userTyped && inputValue.trim()
      ? items.filter((i) => i.toLowerCase().includes(inputValue.toLowerCase()))
      : items
  );

  // Show a "Create" option when the typed value doesn't exactly match any existing item
  const showCreateOption = $derived(
    userTyped && inputValue.trim() && !items.some((i) => i.toLowerCase() === inputValue.trim().toLowerCase())
  );

  const displayItems = $derived<DisplayItem[]>(
    filtered.map(i => ({ value: i, label: i }))
  );

  // Include create option in items so bits-ui can navigate to it natively
  const allItems = $derived<{ value: string; label: string }[]>(
    showCreateOption && displayItems.length === 0
      ? [{ value: '__create__', label: inputValue.trim() }]
      : displayItems.map(i => ({ value: i.value, label: i.label }))
  );

  // svelte-ignore state_referenced_locally
  let prevValue = $state(value);
  $effect(() => { prevValue = value; });
  function handleValueChange(val: string) {
    // Prevent deselection — clicking the same item should keep it, not clear it
    if (!val) {
      value = prevValue;
      inputValue = prevValue;
      open = false;
      return;
    }
    // Handle create option
    if (val === '__create__') {
      const typed = inputValue.trim();
      inputValue = typed;
      userTyped = false;
      prevValue = typed;
      value = typed;
      oncreate?.(typed);
      onchange?.(typed);
      return;
    }
    const label = items.find((i) => i === val) ?? val;
    inputValue = label;
    userTyped = false;
    if (!items.includes(val)) oncreate?.(val);
    onchange?.(val);
  }

  // Show badge display when a valid account value is selected and dropdown is closed
  const showBadge = $derived(!open && !userTyped && !!value && TOP_LEVELS.includes(value.split(':')[0]));
</script>

<Combobox.Root
  type="single"
  {name}
  {disabled}
  bind:value
  bind:open
  inputValue={inputValue}
  onValueChange={handleValueChange}
  onOpenChange={(isOpen) => {
    if (!isOpen) {
      // When dropdown closes, reset typing state and sync input to actual value
      userTyped = false;
      inputValue = value;
    }
  }}
  items={allItems}
>
  <div class="relative w-full">
    <Combobox.Input
      {placeholder}
      {disabled}
      autocomplete="off"
      class="{inputClass} flex-1 focus:ring-1 focus:ring-blue-400/50 focus:border-blue-300 {showBadge ? '!text-transparent !caret-transparent' : ''}"
      aria-label={placeholder || 'Select an account'}
      onclick={() => { if (!open) open = true; }}
      onfocus={() => { userTyped = false; open = true; }}
      oninput={(e: Event) => { userTyped = true; inputValue = (e.target as HTMLInputElement).value; }}
      onblur={() => {
        if (userTyped && !inputValue.trim() && value) {
          prevValue = '';
          value = '';
          onchange?.('');
          userTyped = false;
        } else if (userTyped && inputValue.trim() && inputValue.trim() !== value) {
          const typed = inputValue.trim();
          prevValue = typed;
          value = typed;
          onchange?.(typed);
          userTyped = false;
        }
      }}
    />
    {#if showBadge}
      <span class="absolute left-3 right-8 top-1/2 -translate-y-1/2 flex items-center gap-0.5 pointer-events-none overflow-hidden">
        <AccountBadge account={value} />
        {#if value.includes(':')}
          <span class="font-mono text-sm truncate {accountColor(value)}">:{accountWithoutType(value)}</span>
        {/if}
      </span>
    {/if}
    <span
      class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-100 text-lg leading-none transition-transform pointer-events-none {open ? 'rotate-180' : ''}"
    >▾</span>

    {#if open && (displayItems.length > 0 || showCreateOption)}
      <Combobox.Content
        class="popover-caret z-50 rounded-xl border border-slate-300 bg-slate-900 shadow-xl"
        style="min-width: max(var(--bits-combobox-anchor-width), 280px); pointer-events: auto;"
        sideOffset={12}
        forceMount={false}
      >
        <Combobox.Viewport class="max-h-72 overflow-y-auto py-1">
        {#if showCreateOption}
          <Combobox.Item
            value="__create__"
            label={inputValue.trim()}
            class="flex w-full cursor-pointer items-center gap-2 text-left text-sm px-3 py-1.5 transition-colors hover:bg-slate-800 data-[highlighted]:bg-blue-300/10 text-slate-100 rounded-xl"
          >
            <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span class="font-mono text-sm">Create {inputValue.trim()}</span>
          </Combobox.Item>
        {/if}
        {#each displayItems as item (item.value)}
          {@const isTopLevel = !item.value.includes(':')}
          {#if isTopLevel && !allowTopLevel}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="w-full px-3 py-2 mt-1 first:mt-0 text-left"
              onmousedown={(e) => e.preventDefault()}
            ><AccountBadge account={item.value} size="md" /></div>
          {:else}
            <Combobox.Item
              value={item.value}
              label={item.label}
              class="flex w-full cursor-pointer items-center text-left text-sm transition-colors hover:bg-slate-800 data-[highlighted]:bg-blue-300/10 {item.value === value ? 'bg-slate-800/80' : ''} {isTopLevel ? 'px-3 py-2 mt-1 first:mt-0' : 'px-3 py-1.5 pl-6'}"
            >
              {#if isTopLevel}
                <AccountBadge account={item.value} size="md" />
              {:else}
                <AccountLabel account={item.value} />
              {/if}
            </Combobox.Item>
          {/if}
        {/each}
        </Combobox.Viewport>
      </Combobox.Content>
    {/if}
  </div>
</Combobox.Root>
