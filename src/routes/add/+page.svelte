<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from '@dnd-kit-svelte/core';
  import { SortableContext, arrayMove } from '@dnd-kit-svelte/sortable';
  import PostingSortableItem from '$lib/components/PostingSortableItem.svelte';
  import LearningBanner from '$lib/components/LearningBanner.svelte';
  import DatePicker from '$lib/components/DatePicker.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const referrer = $derived($page.url.searchParams.get('from') || (typeof document !== 'undefined' ? document.referrer : ''));
  const cancelHref = $derived(() => {
    if (referrer) {
      try {
        const url = new URL(referrer, window.location.origin);
        if (url.origin === window.location.origin && url.pathname !== '/add') {
          return url.pathname + url.search;
        }
      } catch { /* ignore */ }
    }
    return '/dashboard';
  });

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Local state for form fields - persists when accounts are selected
  let vendor = $state('');
  let note = $state('');

  // Initialize from form data (on validation failure)
  $effect(() => {
    if (form?.vendor !== undefined) vendor = form.vendor;
    if (form?.note !== undefined) note = form.note;
  });

  interface Posting {
    id: string;
    account: string;
    amount: string;
  }

  let nextId = 3;
  let postings = $state<Posting[]>([
    { id: '1', account: '', amount: '' },
    { id: '2', account: '', amount: '' }
  ]);

  function addPosting() {
    postings = [...postings, { id: String(nextId++), account: '', amount: '' }];
  }

  function removePosting(i: number) {
    if (postings.length <= 2) return;
    postings = postings.filter((_, idx) => idx !== i);
  }

  let activeDragId = $state<string | null>(null);

  function onDragStart(event: DragStartEvent) {
    activeDragId = String(event.active.id);
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    activeDragId = null;
    if (!over || active.id === over.id) return;
    const oldIndex = postings.findIndex(p => p.id === String(active.id));
    const newIndex = postings.findIndex(p => p.id === String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    postings = arrayMove(postings, oldIndex, newIndex);
  }

  const sortableIds = $derived(postings.map(p => ({ id: p.id })));

  let submitting = $state(false);

  const filledCount = $derived(postings.filter((p) => p.account.trim()).length);

  const autoBalanceIdx = $derived(
    postings.length >= 2 && postings[postings.length - 1].amount === ''
      ? postings.length - 1
      : -1
  );

  const explicitTotal = $derived(
    postings.reduce((sum, p, i) => {
      if (i === autoBalanceIdx) return sum;
      const n = parseFloat(p.amount.replace(/[$,]/g, ''));
      return sum + (isNaN(n) ? 0 : n);
    }, 0)
  );
</script>

<!-- Header -->
<div class="mb-6 animate-in animate-in-1">
  <a href={cancelHref()} class="mb-1 inline-block text-sm text-slate-100 hover:text-slate-100 transition-colors">← Back</a>
  <h1 class="text-xl font-semibold text-slate-100">Add Transaction</h1>
</div>

<LearningBanner id="add-transaction" title="How postings work" tips={[
  { text: 'Every transaction needs at least <strong>two postings</strong> that balance to zero. Money always moves <em>from</em> one account <em>to</em> another.' },
  { text: 'Leave the last posting\'s amount blank and it will be auto-calculated to balance the transaction.' },
  { text: 'You can type a new account name directly — if it doesn\'t exist yet, you\'ll see a <strong>+ Create</strong> option in the dropdown.' },
  { text: 'Use <strong>negative amounts</strong> for the source account — where the money comes from. For example: <span class="inline-flex whitespace-nowrap items-center"><span class="inline-flex shrink-0 rounded border font-mono font-semibold capitalize align-text-bottom px-0.5 py-0 text-xs leading-4 border-[#fca5a5] bg-[#fef2f2] text-[#dc2626] dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400">Expenses</span><span class="font-mono text-xs text-rose-400">:food:groceries</span></span> <code>$50</code> and <span class="inline-flex whitespace-nowrap items-center"><span class="inline-flex shrink-0 rounded border font-mono font-semibold capitalize align-text-bottom px-0.5 py-0 text-xs leading-4 border-[#93c5fd] bg-[#eff6ff] text-[#1d4ed8] dark:border-blue-300/20 dark:bg-blue-300/10 dark:text-blue-500">Assets</span><span class="font-mono text-xs text-blue-500">:bank:checking</span></span> <code>-$50</code>, or charging dinner: <span class="inline-flex whitespace-nowrap items-center"><span class="inline-flex shrink-0 rounded border font-mono font-semibold capitalize align-text-bottom px-0.5 py-0 text-xs leading-4 border-[#fca5a5] bg-[#fef2f2] text-[#dc2626] dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400">Expenses</span><span class="font-mono text-xs text-rose-400">:food:dining</span></span> <code>$30</code> and <span class="inline-flex whitespace-nowrap items-center"><span class="inline-flex shrink-0 rounded border font-mono font-semibold capitalize align-text-bottom px-0.5 py-0 text-xs leading-4 border-[#fcd34d] bg-[#fffbeb] text-[#b45309] dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">Liabilities</span><span class="font-mono text-xs text-amber-400">:credit-card</span></span> <code>-$30</code>.' },
  { text: 'Track investments by checking your brokerage and entering what the account is worth now using a <strong>balance assertion</strong>.<br/>In the amount field, type <code>= $12,500</code> — hledger calculates the difference automatically. Use <span class="inline-flex whitespace-nowrap items-center"><span class="inline-flex shrink-0 rounded border font-mono font-semibold capitalize align-text-bottom px-0.5 py-0 text-xs leading-4 border-[#93c5fd] bg-[#eff6ff] text-[#1d4ed8] dark:border-blue-300/20 dark:bg-blue-300/10 dark:text-blue-500">Assets</span><span class="font-mono text-xs text-blue-500">:investments:vanguard</span></span> <code>= $12,500</code> and balance it against <span class="inline-flex whitespace-nowrap items-center"><span class="inline-flex shrink-0 rounded border font-mono font-semibold capitalize align-text-bottom px-0.5 py-0 text-xs leading-4 border-[#6ee7b7] bg-[#ecfdf5] text-[#047857] dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">Income</span><span class="font-mono text-xs text-emerald-400">:unrealized-gains</span></span> to track growth over time.' },
]} />

<!-- Form -->
<div class="rounded-xl border border-slate-400 bg-slate-900 p-6 animate-in animate-in-2">
  <form method="POST" use:enhance={() => {
      submitting = true;
      return async ({ result }) => {
        submitting = false;
        if (result.type === 'redirect') {
          goto((result as { location: string }).location);
        }
      };
    }} class="flex flex-col gap-5">
    <input type="hidden" name="postings" value={JSON.stringify(postings.map(p => ({ account: p.account, amount: p.amount })))} />

    <!-- Date + Vendor + Note -->
    <div class="grid grid-cols-[156px_1fr] gap-3">
      <div class="flex flex-col gap-1.5">
        <label for="date" class="pl-3 text-xs font-semibold tracking-wide text-slate-100">Date</label>
        <DatePicker value={form?.date ?? today} name="date" />
      </div>
      <div class="flex flex-col gap-1.5">
        <label for="vendor" class="pl-3 text-xs font-semibold tracking-wide text-slate-100">Vendor</label>
        <input
          id="vendor"
          name="vendor"
          type="text"
          bind:value={vendor}
          required
          autocomplete="off"
          autofocus
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-300 dark:border-slate-300 dark:bg-slate-950"
        />
      </div>
    </div>
    <div class="flex flex-col gap-1.5">
      <label for="note" class="pl-3 text-xs font-semibold tracking-wide text-slate-100">
        Note <span class="font-normal text-slate-100">— optional</span>
      </label>
      <input
        id="note"
        name="note"
        type="text"
        bind:value={note}
        autocomplete="off"
        class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-300 dark:border-slate-300 dark:bg-slate-950"
      />
    </div>

    <!-- Postings -->
    <div class="flex flex-col gap-1.5">
      <div class="flex items-center gap-2">
        <span class="w-5 shrink-0"></span>
        <span class="min-w-0 flex-1 pl-3 text-xs font-semibold tracking-wide text-slate-100">Account</span>
        <span class="w-36 shrink-0 pl-3 text-xs font-semibold tracking-wide text-slate-100">Amount</span>
        <span class="w-9 shrink-0"></span>
      </div>
      <DndContext {onDragStart} {onDragEnd}>
        <SortableContext items={sortableIds}>
          <div class="flex flex-col gap-2">
            {#each postings as posting, i (posting.id)}
              <PostingSortableItem
                id={posting.id}
                accounts={data.accounts}
                account={posting.account}
                amount={posting.amount}
                canRemove={postings.length > 2}
                onaccountchange={(v) => (postings[i].account = v)}
                onamountchange={(v) => (postings[i].amount = v)}
                onremove={() => removePosting(i)}
              />
            {/each}
          </div>
        </SortableContext>
        <DragOverlay />
      </DndContext>
      <button
        type="button"
        onclick={addPosting}
        class="mt-1 w-full rounded-lg border border-dashed border-slate-300 py-2 text-sm text-slate-100 transition-colors hover:border-blue-300/50 hover:text-blue-500 hover:bg-blue-300/5"
      >+ Add posting</button>
    </div>

    <!-- Error -->
    {#if form?.error}
      <div class="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
        {form.error}
      </div>
    {/if}

    <!-- Actions -->
    <div class="flex items-center justify-end gap-2 border-t border-slate-400 pt-4">
      <a
        href={cancelHref()}
        class="btn-cancel"
      >Cancel</a>
      <button
        type="submit"
        disabled={filledCount < 2 || submitting}
        class="btn-primary relative"
      ><span class={submitting ? 'invisible' : ''}>Save Transaction</span>{#if submitting}<span class="absolute inset-0 flex items-center justify-center"><svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" class="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="3" stroke-linecap="round" class="opacity-75" /></svg></span>{/if}</button>
    </div>
  </form>
</div>
