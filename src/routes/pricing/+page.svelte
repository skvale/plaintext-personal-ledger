<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import LearningBanner from '$lib/components/LearningBanner.svelte';

  let { data, form } = $props();

  let editing = $state(false);
  let draft = $state('');
  let editSaving = $state(false);
  let editError = $state('');

  let tickerInput = $state(data.trackedTickers.join(', '));
  let tickerSaving = $state(false);
  let tickerSaveError = $state('');

  let fetchDate = $state(new Date().toISOString().slice(0, 10));
  let fetching = $state(false);
  let fetchResults = $state<{ ticker: string; price: number | null; error?: string }[] | null>(null);
  let fetchSummary = $state('');
  let fetchError = $state('');

  $effect(() => {
    if (form?.saved || form?.populateDone) invalidateAll();
  });

  $effect(() => {
    if (form?.populateResults) fetchResults = form.populateResults;
    if (form?.populateSummary) fetchSummary = form.populateSummary;
    if (form?.populateError) fetchError = form.populateError;
  });
</script>

<LearningBanner id="pricing" title="Price Directives">
  Price directives tell hledger what each investment is worth on a given date. Enter closing prices
  for each ticker — hledger uses them to calculate market value (<code class="font-mono">-V</code>)
  vs. cost basis (<code class="font-mono">-B</code>). Prices are stored in
  <code class="font-mono">pricing.journal</code>.
</LearningBanner>

<div class="mb-6">
  <h1 class="text-xl font-semibold text-slate-100">Pricing</h1>
</div>

<div class="mb-4 grid grid-cols-2 gap-4">
  <div class="rounded-xl border border-slate-400 bg-slate-900 p-5">
    <p class="mb-3 text-xs font-semibold tracking-wide text-slate-100">Tracked Tickers</p>
    <div class="mb-2">
      <input
        bind:value={tickerInput}
        class="w-full rounded-lg border border-slate-300 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-blue-300"
        placeholder=""
      />
    </div>
    {#if tickerSaveError}
      <p class="mb-2 text-xs text-rose-400">{tickerSaveError}</p>
    {/if}
    <button
      onclick={async () => {
        tickerSaving = true;
        tickerSaveError = '';
        const fd = new FormData();
        fd.set('tickers', tickerInput);
        const res = await fetch('?/saveTickers', { method: 'POST', body: fd });
        tickerSaving = false;
        if (!res.ok) {
          tickerSaveError = 'Save failed';
          return;
        }
      }}
      disabled={tickerSaving}
      class="rounded-md bg-blue-300/10 px-3 py-1.5 text-xs font-medium text-blue-500 hover:bg-blue-300/20 disabled:opacity-40"
    >{tickerSaving ? 'Saving…' : 'Save Tickers'}</button>
  </div>

  <div class="rounded-xl border border-slate-400 bg-slate-900 p-5">
    <p class="mb-3 text-xs font-semibold tracking-wide text-slate-100">Fetch Latest Prices</p>
    <form
      method="POST"
      action="?/populate"
      use:enhance={() => {
        fetching = true;
        fetchResults = null;
        fetchSummary = '';
        fetchError = '';
        return async ({ result, update }) => {
          fetching = false;
          if (result.type === 'failure') {
            fetchError = (result.data as any)?.populateError ?? 'Fetch failed';
          }
          await update();
        };
      }}
    >
      <div class="flex gap-2">
        <input
          type="date"
          name="date"
          bind:value={fetchDate}
          max={new Date().toISOString().slice(0, 10)}
          class="w-40 rounded-lg border border-slate-300 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-300"
        />
        <input type="hidden" name="tickers" value={tickerInput} />
        <button
          type="submit"
          disabled={fetching}
          class="rounded-md bg-blue-300/10 px-4 py-2 text-sm font-medium text-blue-500 hover:bg-blue-300/20 disabled:opacity-40"
        >{fetching ? 'Fetching…' : 'Fetch'}</button>
      </div>
    </form>

    {#if fetchError}
      <p class="mt-2 text-sm text-rose-400">{fetchError}</p>
    {/if}

    {#if fetchSummary}
      <p class="mt-2 text-sm text-slate-100">{fetchSummary}</p>
    {/if}

    {#if fetchResults}
      <div class="mt-3 space-y-1">
        {#each fetchResults as r}
          <div class="flex items-center gap-2 text-sm">
            <span class="w-16 font-mono font-semibold text-slate-100">{r.ticker}</span>
            {#if r.price !== null}
              <span class="font-mono text-emerald-400">${r.price.toFixed(2)}</span>
            {:else}
              <span class="text-rose-400">{r.error ?? 'No data'}</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<div class="rounded-xl border border-slate-400 bg-slate-900 p-5">
  <div class="mb-3 flex items-center justify-between">
    <p class="text-xs font-semibold tracking-wide text-slate-100">pricing.journal</p>
    {#if !editing}
      <button
        onclick={() => { draft = data.raw; editing = true; editError = ''; }}
        class="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-100 transition-colors hover:border-slate-400 hover:text-slate-100"
      >Edit</button>
    {/if}
  </div>

  {#if editing}
    <form
      method="POST"
      action="?/save"
      use:enhance={() => {
        editSaving = true;
        editError = '';
        return async ({ result, update }) => {
          editSaving = false;
          if (result.type === 'success') { editing = false; editError = ''; await invalidateAll(); }
          else if (result.type === 'failure') { editError = (result.data as any)?.error ?? 'Save failed'; }
          await update();
        };
      }}
    >
      <textarea
        name="content"
        bind:value={draft}
        class="w-full rounded-lg border border-slate-300 bg-slate-950 px-4 py-3 font-mono text-sm leading-relaxed text-slate-100 outline-none focus:border-blue-300 resize-y"
        rows={Math.max(6, draft.split('\n').length)}
        spellcheck="false"
      ></textarea>
      {#if editError}
        <p class="mt-2 text-sm text-rose-400">{editError}</p>
      {/if}
      <div class="mt-2 flex gap-2">
        <button type="submit" disabled={editSaving} class="rounded-md bg-blue-300/10 px-3 py-1.5 text-sm font-medium text-blue-500 hover:bg-blue-300/20 disabled:opacity-40">
          {editSaving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onclick={() => { editing = false; editError = ''; }} class="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-100 transition-colors hover:border-slate-400">Cancel</button>
      </div>
    </form>
  {:else if data.raw.trim()}
    <pre class="overflow-x-auto whitespace-pre-wrap font-mono text-sm leading-relaxed text-slate-100">{data.raw}</pre>
  {:else}
    <p class="py-8 text-center text-sm text-slate-100">pricing.journal is empty — click Edit to add price directives</p>
  {/if}
</div>
