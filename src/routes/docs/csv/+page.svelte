<script lang="ts">
  let { data } = $props();

  function normaliseDate(val: string): string | null {
    const iso = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const mdy = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
    const dmy = val.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
    if (dmy) return `${dmy[3]}-${dmy[1].padStart(2, '0')}-${dmy[2].padStart(2, '0')}`;
    return null;
  }

  function isRowImported(row: string[]): boolean {
    if (!data.latestImport || data.dateColIndex < 0) return false;
    const date = normaliseDate(row[data.dateColIndex] ?? '');
    return !!date && date <= data.latestImport;
  }
</script>

<div class="mb-5 flex items-center justify-between gap-4">
  <div class="min-w-0">
    <h1 class="truncate text-lg font-semibold text-slate-100">{data.name}</h1>
    <div class="mt-0.5 flex items-center gap-2">
      <span class="text-sm text-slate-100">{data.rows.length} rows</span>
      {#if data.importStatus === 'never'}
        <span class="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">not imported</span>
      {:else if data.importStatus === 'partial'}
        <span class="rounded-full bg-blue-300/10 px-2 py-0.5 text-xs font-medium text-blue-500">new rows since {data.latestImport}</span>
      {:else}
        <span class="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">imported through {data.latestImport}</span>
      {/if}
    </div>
  </div>
  <div class="flex shrink-0 gap-2">
    <a
      href="/mappings?csv={encodeURIComponent(data.rel)}"
      class="btn-secondary"
    >
      Create rule
    </a>
    {#if data.importStatus !== 'complete'}
      <a
        href="/docs?import={encodeURIComponent(data.rel)}"
        class="btn-primary"
      >
        Import
      </a>
    {/if}
    <a
      href="/docs"
      class="text-sm text-slate-100 transition-colors hover:text-slate-100"
    >
      ← Documents
    </a>
  </div>
</div>

{#if data.headers.length === 0}
  <div class="rounded-xl border border-slate-400 bg-slate-900 py-16 text-center">
    <p class="text-sm text-slate-100">Empty file</p>
  </div>
{:else}
  <div class="overflow-x-auto rounded-xl border border-slate-400">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-400 bg-slate-900">
          {#if data.latestImport && data.dateColIndex >= 0}
            <th class="w-8 px-2 py-2.5"></th>
          {/if}
          {#each data.headers as header}
            <th class="px-4 py-2.5 text-left font-semibold tracking-wide text-slate-100 whitespace-nowrap">{header}</th>
          {/each}
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-800/40 bg-slate-900">
        {#each data.rows as row, i}
          {@const imported = isRowImported(row)}
          <tr class="transition-colors hover:bg-slate-800/40">
            {#if data.latestImport && data.dateColIndex >= 0}
              <td class="w-8 px-2 py-2 text-center">
                {#if imported}
                  <svg class="inline-block h-3.5 w-3.5 text-emerald-500/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                {/if}
              </td>
            {/if}
            {#each data.headers as _, j}
              <td class="px-4 py-2 font-mono text-slate-100 whitespace-nowrap">{row[j] ?? ''}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
