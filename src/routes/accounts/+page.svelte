<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData, ActionData } from './$types';
  import LearningBanner from '$lib/components/LearningBanner.svelte';
  import Combobox from '$lib/components/Combobox.svelte';
  import { accountTail, accountColor } from '$lib/account-colors.js';
  import AccountBadge from '$lib/components/AccountBadge.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let adding = $state(false);
  let baseAccount = $state('expenses');
  let subPath = $state('');

  // All existing account names (including synthesized parents) for the base picker
  const allAccounts = $derived.by(() => {
    if (!data?.accounts) return [];
    const nameSet = new Set(data.accounts.map(a => a.name));
    for (const acc of data.accounts) {
      const parts = acc.name.split(':');
      for (let i = 1; i < parts.length; i++) {
        nameSet.add(parts.slice(0, i).join(':'));
      }
    }
    return [...nameSet].sort();
  });

  // Build the full account name from base + subpath
  const fullName = $derived(
    subPath.trim() ? `${baseAccount}:${subPath.trim().replace(/^:+/, '')}` : baseAccount
  );

  $effect(() => { if (form?.added) { subPath = ''; adding = false; } });

  // Synthesize missing intermediate accounts and group by top-level prefix
  const groups = $derived.by(() => {
    if (!data?.accounts) return new Map();
    const nameSet = new Set(data.accounts.map(a => a.name));
    const all = [...data.accounts];
    // Add any missing intermediate parents
    for (const acc of data.accounts) {
      const parts = acc.name.split(':');
      for (let i = 1; i < parts.length; i++) {
        const parent = parts.slice(0, i).join(':');
        if (!nameSet.has(parent)) {
          nameSet.add(parent);
          all.push({ name: parent, used: false });
        }
      }
    }
    const sorted = all.sort((a, b) => a.name.localeCompare(b.name));
    const map = new Map<string, typeof data.accounts>();
    for (const acc of sorted) {
      const top = acc.name.split(':')[0];
      if (!map.has(top)) map.set(top, []);
      map.get(top)!.push(acc);
    }
    return map;
  });

  const sortedGroups = $derived([...groups.keys()].sort());

  const usedNames = $derived(new Set((data?.accounts ?? []).filter((a) => a.used).map((a) => a.name)));

  function hasUsedDescendant(name: string): boolean {
    for (const used of usedNames) {
      if (used.startsWith(name + ':')) return true;
    }
    return false;
  }

  function canDelete(acc: { name: string; used: boolean; declared: boolean }): boolean {
    return acc.declared && !acc.used && !hasUsedDescendant(acc.name);
  }
</script>

<LearningBanner id="accounts" title="How accounts work">
  Think of accounts like folders for your money.
  <span class="whitespace-nowrap"><AccountBadge account="expenses" size="xs" /><code class="font-mono text-sm text-rose-400">:food:groceries</code></span> lives inside
  <span class="whitespace-nowrap"><AccountBadge account="expenses" size="xs" /><code class="font-mono text-sm text-rose-400">:food</code></span>, which lives inside
  <AccountBadge account="expenses" size="xs" />.
  This lets you see "I spent $500 on food" or zoom in to "I spent $350 on groceries and $150 dining out."
</LearningBanner>

<div class="mb-6 flex items-center justify-between">
  <div>
    <h1 class="text-xl font-semibold text-slate-100">Accounts</h1>
    <p class="mt-0.5 text-sm text-slate-100">All accounts — declared and used in transactions.</p>
  </div>
  <button
    type="button"
    onclick={() => (adding = !adding)}
    class="{adding ? 'btn-pill-active' : 'btn-pill'}"
  >+ New account</button>
</div>

{#if adding}
  <div class="mb-5 rounded-xl border border-slate-300 bg-slate-900 p-4">
    <form method="POST" action="?/add" use:enhance class="flex flex-col gap-3">
      <input type="hidden" name="name" value={fullName} />
      <div class="flex gap-2 items-center">
        <div class="w-64 shrink-0">
          <Combobox
            items={allAccounts}
            value={baseAccount}
            allowTopLevel={true}
            placeholder="Parent account"
            onchange={(v) => { if (v) baseAccount = v; }}
            inputClass="w-full rounded-lg border border-slate-300 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-100 focus:border-blue-300"
          />
        </div>
        <span class="text-base font-bold text-slate-100">:</span>
        <input
          type="text"
          bind:value={subPath}
          placeholder="new sub-account name"
          autocomplete="off"
          class="flex-1 rounded-lg border border-slate-300 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-100 focus:border-blue-300"
        />
        <button type="submit" disabled={!subPath.trim()}
          class="btn-primary disabled:opacity-40">
          Add
        </button>
        <button type="button" onclick={() => (adding = false)}
          class="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-100 hover:text-slate-100">
          Cancel
        </button>
      </div>
      {#if subPath.trim()}
        <p class="text-xs text-slate-100">Will create: <code class="font-mono text-slate-100">{fullName}</code></p>
      {/if}
    </form>
    {#if form?.error}
      <p class="mt-2 text-sm text-rose-400">{form.error}</p>
    {/if}
  </div>
{/if}

<div class="flex flex-col gap-3">
  {#each sortedGroups as group}
    <div class="overflow-hidden rounded-xl border border-slate-400 bg-slate-900">
      <div class="divide-y divide-slate-800/40">
        {#each groups.get(group) ?? [] as acc}
          {@const parts = acc.name.split(':')}
          {@const depth = parts.length - 1}
          {@const leaf = parts[parts.length - 1]}
          <div class="flex flex-1 items-center justify-between gap-2 px-5 py-2.5" style="padding-left: {20 + depth * 16}px">
            <div class="flex flex-col">
              <div class="flex items-center gap-2">
                {#if depth === 0}
                  <AccountBadge account={acc.name} />
                {:else}
                  <span class="font-mono text-sm {accountColor(acc.name)}">{leaf}</span>
                {/if}
              </div>
              {#if acc.description}
                <span class="text-xs text-slate-100" title={acc.description}>{acc.description}</span>
              {/if}
            </div>
            {#if depth === 0}
              <!-- top-level: no status needed -->
            {:else if acc.used}
              <span class="text-xs text-slate-100">has transactions</span>
            {:else if hasUsedDescendant(acc.name)}
              <!-- parent with used children: no label needed -->
            {:else if acc.name === 'expenses:unknown'}
              <span class="text-xs text-slate-100">system</span>
            {:else if acc.declared}
              <form method="POST" action="?/delete" use:enhance class="flex items-center gap-2">
                <span class="text-xs text-amber-600">unused</span>
                <input type="hidden" name="name" value={acc.name} />
                <button type="submit" title="Delete account" aria-label="Delete account"
                  class="rounded-md border border-rose-500/30 px-2 py-0.5 text-xs text-rose-400 transition-colors hover:border-rose-500/60 hover:bg-rose-500/10">
                  delete
                </button>
              </form>
            {:else}
              <!-- not declared, not used: shouldn't appear -->
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/each}
</div>
