<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { page } from '$app/stores';
  import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from '@dnd-kit-svelte/core';
  import { SortableContext, arrayMove } from '@dnd-kit-svelte/sortable';
  import PostingSortableItem from '$lib/components/PostingSortableItem.svelte';
  import DatePicker from '$lib/components/DatePicker.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const detailHref = $derived(() => {
    const id = data.txn.txid ?? data.txn.tindex;
    const ref = $page.url.searchParams.get('ref') ?? '/register';
    return `/tx/${id}?ref=${encodeURIComponent(ref)}`;
  });

  // Parse vendor and note
  const pipeIdx = $derived(data.txn.description.indexOf('|'));
  const vendor = $derived(pipeIdx >= 0 ? data.txn.description.slice(0, pipeIdx).trim() : data.txn.description);
  const note = $derived(pipeIdx >= 0 ? data.txn.description.slice(pipeIdx + 1).trim() : '');

  interface Posting {
    id: string;
    account: string;
    amount: string;
    assertion: string;
  }

  function splitAmount(raw: string): { amount: string; assertion: string } {
    // Balance assignment: starts with "= " (no amount before it)
    if (raw.startsWith('= ')) return { amount: '', assertion: raw.slice(2).trim() };
    // Normal assertion: "amount = assertion"
    const idx = raw.indexOf(' = ');
    if (idx >= 0) return { amount: raw.slice(0, idx).trim(), assertion: raw.slice(idx + 3).trim() };
    return { amount: raw, assertion: '' };
  }

  let nextId = 1;
  function initPostings(): Posting[] {
    const base = data.txn.postings.length >= 2
      ? data.txn.postings.map((p) => ({ id: String(nextId++), account: p.account, ...splitAmount(p.amount) }))
      : [...data.txn.postings.map((p) => ({ id: String(nextId++), account: p.account, ...splitAmount(p.amount) })), { id: String(nextId++), account: '', amount: '', assertion: '' }];
    return base;
  }

  let editPostings = $state<Posting[]>(initPostings());
  $effect(() => { editPostings = initPostings(); });

  let editVendor = $state('');
  let editNote = $state('');
  $effect(() => { editVendor = vendor; editNote = note; });
  let submitting = $state(false);

  function addPosting() {
    editPostings = [...editPostings, { id: String(nextId++), account: '', amount: '', assertion: '' }];
  }

  function removePosting(i: number) {
    if (editPostings.length <= 2) return;
    editPostings = editPostings.filter((_, idx) => idx !== i);
  }

  let activeDragId = $state<string | null>(null);

  function onDragStart(event: DragStartEvent) {
    activeDragId = String(event.active.id);
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    activeDragId = null;
    if (!over || active.id === over.id) return;
    const oldIndex = editPostings.findIndex(p => p.id === String(active.id));
    const newIndex = editPostings.findIndex(p => p.id === String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    editPostings = arrayMove(editPostings, oldIndex, newIndex);
  }

  const sortableIds = $derived(editPostings.map(p => ({ id: p.id })));

  const filledCount = $derived(editPostings.filter((p) => p.account.trim()).length);

  const autoBalanceIdx = $derived(
    editPostings.length >= 2 && editPostings[editPostings.length - 1].amount === ''
      ? editPostings.length - 1
      : -1
  );

  const explicitTotal = $derived(
    editPostings.reduce((sum, p, i) => {
      if (i === autoBalanceIdx) return sum;
      const n = parseFloat(p.amount.replace(/[$,]/g, ''));
      return sum + (isNaN(n) ? 0 : n);
    }, 0)
  );
</script>

<!-- Header -->
<div class="mb-6 animate-in animate-in-1">
  <a href={detailHref()} class="mb-1 inline-block text-sm text-slate-100 hover:text-slate-100 transition-colors">← Back to detail</a>
  <h1 class="text-xl font-semibold text-slate-100">Edit Transaction</h1>
</div>

<!-- Edit Form -->
<div class="rounded-xl border border-slate-400 bg-slate-900 p-6 animate-in animate-in-2">
  <form
    method="POST"
    action="?/update"
    use:enhance={() => {
      submitting = true;
      return async ({ update }) => { submitting = false; await update(); };
    }}
    class="flex flex-col gap-5"
  >
    <input type="hidden" name="postings" value={JSON.stringify(editPostings.map(p => ({
      account: p.account,
      amount: p.amount + (p.assertion ? ` = ${p.assertion}` : '')
    })))} />

    <!-- Date + Vendor + Note -->
    <div class="grid grid-cols-[156px_1fr] gap-3">
      <div class="flex flex-col gap-1.5">
        <label for="date" class="pl-3 text-xs font-semibold tracking-wide text-slate-100">Date</label>
        <DatePicker value={data.txn.date} name="date" />
      </div>
      <div class="flex flex-col gap-1.5">
        <label for="vendor" class="pl-3 text-xs font-semibold tracking-wide text-slate-100">Vendor</label>
        <input
          id="vendor"
          name="vendor"
          type="text"
          bind:value={editVendor}
          required
          autocomplete="off"
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-100 focus:border-blue-300 dark:border-slate-300 dark:bg-slate-950"
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
        bind:value={editNote}
        autocomplete="off"
        class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-100 focus:border-blue-300 dark:border-slate-300 dark:bg-slate-950"
      />
    </div>

    <!-- Postings -->
    <div class="flex flex-col gap-1.5">
      <div class="flex items-center gap-2">
        <span class="w-5 shrink-0"></span>
        <span class="min-w-0 flex-1 pl-3 text-xs font-semibold tracking-wide text-slate-100">Account</span>
        <span class="w-36 shrink-0 pl-3 text-xs font-semibold tracking-wide text-slate-100">Amount</span>
        <span class="shrink-0 w-[13px]"></span>
        <span class="w-36 shrink-0 pl-3 text-xs font-semibold tracking-wide text-slate-100">Assertion</span>
        <span class="w-9 shrink-0"></span>
      </div>
      <DndContext {onDragStart} {onDragEnd}>
        <SortableContext items={sortableIds}>
          <div class="flex flex-col gap-2">
            {#each editPostings as posting, i (posting.id)}
              <PostingSortableItem
                id={posting.id}
                accounts={data.accounts}
                account={posting.account}
                amount={posting.amount}
                assertion={posting.assertion}
                showAssertion={true}
                canRemove={editPostings.length > 2}
                onaccountchange={(v) => (editPostings[i].account = v)}
                onamountchange={(v) => (editPostings[i].amount = v)}
                onassertionchange={(v) => (editPostings[i].assertion = v)}
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

    {#if form?.error}
      <div class="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
        {form.error}
      </div>
    {/if}

    <div class="flex items-center justify-end gap-2 border-t border-slate-400 pt-4">
      <a
        href={detailHref()}
        class="btn-cancel"
      >Cancel</a>
      <button
        type="submit"
        disabled={filledCount < 2 || submitting}
        class="btn-primary relative"
      ><span class={submitting ? 'invisible' : ''}>Save Changes</span>{#if submitting}<span class="absolute inset-0 flex items-center justify-center"><svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" class="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="3" stroke-linecap="round" class="opacity-75" /></svg></span>{/if}</button>
    </div>
  </form>
</div>
