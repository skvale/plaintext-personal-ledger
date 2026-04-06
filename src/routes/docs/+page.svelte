<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/stores';
  import { invalidateAll, pushState } from '$app/navigation';
  import { tick, onMount } from 'svelte';
  import AccountLabel from '$lib/components/AccountLabel.svelte';
  import FileIcon from '$lib/components/FileIcon.svelte';
  import FilePreview from '$lib/components/FilePreview.svelte';
  import Combobox from '$lib/components/Combobox.svelte';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import LearningBanner from '$lib/components/LearningBanner.svelte';
  import { Select } from 'bits-ui';
  import { accountTail, accountColor } from '$lib/account-colors.js';
  import AccountBadge from '$lib/components/AccountBadge.svelte';
  import type { PageData, ActionData } from './$types';
  import type { DocFile } from '$lib/hledger.server.js';
  import { parseCommodity, formatAmount } from '$lib/format.js';
  import { billSchema } from '$lib/schemas/bill.js';

  let { data, form: formResult }: { data: PageData; form: ActionData } = $props();

  let pendingAccounts = $state<Set<string>>(new Set());
  const allAccounts = $derived([...new Set([...data.accounts, ...pendingAccounts])].sort());

  function trackAccount(name: string) {
    pendingAccounts = new Set([...pendingAccounts, name]);
  }

  async function persistNewAccounts() {
    // Collect all account names from current mapping edits + pending set
    const accountsToCreate = new Set<string>();
    for (const acct of Object.values(mappingEdits)) {
      if (acct && !data.accounts.includes(acct)) accountsToCreate.add(acct);
    }
    for (const acct of pendingAccounts) {
      if (!data.accounts.includes(acct)) accountsToCreate.add(acct);
    }
    for (const name of accountsToCreate) {
      await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name })
      });
    }
    pendingAccounts = new Set();
  }

  let billSubmitted = $state(false);
  let billErrors = $state<Record<string, string[]>>({});
  let billSuccess = $state(false);

  let mode = $state<'none' | 'upload' | 'invoice' | 'import'>('none');
  let month = $state(new Date().toISOString().slice(0, 7));
  let billVendor = $state('');
  let billDescription = $state('');
  let billPostings = $state([{ account: '', amount: '' }]);
  let billPaid = $state(false);
  let billPayAccount = $state('');
  const billBalanceAcct = $derived(billPaid ? (billPayAccount || 'assets:…') : 'liabilities:payable');
  const billTotal = $derived(() => {
    return billPostings.reduce((sum, p) => {
      const n = parseFloat(p.amount.replace(/[^0-9.]/g, ''));
      return sum + (isNaN(n) ? 0 : n);
    }, 0);
  });

  function validateBill(): boolean {
    const result = billSchema.safeParse({
      date: (document.querySelector('#bill-form [name="date"]') as HTMLInputElement)?.value ?? '',
      vendor: billVendor,
      description: billDescription,
      postings: billPostings,
      paid: billPaid,
      payAccount: billPayAccount,
    });
    if (result.success) {
      billErrors = {};
      return true;
    }
    const errs: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.');
      (errs[key] ??= []).push(issue.message);
    }
    billErrors = errs;
    return false;
  }

  // Re-validate on field changes after first submit attempt
  $effect(() => {
    // Subscribe to all bill fields
    billVendor; billPostings; billPaid; billPayAccount;
    if (billSubmitted) validateBill();
  });
  function fmtAmt(val: string) {
    const n = parseFloat(val.replace(/[^0-9.]/g, ''));
    if (isNaN(n)) return '0.00';
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Import state
  let importingFile = $state<DocFile | null>(null);
  let selectedRulesFile = $state('');
  let previewOutput = $state('');
  let previewCount = $state(0);
  let previewToken = $state('');
  let previewError = $state('');
  let previewCollapsed = $state(false);
  let importError = $state('');
  let importSuccess = $state(false);
  let isLoading = $state(false);
  let unmappedDescs = $state<string[]>([]);
  let mappingEdits = $state<Record<string, string>>({});
  let suggestedAccounts = $state<Record<string, string>>({});
  const filledMappingCount = $derived(Object.values(mappingEdits).filter(v => v).length);

  // PDF extraction state (bill form)
  let pdfText = $state('');
  let pdfExtracting = $state(false);
  let pdfError = $state('');
  let pdfIsEmpty = $state(false);
  let pdfPages = $state(0);
  let billFileName = $state('');
  let stmtFileName = $state('');

  // Pay bill inline form
  let payingDocPath = $state<string | null>(null);
  let payDate = $state(new Date().toISOString().slice(0, 10));
  let payAccount = $state('');
  let payError = $state('');
  let paySubmitting = $state(false);


  async function extractPdf(file: File) {
    pdfText = '';
    pdfError = '';
    pdfIsEmpty = false;
    pdfPages = 0;
    pdfExtracting = true;
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/extract-pdf', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.error) { pdfError = data.error; return; }
      pdfText = data.text ?? '';
      pdfIsEmpty = data.isEmpty ?? false;
      pdfPages = data.pages ?? 1;
    } catch (e: any) {
      pdfError = e.message ?? 'Extraction failed';
    } finally {
      pdfExtracting = false;
    }
  }

  function onBillFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) { pdfText = ''; pdfError = ''; billFileName = ''; return; }
    billFileName = file.name;
    if (file.name.toLowerCase().endsWith('.pdf')) extractPdf(file);
    else { pdfText = ''; pdfError = ''; }
  }

  const isPreviewing = $derived(!!previewToken && !importSuccess);

  // Sync import panel state with URL params
  function syncFromUrl() {
    const url = new URL(window.location.href);
    const rel = url.searchParams.get('import');
    const hasPreview = url.searchParams.has('preview');

    if (rel && mode !== 'import') {
      for (const group of data.monthGroups) {
        for (const section of group.sections) {
          const f = section.files.find((x: { relPath: string }) => x.relPath === rel);
          if (f) {
            importingFile = f;
            selectedRulesFile = guessRules(f.name);
            previewOutput = '';
            previewCount = 0;
            previewToken = '';
            previewError = '';
            importError = '';
            importSuccess = false;
            mode = 'import';
            break;
          }
        }
      }
    } else if (!rel && mode === 'import') {
      importingFile = null;
      mode = 'none';
    }

    if (!hasPreview && isPreviewing) {
      resetPreview();
    }

    // Auto-preview if URL has preview=1 but we have no preview data (e.g. navigated back)
    if (hasPreview && rel && mode === 'import' && !previewToken && !previewOutput) {
      requestAnimationFrame(() => {
        document.querySelector<HTMLFormElement>('#previewForm')?.requestSubmit();
      });
    }
  }

  // Re-sync import state whenever the URL changes (back/forward, SvelteKit navigation)
  $effect(() => {
    // Subscribe to $page.url so this runs on every navigation
    $page.url;
    syncFromUrl();
  });

  // Close upload/invoice panels on success (these use plain use:enhance which updates form)
  $effect(() => {
    if (formResult && ('uploaded' in formResult || 'invoiced' in formResult)) {
      mode = 'none';
      pdfText = '';
      pdfError = '';
      billFileName = '';
    }
  });

  function guessRules(name: string): string {
    // Exact match: csvname.rules (hledger native convention)
    const exact = data.rulesFiles.find((f: string) => f === `${name}.rules`);
    if (exact) return exact;
    // Fallback: fuzzy
    const lower = name.toLowerCase();
    if (lower.includes('vanguard')) return data.rulesFiles.find((f: string) => f.includes('vanguard')) ?? data.rulesFiles[0] ?? '';
    if (lower.includes('visa') || lower.includes('credit')) return data.rulesFiles.find((f: string) => f.includes('visa') || f.includes('credit')) ?? data.rulesFiles[0] ?? '';
    if (lower.includes('check')) return data.rulesFiles.find((f: string) => f.includes('check')) ?? data.rulesFiles[0] ?? '';
    return data.rulesFiles[0] ?? '';
  }

  function startImport(file: DocFile) {
    importingFile = file;
    selectedRulesFile = guessRules(file.name);
    previewOutput = '';
    previewCount = 0;
    previewToken = '';
    previewError = '';
    importError = '';
    importSuccess = false;
    mode = 'import';
    // Push ?import= so the back button returns to the file list
    const url = new URL(window.location.href);
    url.searchParams.set('import', file.relPath);
    url.searchParams.delete('preview');
    pushState(url, {});
  }

  function cancelImport() {
    importingFile = null;
    mode = 'none';
    const url = new URL(window.location.href);
    url.searchParams.delete('import');
    url.searchParams.delete('preview');
    pushState(url, {});
  }

  function resetPreview() {
    previewOutput = '';
    previewCount = 0;
    previewToken = '';
    previewError = '';
    importError = '';
  }

  const commodityFmt = $derived(parseCommodity($page.data.commodity ?? '$1,000.00'));
  const roundAmounts = $derived($page.data.settings?.display?.roundAmounts === true);
  const displayFmt = $derived(roundAmounts ? { ...commodityFmt, decimals: 0 } : commodityFmt);
  function fmtAmount(n: number) {
    return formatAmount(n, displayFmt);
  }

  function fmtSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function extIcon(ext: string) {
    if (ext === 'pdf') return '⬜';
    if (ext === 'csv') return '⊟';
    return '◻';
  }

  function extColor(ext: string) {
    if (ext === 'pdf') return 'text-rose-400';
    if (ext === 'csv') return 'text-emerald-400';
    return 'text-slate-100';
  }

  function fileUrl(relPath: string) {
    return `/docs/file?p=${encodeURIComponent(relPath)}`;
  }

  const inputCls = 'rounded-lg border border-slate-300 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-100 focus:border-blue-300';
</script>

<!-- ── Import panel ─────────────────────────────────────────────────────────── -->
{#if mode === 'import' && importingFile}
  <div class="mb-5 flex items-center justify-between gap-3">
    <button onclick={cancelImport} class="text-sm text-slate-100 transition-colors hover:text-slate-100 shrink-0">
      ← Documents
    </button>
    <div class="flex items-center gap-2 min-w-0">
      <span class="text-sm font-semibold text-slate-100">Import</span>
      <a href="/docs/csv?p={encodeURIComponent(importingFile.relPath)}" class="group/file relative truncate font-mono text-sm text-slate-100 hover:text-blue-500 transition-colors underline underline-offset-2 decoration-slate-700 hover:decoration-blue-400" title="Preview {importingFile.name}">{importingFile.name}</a>
      <span class="shrink-0 text-xs text-slate-100">{fmtSize(importingFile.size)}</span>
    </div>
  </div>

  {#if importSuccess}
    <div class="rounded-xl border border-slate-400 bg-slate-900 p-10 text-center">
      <div class="mb-3 text-2xl text-emerald-400">✓</div>
      <p class="mb-1 text-sm font-medium text-slate-100">Import complete</p>
      <p class="mb-6 text-xs text-slate-100">Transactions have been added to your journal.</p>
      <button
        onclick={cancelImport}
        class="rounded-md bg-blue-300/10 px-4 py-2 text-sm font-medium text-blue-500 transition-colors hover:bg-blue-300/20"
      >
        ← Documents
      </button>
    </div>

  {:else}
    <!-- File info + rules selector (always visible) -->
    <form id="previewForm" method="POST" action="?/preview" use:enhance={() => {
      isLoading = true;
      previewError = '';
      return async ({ result }) => {
        isLoading = false;
        if (result.type === 'success') {
          previewOutput = (result.data as any).preview ?? '';
          previewCount = (result.data as any).previewCount ?? 0;
          previewToken = (result.data as any).token ?? '';
          unmappedDescs = (result.data as any).unmapped ?? [];
          const suggestions: Record<string, { account: string }> = (result.data as any).suggestions ?? {};
          // Only keep mapping edits for descriptions that are still unmapped
          const stillUnmapped = new Set(unmappedDescs);
          const keptEdits: Record<string, string> = {};
          for (const [desc, val] of Object.entries(mappingEdits)) {
            if (stillUnmapped.has(desc)) keptEdits[desc] = val;
          }
          mappingEdits = keptEdits;
          suggestedAccounts = {};
          for (const [desc, s] of Object.entries(suggestions)) {
            suggestedAccounts[desc] = s.account;
          }
          const url = new URL(window.location.href);
          url.searchParams.set('preview', '1');
          pushState(url, {});
        } else if (result.type === 'failure') {
          previewError = (result.data as any)?.previewError ?? 'Preview failed.';
        }
      };
    }} class="space-y-4">
      <input type="hidden" name="csvRel" value={importingFile.relPath} />

      {#if data.rulesFiles.length > 0}
        <div class="flex items-center gap-3">
          <span class="whitespace-nowrap text-sm text-slate-100">Rules file</span>
          <input type="hidden" name="rulesFile" value={selectedRulesFile} />
          <Select.Root type="single" value={selectedRulesFile} onValueChange={(v) => {
            if (v) {
              selectedRulesFile = v;
              if (isPreviewing) {
                resetPreview();
                tick().then(() => {
                  document.querySelector<HTMLFormElement>('#previewForm')?.requestSubmit();
                });
              }
            }
          }}>
            <Select.Trigger class="flex flex-1 items-center justify-between rounded-md border border-slate-300 bg-slate-900 px-3 py-2 text-sm text-slate-100 transition-colors hover:border-slate-600 focus:border-blue-300 focus:outline-none">
              {selectedRulesFile || 'Select…'}
              <svg class="ml-2 h-3.5 w-3.5 shrink-0 text-slate-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content class="z-50 rounded-lg border border-slate-300 bg-slate-900 py-1 shadow-xl" sideOffset={4} style="min-width: var(--bits-select-anchor-width)">
                <Select.Viewport>
                  {#each data.rulesFiles as file}
                    <Select.Item value={file} class="cursor-pointer px-3 py-1.5 text-sm text-slate-100 outline-none data-[highlighted]:bg-blue-300/10 data-[highlighted]:text-blue-500 data-[state=checked]:text-blue-500">
                      {file}
                    </Select.Item>
                  {/each}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
          <a
            href="/mappings?file={encodeURIComponent(selectedRulesFile)}"
            class="shrink-0 text-sm text-blue-500 hover:text-blue-500 transition-colors"
          >Edit mappings</a>
        </div>
      {:else}
        <p class="text-sm text-slate-100">No .rules files found in journal directory.</p>
      {/if}

      <LearningBanner id="import-flow" title="How imports work">
        When you import a CSV, a <strong>.rules file</strong> tells the system how to categorize each transaction.
        Patterns like "WHOLE FOODS" get matched to accounts like "expenses:food:groceries."
        <a href="/mappings" class="text-blue-500 hover:text-blue-500 underline">Edit your import mappings</a> to add
        or change how transactions are sorted. The more mappings you have, the fewer transactions
        end up in the triage queue.
      </LearningBanner>

      {#if previewError}
        <p class="text-sm text-rose-400">{previewError}</p>
      {/if}

      {#if !isPreviewing}
        <div class="flex items-center gap-3">
          <button
            type="submit"
            disabled={isLoading || data.rulesFiles.length === 0}
            class="rounded-md bg-blue-300/10 px-4 py-2 text-sm font-medium text-blue-500 transition-colors hover:bg-blue-300/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isLoading ? 'Working…' : 'Preview'}
          </button>
          <button
            type="button"
            disabled={isLoading || data.rulesFiles.length === 0}
            onclick={async () => {
              if (!importingFile) return;
              isLoading = true;
              previewError = '';
              importError = '';
              const fd = new FormData();
              fd.set('csvRel', importingFile.relPath);
              fd.set('rulesFile', selectedRulesFile);
              const res = await fetch('?/preview', { method: 'POST', body: fd });
              const json = await res.json();
              const pData = json?.data ? JSON.parse(json.data) : null;
              if (!pData || pData.previewError) {
                isLoading = false;
                previewError = pData?.previewError ?? 'Preview failed.';
                return;
              }
              const token = pData.token ?? '';
              if (!token) { isLoading = false; previewError = 'No token returned.'; return; }
              const cfd = new FormData();
              cfd.set('token', token);
              const cRes = await fetch('?/confirm', { method: 'POST', body: cfd });
              isLoading = false;
              const cJson = await cRes.json();
              const cData = cJson?.data ? JSON.parse(cJson.data) : null;
              if (cData?.importError) {
                importError = cData.importError;
              } else {
                importSuccess = true;
                invalidateAll();
              }
            }}
            class="rounded-md bg-blue-300 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? 'Importing…' : 'Import'}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onclick={async () => {
              if (!importingFile) return;
              isLoading = true;
              previewError = '';
              const fd = new FormData();
              fd.set('csvRel', importingFile.relPath);
              const res = await fetch('?/createRuleFromCsv', { method: 'POST', body: fd });
              const json = await res.json();
              isLoading = false;
              let createdFile = '';
              if (json?.data) {
                try {
                  const data = typeof json.data === 'string' ? JSON.parse(json.data) : json.data;
                  // Response is like [{"createdFromCsv":1}, "filename.rules"]
                  if (Array.isArray(data)) {
                    createdFile = data[1] ?? '';
                  } else {
                    createdFile = data.createdFromCsv ?? '';
                  }
                } catch {}
              }
              if (createdFile) {
                window.location.href = `/mappings?file=${encodeURIComponent(createdFile)}`;
              } else {
                previewError = 'Failed to create rules file.';
              }
            }}
            class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:border-blue-300/50 hover:text-blue-500"
          >
            Create rules file
          </button>
        </div>
      {/if}
    </form>

    <!-- Preview results below -->
    {#if isPreviewing}
      <div class="mt-5 space-y-4">
        <button
          type="button"
          onclick={() => (previewCollapsed = !previewCollapsed)}
          class="flex w-full items-center gap-2 text-left"
        >
          <svg class="h-3.5 w-3.5 shrink-0 text-slate-100 transition-transform {previewCollapsed ? '' : 'rotate-90'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m9 18 6-6-6-6"/></svg>
          <span class="text-sm font-medium text-slate-100">
            {#if previewCount > 0}
              {previewCount} transaction{previewCount === 1 ? '' : 's'} to import
            {:else}
              No new transactions found
            {/if}
          </span>
          {#if previewCount > 0}
            <span class="rounded-full bg-blue-300/10 px-2 py-0.5 text-xs font-medium text-blue-500">preview</span>
          {/if}
        </button>

        {#if !previewCollapsed}
          <div class="overflow-hidden rounded-xl border border-slate-400 bg-slate-900">
            <pre class="overflow-x-auto p-4 font-mono text-sm leading-relaxed text-slate-100">{previewOutput}</pre>
          </div>
        {/if}

        {#if unmappedDescs.length > 0}
          <div class="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
            <div class="flex items-center justify-between">
              <p class="text-sm text-amber-300 font-medium">
                {unmappedDescs.length} unmapped transaction{unmappedDescs.length === 1 ? '' : 's'} — optionally assign accounts before importing
              </p>
              {#if Object.keys(suggestedAccounts).length > 0}
                <a href="/settings#import" class="text-xs text-slate-100 hover:text-slate-100 transition-colors">Suggestion settings</a>
              {/if}
            </div>
            <table class="w-full text-sm">
              <thead>
                <tr class="text-xs text-slate-100">
                  <th class="pb-1 text-left font-normal">Description</th>
                  <th class="pb-1 text-left font-normal pl-3" style="width: 240px;">Account</th>
                  {#if Object.keys(suggestedAccounts).length > 0}
                    <th class="pb-1 text-left font-normal pl-3" style="width: 200px;">Suggestion</th>
                  {/if}
                </tr>
              </thead>
              <tbody>
                {#each unmappedDescs as desc}
                  {@const suggestion = suggestedAccounts[desc]}
                  <tr>
                    <td class="py-1 pr-3 font-mono text-slate-100 truncate max-w-0">{desc}</td>
                    <td class="py-1 pl-3" style="width: 240px;">
                      <Combobox
                        items={allAccounts}
                        value={mappingEdits[desc] ?? ''}
                        onchange={(val) => { mappingEdits[desc] = val; mappingEdits = mappingEdits; }}
                        oncreate={trackAccount}
                        placeholder="expenses:…"
                        inputClass="w-full border border-slate-300 rounded-md bg-slate-900 px-2 py-1 pr-6 font-mono text-sm text-slate-100 placeholder:text-slate-100 focus:border-blue-300 outline-none"
                      />
                    </td>
                    {#if Object.keys(suggestedAccounts).length > 0}
                      <td class="py-1 pl-3" style="width: 200px;">
                        {#if suggestion}
                          <div class="flex items-center gap-2">
                            <AccountLabel account={suggestion} size="xs" />
                            {#if mappingEdits[desc] !== suggestion}
                              <button
                                type="button"
                                onclick={() => { mappingEdits[desc] = suggestion; mappingEdits = mappingEdits; }}
                                class="rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-100 transition-colors hover:border-blue-300/40 hover:text-blue-500"
                              >use</button>
                            {/if}
                          </div>
                        {/if}
                      </td>
                    {/if}
                  </tr>
                {/each}
              </tbody>
            </table>
            {#if filledMappingCount > 0}
              <button
                type="button"
                onclick={async () => {
                  await persistNewAccounts();
                  const mappings = Object.entries(mappingEdits)
                    .filter(([, v]) => v)
                    .map(([pattern, account]) => ({ pattern, account }));
                  const fd = new FormData();
                  fd.set('rulesFile', selectedRulesFile);
                  fd.set('mappings', JSON.stringify(mappings));
                  await fetch('?/addMappings', { method: 'POST', body: fd });
                  // Re-preview to see updated results
                  document.querySelector<HTMLFormElement>('#previewForm')?.requestSubmit();
                }}
                class="rounded-md bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
              >
                Save {filledMappingCount} mapping{filledMappingCount === 1 ? '' : 's'} and re-preview
              </button>
            {/if}
          </div>
        {/if}

        {#if importError}
          <p class="text-sm text-rose-400">{importError}</p>
        {/if}

        {#if previewCount > 0}
          <form method="POST" action="?/confirm" use:enhance={() => {
            isLoading = true;
            importError = '';
            persistNewAccounts();
            return async ({ result }) => {
              isLoading = false;
              if (result.type === 'success') {
                importSuccess = true;
                previewToken = '';
                invalidateAll();
              } else if (result.type === 'failure') {
                importError = (result.data as any)?.importError ?? 'Import failed.';
              }
            };
          }}>
            <input type="hidden" name="token" value={previewToken} />
            <button
              type="submit"
              disabled={isLoading}
              class="rounded-md bg-blue-300 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? 'Importing…' : `Import ${previewCount} transaction${previewCount === 1 ? '' : 's'}`}
            </button>
          </form>
        {/if}
      </div>
    {/if}
  {/if}

{:else}

<!-- ── Normal docs view ──────────────────────────────────────────────────────── -->

<LearningBanner id="docs" title="Statement files">
  Upload your bank and credit card statements here (CSV files). When you import one, PlainText Personal Ledger reads it
  and creates transactions automatically. Keeping the original files means you can always double-check
  where a number came from.
</LearningBanner>

<div class="mb-6 flex items-center justify-between">
  <div>
    <h1 class="text-xl font-semibold text-slate-100">Documents</h1>
    <p class="mt-0.5 text-sm text-slate-100">From <span class="font-mono">docs/statements/</span> <span class="font-mono">docs/bills/</span> <span class="font-mono">docs/attachments/</span></p>
  </div>
  <div class="flex gap-2">
    <button type="button" onclick={() => mode = mode === 'invoice' ? 'none' : 'invoice'}
      class="{mode === 'invoice' ? 'btn-pill-active' : 'btn-pill'}">
      + Bill
    </button>
    <button type="button" onclick={() => mode = mode === 'upload' ? 'none' : 'upload'}
      class="{mode === 'upload' ? 'btn-pill-active' : 'btn-pill'}">
      + Statement
    </button>
  </div>
</div>

<!-- Invoice intake -->
<div class="grid transition-[grid-template-rows,opacity] duration-100 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] {mode === 'invoice' ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}">
<div class="overflow-hidden">
  <div class="mb-5 rounded-xl border border-slate-300 bg-slate-900 p-5 transition-transform duration-100 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] {mode === 'invoice' ? 'translate-y-0' : '-translate-y-2'}">
    {#if billSuccess}
      <div class="text-center py-4 space-y-4">
        <div class="text-2xl text-emerald-400">✓</div>
        <p class="text-sm font-medium text-slate-100">Bill recorded</p>
        <p class="text-sm text-slate-100">{billVendor}{billDescription ? ` — ${billDescription}` : ''}</p>

        <!-- Transaction summary -->
        <div class="rounded-lg border border-slate-400 bg-slate-950 px-4 py-3 text-left">
          <div class="space-y-1.5">
            {#each billPostings.filter(p => p.account && p.amount) as posting}
              {@const acct = posting.account}
              <div class="flex items-center justify-between">
                <div class="flex items-center">
                  <AccountBadge account={acct} />
                  <span class="font-mono text-xs {accountColor(acct)}">{accountTail(acct)}</span>
                </div>
                <span class="font-mono text-sm tabular-nums text-rose-400">${fmtAmt(posting.amount)}</span>
              </div>
            {/each}
            <div class="flex items-center justify-between">
              <div class="flex items-center">
                <AccountBadge account={billBalanceAcct} />
                <span class="font-mono text-xs {accountColor(billBalanceAcct)}">{accountTail(billBalanceAcct)}</span>
              </div>
              <span class="font-mono text-sm tabular-nums text-emerald-400">-${billTotal().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        {#if billFileName}
          <p class="text-sm text-slate-100">Attached <span class="font-mono text-slate-100">{billFileName}</span></p>
        {/if}

        <div class="flex justify-center gap-3">
          <button
            type="button"
            onclick={() => {
              billSuccess = false;
              billSubmitted = false;
              billVendor = '';
              billDescription = '';
              billPostings = [{ account: '', amount: '' }];
              billPaid = false;
              billPayAccount = '';
              billFileName = '';
              billErrors = {};
            }}
            class="rounded-md bg-blue-300/10 px-4 py-2 text-sm font-medium text-blue-500 transition-colors hover:bg-blue-300/20"
          >
            Record another
          </button>
          <button
            type="button"
            onclick={() => { billSuccess = false; mode = 'none'; }}
            class="rounded-md px-4 py-2 text-sm text-slate-100 transition-colors hover:text-slate-100"
          >
            Done
          </button>
        </div>
      </div>
    {:else}
    <p class="mb-4 text-sm font-semibold text-slate-100">New bill{billPaid ? '' : ' → payable'}</p>
    {#if !billPaid && $page.data.settings?.learning?.enabled && $page.data.settings?.learning?.level === 'beginner'}
      <div class="mb-3 -mt-2 rounded-md border border-blue-300 bg-blue-50/50 dark:border-blue-300/25 dark:bg-blue-300/5 px-4 py-3 text-sm leading-relaxed text-blue-800 dark:text-blue-500/80 space-y-3">
        <p>Recording a bill creates a transaction like this:</p>
        <div class="rounded-md border border-blue-300/15 bg-blue-300/5 px-3 py-2 font-mono text-sm space-y-1">
          <div class="flex justify-between">
            <span><span class="inline-flex align-baseline"><AccountLabel account="expenses:…" size="sm" /></span></span>
            <span class="text-slate-100">$amount</span>
          </div>
          <div class="flex justify-between">
            <span><span class="inline-flex align-baseline"><AccountLabel account="liabilities:payable" size="sm" /></span></span>
            <span class="text-slate-100">$amount owed</span>
          </div>
        </div>
        <p>The expense is recorded immediately, and <span class="inline-flex align-baseline"><AccountLabel account="liabilities:payable" size="sm" /></span> tracks what you still owe.</p>
        <p>When you pay the bill later, a second transaction moves the amount from <span class="inline-flex align-baseline"><AccountLabel account="liabilities:payable" size="sm" /></span> to <span class="inline-flex align-baseline"><AccountBadge account="assets" size="sm" /></span> — closing the loop.</p>
        <p>This way your expense reports are accurate from day one, even before payment clears.</p>
        <p>If you've already paid, check "Already paid" below to skip the payable step.</p>
        <div class="mt-2 text-right">
          <a href="/settings#learning" class="whitespace-nowrap text-xs text-blue-700 dark:text-blue-500 underline underline-offset-2 hover:text-blue-900 dark:hover:text-blue-500 visited:text-blue-700 dark:visited:text-blue-500">Learning Mode settings</a>
        </div>
      </div>
    {/if}
    <form id="bill-form" method="POST" action="?/invoice" enctype="multipart/form-data"
      use:enhance={() => {
        billSubmitted = true;
        if (!validateBill()) return async () => {};
        return async ({ result, update }) => {
          if (result.type === 'success') {
            billSuccess = true;
            invalidateAll();
          } else {
            await update();
          }
        };
      }}
      class="flex flex-col gap-3">

      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1.5">
          <label for="inv-file" class="text-xs font-semibold tracking-wide text-slate-100">File <span class="font-normal text-slate-100">(optional)</span></label>
          <label class="flex cursor-pointer items-center gap-2 {inputCls}">
            <span class="shrink-0 rounded border border-dashed border-slate-500 bg-slate-800/50 px-2 py-0.5 text-sm text-slate-400">Browse</span>
            <span class="min-w-0 truncate text-sm {billFileName ? 'text-slate-100' : 'text-slate-100'}">{billFileName || 'No file chosen'}</span>
            <input id="inv-file" type="file" name="file" accept=".pdf,.png,.jpg,.jpeg"
              onchange={onBillFileChange}
              class="sr-only" />
          </label>
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="inv-date" class="text-xs font-semibold tracking-wide text-slate-100">Date</label>
          <DatePicker value={data.today} name="date" />
        </div>
      </div>

      {#if billFileName}
        <div class="flex flex-col gap-1.5">
          <label for="inv-filename" class="text-xs font-semibold tracking-wide text-slate-100">Save as</label>
          <input id="inv-filename" type="text" name="filename" bind:value={billFileName} class={inputCls} />
        </div>
      {/if}

      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1.5">
          <label for="inv-vendor" class="text-xs font-semibold tracking-wide text-slate-100">Vendor {#if billErrors.vendor}<span class="font-normal text-rose-400">{billErrors.vendor[0]}</span>{/if}</label>
          <input id="inv-vendor" type="text" name="vendor" bind:value={billVendor} autocomplete="off" class="{inputCls} {billErrors.vendor ? '!border-rose-500/60' : ''}" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="inv-desc" class="text-xs font-semibold tracking-wide text-slate-100">Description <span class="font-normal text-slate-100">(optional)</span></label>
          <input id="inv-desc" type="text" name="description" autocomplete="off" class={inputCls} />
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <div class="flex items-center gap-3 text-xs font-semibold tracking-wide text-slate-100">
          <span class="flex-1">Expense account</span>
          <span style="width: 120px;">Amount</span>
          <span style="width: 28px;"></span>
        </div>
        {#each billPostings as posting, i}
          <div class="flex items-center gap-3">
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <div class="flex-1">
              <Combobox
                items={data.expenseAccounts}
                value={posting.account}
                name="account_{i}"
                placeholder="expenses:…"
                onchange={(v) => { billPostings[i].account = v ?? ''; billPostings = billPostings; }}
                inputClass="{inputCls} w-full pr-8 {billErrors[`postings.${i}.account`] ? '!border-rose-500/60' : ''}"
              />
            </div>
            <input
              type="text"
              name="amount_{i}"
              bind:value={posting.amount}
              class="{inputCls} tabular-nums {billErrors[`postings.${i}.amount`] ? '!border-rose-500/60' : ''}"
              style="width: 120px;"
            />
            {#if billPostings.length > 1}
              <button
                type="button"
                onclick={() => { billPostings = billPostings.filter((_, j) => j !== i); }}
                class="flex h-7 w-7 shrink-0 items-center justify-center rounded text-slate-100 transition-colors hover:text-slate-100"
              >✕</button>
            {:else}
              <span style="width: 28px;"></span>
            {/if}
          </div>
        {/each}
        <button
          type="button"
          onclick={() => { billPostings = [...billPostings, { account: '', amount: '' }]; }}
          class="self-start text-xs text-slate-100 transition-colors hover:text-slate-100"
        >+ Add line</button>
      </div>

      <input type="hidden" name="postings" value={JSON.stringify(billPostings)} />

      <!-- Paid toggle -->
      <label class="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          name="paid"
          value="true"
          bind:checked={billPaid}
          class="accent-blue-400 w-4 h-4"
        />
        <div>
          <p class="text-sm font-medium text-slate-100">Already paid</p>
          <p class="text-xs text-slate-100">Record as paid instead of creating a payable</p>
        </div>
      </label>

      {#if billPaid}
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-semibold tracking-wide text-slate-100">Paid from {#if billErrors.payAccount}<span class="font-normal text-rose-400">{billErrors.payAccount[0]}</span>{/if}</span>
          <Combobox
            items={data.paymentAccounts}
            value={billPayAccount}
            name="payAccount"
            placeholder=""
            onchange={(v) => { billPayAccount = v ?? ''; }}
            inputClass="{inputCls} w-full pr-8 {billErrors.payAccount ? '!border-rose-500/60' : ''}"
          />
        </label>
      {/if}

      <!-- Transaction preview -->
      <div class="rounded-lg border border-slate-400 bg-slate-950 px-4 py-3">
        <p class="mb-2 text-xs font-semibold text-slate-100">Transaction preview</p>
        <div class="space-y-1.5">
          {#each billPostings as posting}
            {@const acct = posting.account || 'expenses:…'}
            <div class="flex items-center justify-between">
              <div class="flex items-center">
                <AccountBadge account={acct} />
                <span class="font-mono text-xs {accountColor(acct)}">{accountTail(acct)}</span>
              </div>
              <span class="font-mono text-sm tabular-nums text-rose-400">${fmtAmt(posting.amount)}</span>
            </div>
          {/each}
          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <AccountBadge account={billBalanceAcct} />
              <span class="font-mono text-xs {accountColor(billBalanceAcct)}">{accountTail(billBalanceAcct)}</span>
            </div>
            <span class="font-mono text-sm tabular-nums text-emerald-400">-${billTotal().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>

      <!-- PDF extraction debug panel -->
      {#if pdfExtracting}
        <div class="rounded-lg border border-slate-300 bg-slate-800/50 px-4 py-3 text-sm text-slate-100">
          Extracting text…
        </div>
      {:else if pdfError}
        <div class="rounded-lg border border-rose-800/40 bg-rose-950/20 px-4 py-3 text-sm text-rose-400">
          {pdfError}
        </div>
      {:else if pdfText}
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-slate-100">
              Extracted text — {pdfPages} page{pdfPages === 1 ? '' : 's'}
              {#if pdfIsEmpty}<span class="ml-2 text-amber-400">⚠ may be scanned/image PDF</span>{/if}
            </span>
          </div>
          <div class="max-h-48 overflow-y-auto rounded-lg border border-slate-300 bg-slate-950 p-3">
            <pre class="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-100">{pdfText}</pre>
          </div>
        </div>
      {/if}

      {#if formResult?.invoiceError}
        <p class="text-sm text-rose-400">{formResult.invoiceError}</p>
      {/if}

      <div class="flex gap-2">
        <button type="submit" class="btn-primary">
          Record bill
        </button>
        <button type="button" onclick={() => mode = 'none'}
          class="btn-cancel">
          Cancel
        </button>
      </div>
    </form>
    {/if}
  </div>
</div>
</div>

<!-- Simple upload -->
<div class="grid transition-[grid-template-rows,opacity] duration-100 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] {mode === 'upload' ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}">
<div class="overflow-hidden">
  <div class="mb-5 rounded-xl border border-slate-300 bg-slate-900 p-5 transition-transform duration-100 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] {mode === 'upload' ? 'translate-y-0' : '-translate-y-2'}">
    <p class="mb-4 text-sm font-semibold text-slate-100">Upload file</p>
    <form method="POST" action="?/upload" enctype="multipart/form-data"
      use:enhance class="flex flex-col gap-3">
      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1.5">
          <label for="up-file" class="text-xs font-semibold tracking-wide text-slate-100">File</label>
          <label class="flex cursor-pointer items-center gap-2 {inputCls}">
            <span class="shrink-0 rounded border border-dashed border-slate-500 bg-slate-800/50 px-2 py-0.5 text-sm text-slate-400">Browse</span>
            <span class="min-w-0 truncate text-sm {stmtFileName ? 'text-slate-100' : 'text-slate-100'}">{stmtFileName || 'No file chosen'}</span>
            <input id="up-file" type="file" name="file"
              onchange={(e) => { stmtFileName = (e.target as HTMLInputElement).files?.[0]?.name ?? ''; }}
              class="sr-only" />
          </label>
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="up-month" class="text-xs font-semibold tracking-wide text-slate-100">Month</label>
          <input id="up-month" type="month" name="month" bind:value={month} class={inputCls} />
        </div>
      </div>
      <div class="flex gap-2">
        <button type="submit" class="btn-primary">
          Upload
        </button>
        <button type="button" onclick={() => mode = 'none'}
          class="btn-cancel">
          Cancel
        </button>
      </div>
    </form>
    {#if formResult?.error}
      <p class="mt-2 text-sm text-rose-400">{formResult.error}</p>
    {/if}
  </div>
</div>
</div>

<!-- Gap warnings -->
{#if data.gaps.length > 0}
  <div class="mb-4 rounded-xl border border-amber-800/40 bg-amber-950/20 px-4 py-3">
    <p class="mb-2 text-xs font-semibold tracking-wide text-amber-500">POSSIBLE MISSING STATEMENTS</p>
    <ul class="flex flex-col gap-1">
      {#each data.gaps as gap}
        <li class="font-mono text-sm text-amber-400/80">{gap}</li>
      {/each}
    </ul>
  </div>
{/if}

<!-- File list -->
{#if data.monthGroups.length === 0}
  <div class="rounded-xl border border-slate-400 bg-slate-900 px-6 py-12 text-center">
    <p class="text-sm text-slate-100">No documents found.</p>
    <p class="mt-2 text-sm text-slate-100">Add files to <span class="font-mono">docs/statements/YYYY-MM/</span> next to your journal.</p>
  </div>
{:else}
  <div class="flex flex-col gap-4">
    {#each data.monthGroups as group}
      {@const multiSection = group.sections.length > 1}
      <div class="overflow-hidden rounded-xl border border-slate-400 bg-slate-900">
        <!-- Month header -->
        <div class="border-b border-slate-400 px-5 py-3">
          <p class="text-xs font-semibold tracking-wide text-slate-100">{group.month}</p>
        </div>
        <!-- Sections (statements, invoices, etc.) -->
        {#each group.sections as section}
          {#if multiSection && section.label}
            <p class="border-b border-slate-400/60 bg-slate-800/20 px-5 py-1.5 text-xs text-slate-100">{section.label}</p>
          {/if}
          <div class="divide-y divide-slate-800/40">
            {#each section.files as file}
              <div class="relative flex flex-wrap items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-800/30">
                <FileIcon ext={file.ext} />
                <span class="flex-1 min-w-0">
                  <FilePreview src={fileUrl(file.relPath)} name={file.name} ext={file.ext}>
                    <span class="font-mono text-sm text-slate-100">{file.name}</span>
                  </FilePreview>
                </span>
                <span class="text-xs text-slate-100">{fmtSize(file.size)}</span>

                {#if file.ext === 'csv'}
                  {#if file.latestImport}
                    <span class="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-500/70">
                      <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      imported {file.latestImport}
                    </span>
                  {:else}
                    <button
                      onclick={() => startImport(file)}
                      class="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-100 transition-colors hover:border-blue-300/50 hover:text-blue-500"
                    >
                      Import
                    </button>
                  {/if}
                {/if}

                {#each (data.docTransactions[file.relPath] ?? []) as txn}
                  <a
                    href="/tx/{txn.txid ?? txn.tindex}?ref={encodeURIComponent('/docs')}"
                    class="rounded-md border border-slate-300/60 bg-slate-800/40 px-2.5 py-1 text-xs text-slate-100 transition-colors hover:border-slate-400 hover:text-slate-100"
                    title="{txn.date} {txn.description}"
                  >
                    {txn.date} · {txn.vendor.length > 28 ? txn.vendor.slice(0, 28) + '…' : txn.vendor}
                  </a>
                  {#if txn.unpaid}
                    <span class="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500">
                      unpaid
                    </span>
                    <button
                      type="button"
                      onclick={() => { payingDocPath = file.relPath; payDate = data.today; payAccount = data.paymentAccounts[0] ?? ''; payError = ''; }}
                      class="rounded-md border border-emerald-700/50 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
                    >Pay</button>
                  {/if}
                {/each}
                {#if payingDocPath === file.relPath}
                  {@const txn = (data.docTransactions[file.relPath] ?? [])[0]}
                  <div class="w-full mt-1 flex flex-col gap-1.5">
                    <form method="POST" action="?/pay" use:enhance={() => {
                      paySubmitting = true;
                      payError = '';
                      return async ({ result, update }) => {
                        paySubmitting = false;
                        if (result.type === 'success') {
                          payingDocPath = null;
                          await update();
                        } else {
                          payError = (result as any).data?.payError ?? 'Payment failed.';
                          await update({ reset: false });
                        }
                      };
                    }} class="flex items-center gap-2">
                      <input type="hidden" name="vendor" value={txn?.vendor ?? ''} />
                      <input type="hidden" name="amount" value={txn?.amount ? fmtAmount(txn.amount) : ''} />
                      <input type="hidden" name="docPath" value={file.relPath} />
                      <DatePicker bind:value={payDate} name="date" />
                      <div class="flex-1 min-w-0">
                        <Combobox
                          items={data.paymentAccounts}
                          value={payAccount}
                          onchange={(val) => { payAccount = val; }}
                          name="paymentAccount"
                          placeholder="Payment account…"
                          inputClass="w-full border border-slate-300 rounded-lg bg-slate-900 px-2 py-1.5 pr-6 font-mono text-sm text-slate-100 placeholder:text-slate-100 focus:border-blue-300 outline-none"
                        />
                      </div>
                      <span class="shrink-0 font-mono text-sm text-slate-100">{txn?.amount ? fmtAmount(txn.amount) : ''}</span>
                      <button type="submit" disabled={paySubmitting}
                        class="btn-primary">
                        {paySubmitting ? '…' : 'Record'}
                      </button>
                      <button type="button" onclick={() => { payingDocPath = null; payError = ''; }}
                        class="btn-cancel">Cancel</button>
                    </form>
                    {#if payError}
                      <p class="text-xs text-rose-400">{payError}</p>
                    {/if}
                  </div>
                {/if}

                <a
                  href={file.ext === 'csv' ? `/docs/csv?p=${encodeURIComponent(file.relPath)}` : fileUrl(file.relPath)}
                  target={['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'txt', 'csv'].includes(file.ext) ? '_blank' : undefined}
                  download={!['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'txt', 'csv'].includes(file.ext) ? file.name : undefined}
                  class="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-100 transition-colors hover:border-slate-400 hover:text-slate-100">
                  {['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'txt', 'csv'].includes(file.ext) ? 'View' : 'Download'}
                </a>
              </div>
            {/each}
          </div>
        {/each}
      </div>
    {/each}
  </div>
{/if}

{/if}

