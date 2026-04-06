<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { page } from '$app/stores';
  import { AlertDialog } from 'bits-ui';
  import { accountTail, accountColor, accountSortKey } from '$lib/account-colors.js';
  import AccountBadge from '$lib/components/AccountBadge.svelte';
  import AccountLabel from '$lib/components/AccountLabel.svelte';
  import AccountTypeBadge from '$lib/components/AccountTypeBadge.svelte';
  import EquationDisplay from '$lib/components/EquationDisplay.svelte';
  import { parseCommodity, formatAmount } from '$lib/format.js';
  import Amount from '$lib/components/Amount.svelte';
  import FileIcon from '$lib/components/FileIcon.svelte';
  import FilePreview from '$lib/components/FilePreview.svelte';
  import Combobox from '$lib/components/Combobox.svelte';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { invalidateAll } from '$app/navigation';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const learningBeginner = $derived(
    $page.data.settings?.learning?.enabled && $page.data.settings?.learning?.level === 'beginner'
  );

  const equationParts = $derived.by(() => {
    const typeSum = (prefix: string) => postingDetails
      .filter(p => p.account.startsWith(prefix))
      .reduce((s, p) => s + p.amount, 0);
    return {
      assets: typeSum('assets'),
      liabilities: typeSum('liabilities'),
      equity: typeSum('equity'),
      income: typeSum('income'),
      expenses: typeSum('expenses'),
    };
  });

  const backHref = $derived($page.url.searchParams.get('ref') ?? '/register');

  // Extract import source from raw text comment (e.g. "imported from checking.csv")
  const importSource = $derived(data.txn.rawText?.match(/imported from (.+?)(?:,|\s*$)/m)?.[1] ?? '');

  // Parse vendor and note
  const pipeIdx = $derived(data.txn.description.indexOf('|'));
  const vendor = $derived(pipeIdx >= 0 ? data.txn.description.slice(0, pipeIdx).trim() : data.txn.description);
  const note = $derived(pipeIdx >= 0 ? data.txn.description.slice(pipeIdx + 1).trim() : '');

  // Parse amounts, computing auto-balanced postings
  const postingDetails = $derived.by(() => {
    const parsed = data.txn.postings.map((p) => {
      const assertionMatch = p.amount.match(/=\s*(.+)$/);
      const assertion = assertionMatch ? assertionMatch[1].trim() : '';
      const rawAmt = p.amount.replace(/\s*=\s*.*$/, ''); // strip balance assertion
      const num = parseFloat(rawAmt.replace(/[$,]/g, ''));
      // Balance assignment: no explicit amount, but has assertion (e.g. "= $34,000")
      const isBalanceAssignment = isNaN(num) && !!assertion;
      const assertionNum = assertion ? parseFloat(assertion.replace(/[$,]/g, '')) : NaN;
      return {
        account: p.account,
        parsedAmount: isNaN(num) ? null : num,
        assertion,
        isBalanceAssignment,
        assertionNum: isNaN(assertionNum) ? null : assertionNum,
      };
    });

    const hasBalanceAssignment = parsed.some(p => p.isBalanceAssignment);
    const explicitSum = parsed.reduce((s, p) => s + (p.parsedAmount ?? 0), 0);

    return parsed.map((p) => {
      let amount: number;
      if (p.parsedAmount != null) {
        amount = p.parsedAmount;
      } else if (p.isBalanceAssignment) {
        // Balance assignment — actual delta is computed by hledger at runtime,
        // we can't know it client-side. Show 0 and let the assertion display handle it.
        amount = 0;
      } else if (hasBalanceAssignment) {
        // Auto-balanced posting alongside a balance assignment — also unknown
        amount = 0;
      } else {
        amount = -explicitSum;
      }
      const isAuto = p.parsedAmount == null && !p.isBalanceAssignment;
      return {
        account: p.account,
        amount,
        absAmount: Math.abs(amount),
        isDebit: amount > 0,
        assertion: p.assertion,
        isBalanceAssignment: p.isBalanceAssignment,
        isAuto,
      };
    }).sort((a, b) => {
      // Auto-balanced postings always go last
      if (a.isAuto !== b.isAuto) return a.isAuto ? 1 : -1;
      return accountSortKey(a.account) - accountSortKey(b.account);
    });
  });

  const hasBalanceAssignment = $derived(postingDetails.some(p => p.isBalanceAssignment));

  const totalDebits = $derived(postingDetails.filter(p => p.isDebit).reduce((s, p) => s + p.absAmount, 0));
  const totalCredits = $derived(postingDetails.filter(p => !p.isDebit).reduce((s, p) => s + p.absAmount, 0));

  const commodityFmt = $derived(parseCommodity($page.data.commodity ?? '$1,000.00'));
  const roundAmounts = $derived($page.data.settings?.display?.roundAmounts === true);
  const displayFmt = $derived(roundAmounts ? { ...commodityFmt, decimals: 0 } : commodityFmt);
  const showSymbol = $derived($page.data.settings?.display?.showCurrencySymbol !== false);
  function fmt(n: number) {
    const full = formatAmount(n, displayFmt);
    if (showSymbol) return full;
    return full.replace(displayFmt.symbol, '');
  }

  // Edit link preserves ref param
  const editHref = $derived(() => {
    const id = data.txn.txid ?? data.txn.tindex;
    const ref = $page.url.searchParams.get('ref') ?? '/register';
    return `/tx/${id}/edit?ref=${encodeURIComponent(ref)}`;
  });

  // Only show "View all from" link for vendor transactions (has expense or income postings)
  const isVendorTxn = $derived(
    data.txn.postings.some((p: { account: string }) =>
      p.account.startsWith('expenses') || p.account.startsWith('income')
    )
  );

  // Bill/payment connection
  const payableLink = $derived(data.payableLink);
  const isBill = $derived(payableLink?.type === 'bill');
  const isPayment = $derived(payableLink?.type === 'payment');
  const billAmount = $derived.by(() => {
    if (!payableLink) return 0;
    const pp = postingDetails.find(p => p.account.startsWith('liabilities:payable'));
    return pp ? pp.absAmount : 0;
  });
  const isPaid = $derived(payableLink?.type === 'bill' && (payableLink.related?.length ?? 0) > 0);

  let showPayForm = $state(false);
  let payAccount = $state('');
  let payDate = $state('');
  let paying = $state(false);
  let payError = $state('');

  let showDeleteConfirm = $state(false);
  let editingRaw = $state(false);
  let rawDraft = $state('');
  let editSaving = $state(false);
  let editError = $state('');
  let showAttach = $state(false);
  let attachDragging = $state(false);
  let attachFileName = $state('');
  let attachError = $state('');

  // Format raw journal text with aligned amounts
  const formattedRaw = $derived(() => {
    if (!data.txn.rawText) return { headerMain: '', headerComment: '', postings: [] as { left: string; pad: string; amount: string }[] };
    const lines = data.txn.rawText.split('\n');
    if (lines.length === 0) return { headerMain: '', headerComment: '', postings: [] };

    // First line is the header
    const header = lines[0];
    const postingLines = lines.slice(1).filter(l => l.trim());

    // Parse postings: separate account from amount
    const parsed = postingLines.map(line => {
      const trimmed = line.replace(/^[\t ]+/, '');
      const status = trimmed.match(/^[*!]\s*/)?.[0] ?? '';
      const rest = trimmed.slice(status.length);
      const match = rest.match(/^(.+?)\s{2,}(.+)$/);
      if (match) {
        return { status, account: match[1], amount: match[2] };
      }
      return { status, account: rest, amount: '' };
    });

    // Find the longest account name to align amounts
    const maxAcct = Math.max(...parsed.map(p => (p.status + p.account).length), 40);

    const formatted = parsed.map(p => {
      const left = p.status + p.account;
      const pad = ' '.repeat(Math.max(2, maxAcct - left.length + 4));
      return { left: '    ' + left, pad, amount: p.amount };
    });

    // Strip comment from header for cleaner display
    const headerComment = header.match(/\s+(;.*)$/)?.[1] ?? '';
    const headerMain = headerComment ? header.slice(0, header.indexOf(headerComment)).trimEnd() : header;

    return { headerMain, headerComment, postings: formatted };
  });
</script>

<!-- Top bar -->
<div class="mb-4 flex items-center justify-between">
  <a href={backHref} class="text-sm text-slate-100 hover:text-slate-100 transition-colors">← Back</a>
  <div class="flex items-center gap-3">
    <a
      href={editHref()}
      class="btn-edit"
    ><svg class="inline-block w-3.5 h-3.5 mr-1 -mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>Edit</a>
    <button
      onclick={() => (showDeleteConfirm = true)}
      class="btn-delete"
    >Delete</button>
  </div>
</div>

<!-- Details View -->
<div class="space-y-4">
  <!-- Summary card -->
  <div class="glass-card rounded-xl border border-slate-400 p-5 animate-in animate-in-1">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold text-slate-100">{vendor}</h1>
        {#if note}
          <p class="mt-0.5 text-sm text-slate-100">{note}</p>
        {/if}
        <a
          href="/register?q={encodeURIComponent(vendor)}&from="
          class="mt-1 inline-block text-xs text-slate-100 hover:text-slate-100 transition-colors"
        >View all from {vendor} →</a>
      </div>
      <div class="text-right shrink-0">
        <span class="text-sm text-slate-100">{data.txn.date}</span>
        {#if importSource}
          <p class="mt-0.5 text-xs text-slate-100">imported from <a
            href="/docs/csv?p={encodeURIComponent(importSource)}"
            class="text-slate-100 underline decoration-slate-700 hover:text-slate-100 transition-colors"
          >{importSource}</a></p>
        {/if}
      </div>
    </div>

    <!-- Postings -->
    <div class="mt-4 border-t border-slate-400 pt-4 space-y-2">
      {#each postingDetails as p}
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center min-w-0">
            <AccountBadge account={p.account} size="md" />
            <span class="font-mono text-sm {accountColor(p.account)}">{accountTail(p.account)}</span>
          </div>
          <span class="shrink-0 font-mono text-sm tabular-nums">
            {#if p.isBalanceAssignment}
              <span class="text-slate-100">= </span><span class="text-slate-100">{p.assertion}</span>
            {:else if hasBalanceAssignment && p.amount === 0}
              <span class="text-slate-100 italic">auto</span>
            {:else}
              <span class="{p.amount >= 0 ? 'text-slate-100' : 'text-slate-100'}">{p.amount < 0 ? '−' : ''}<Amount precise value={p.absAmount} /></span>
            {/if}
          </span>
        </div>
      {/each}
      {#if !hasBalanceAssignment && Math.abs(postingDetails.reduce((s, p) => s + p.amount, 0)) > 0.005}
        <div class="border-t border-rose-500/30 pt-2 flex items-center justify-between">
          <span class="text-sm font-semibold text-rose-400">Unbalanced</span>
          <span class="font-mono text-sm tabular-nums text-rose-400"><Amount precise value={postingDetails.reduce((s, p) => s + p.amount, 0)} /></span>
        </div>
      {/if}
    </div>

    <!-- Bill / Payment connection -->
    {#if payableLink}
      <div class="mt-4 border-t border-slate-400 pt-4">
        {#if isBill}
          <div class="flex items-center gap-2 text-sm">
            <span class="text-slate-100">Bill for</span>
            <span class="font-mono font-semibold text-amber-400"><Amount precise value={billAmount} /></span>
            {#if isPaid}
              <span class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">Paid</span>
            {:else}
              <span class="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">Unpaid</span>
            {/if}
          </div>
          {#if payableLink.related.length > 0}
            <div class="mt-3 space-y-3">
              {#each payableLink.related as rel}
                <a href="/tx/{rel.txid || rel.tindex}" class="block rounded-lg border border-slate-400 bg-slate-800/30 p-3 transition-colors hover:border-slate-300 hover:bg-slate-800/50">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-medium text-emerald-400">Payment — {rel.date}</span>
                    <span class="text-xs text-slate-100">View →</span>
                  </div>
                  <div class="space-y-1.5">
                    {#each rel.postings as rp}
                      <div class="flex items-center justify-between gap-3">
                        <AccountLabel account={rp.account} />
                        <span class="shrink-0 font-mono text-sm tabular-nums {rp.amount >= 0 ? 'text-slate-100' : 'text-slate-100'}">{rp.amount < 0 ? '−' : ''}<Amount precise value={Math.abs(rp.amount)} /></span>
                      </div>
                    {/each}
                  </div>
                </a>
              {/each}
            </div>
            {:else}
            {#if !showPayForm}
              <button
                onclick={() => { showPayForm = true; payDate = new Date().toISOString().slice(0, 10); payAccount = ''; payError = ''; }}
                class="btn-primary mt-2"
              >
                <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                Pay this bill
              </button>
            {:else}
              {@const payableAccount = data.txn.postings.find(p => p.account.startsWith('liabilities:payable'))?.account ?? 'liabilities:payable'}
              {@const amtStr = fmt(billAmount)}
              <form
                method="POST"
                action="?/pay"
                class="mt-2 space-y-3 rounded-lg border border-slate-400 bg-slate-900/50 p-3"
                use:enhance={() => {
                  paying = true;
                  return async ({ result, update }) => {
                    paying = false;
                    if (result.type === 'success') { showPayForm = false; await invalidateAll(); }
                    else if (result.type === 'failure') { payError = (result.data as any)?.payError ?? 'Failed'; }
                    await update();
                  };
                }}
              >
                <input type="hidden" name="payableAccount" value={payableAccount} />
                <input type="hidden" name="amount" value={amtStr} />
                <input type="hidden" name="description" value={vendor + (note ? ' | ' + note : '')} />
                <input type="hidden" name="billTxid" value={data.txn.txid ?? ''} />
                <div class="flex items-center gap-2 text-sm text-slate-100">
                  <span>Pay <span class="font-mono font-semibold text-emerald-400"><Amount precise value={billAmount} /></span> from:</span>
                </div>
                <div class="flex gap-2">
                  <div class="w-48">
                    <DatePicker bind:value={payDate} name="date" />
                  </div>
                  <div class="flex-1">
                    <Combobox
                      items={data.accounts.filter((a) => a.startsWith('assets') || a.startsWith('liabilities'))}
                      value={payAccount}
                      placeholder="Pay from account…"
                      onchange={(v) => { payAccount = v ?? ''; }}
                      name="account"
                      inputClass="w-full rounded-lg border border-slate-300 bg-slate-900 px-3 pr-8 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-100 focus:border-blue-300"
                    />
                  </div>
                </div>
                {#if payError}
                  <p class="text-sm text-rose-400">{payError}</p>
                {/if}
                <div class="flex gap-2">
                  <button type="submit" disabled={!payAccount || paying} class="btn-primary">
                    {paying ? 'Creating…' : 'Create payment'}
                  </button>
                  <button type="button" onclick={() => showPayForm = false} class="btn-cancel">Cancel</button>
                </div>
              </form>
            {/if}
          {/if}
        {:else if isPayment}
          <div class="flex items-center gap-2 text-sm">
            <span class="text-slate-100">Payment of</span>
            <span class="font-mono font-semibold text-emerald-400"><Amount precise value={billAmount} /></span>
          </div>
          {#if payableLink.related.length > 0}
            <div class="mt-3 space-y-3">
              {#each payableLink.related as rel}
                <a href="/tx/{rel.txid || rel.tindex}" class="block rounded-lg border border-slate-400 bg-slate-800/30 p-3 transition-colors hover:border-slate-300 hover:bg-slate-800/50">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-medium text-amber-400">Bill — {rel.date}</span>
                    <span class="text-xs text-slate-100">View →</span>
                  </div>
                  <div class="space-y-1.5">
                    {#each rel.postings as rp}
                      <div class="flex items-center justify-between gap-3">
                        <AccountLabel account={rp.account} />
                        <span class="shrink-0 font-mono text-sm tabular-nums {rp.amount >= 0 ? 'text-slate-100' : 'text-slate-100'}">{rp.amount < 0 ? '−' : ''}<Amount precise value={Math.abs(rp.amount)} /></span>
                      </div>
                    {/each}
                  </div>
                </a>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    {/if}

    <!-- Connected file / attach -->
    <div class="mt-4 border-t border-slate-400 pt-4">
      {#if data.txn.docPath}
        {@const ext = data.txn.docPath.split('.').pop()?.toLowerCase() ?? ''}
        {@const fileName = data.txn.docPath.split('/').pop() ?? data.txn.docPath}
        {@const fileUrl = `/docs/file?p=${encodeURIComponent(data.txn.docPath)}`}
        <div class="flex items-center gap-3">
          <FileIcon {ext} size="sm" />
          <FilePreview src={fileUrl} name={fileName} {ext}>
            <span class="font-mono text-sm text-slate-100">{fileName}</span>
          </FilePreview>
          <a
            href={ext === 'csv' ? `/docs/csv?p=${encodeURIComponent(data.txn.docPath)}` : fileUrl}
            target={['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'txt', 'csv'].includes(ext) ? '_blank' : undefined}
            class="ml-auto rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-100 transition-colors hover:border-slate-400 hover:text-slate-100"
          >{['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'txt', 'csv'].includes(ext) ? 'View' : 'Download'}</a>
        </div>
      {:else if showAttach}
        <form method="POST" action="?/attach" enctype="multipart/form-data"
          use:enhance={() => {
            return async ({ result, update }) => {
              if (result.type === 'success') { showAttach = false; attachError = ''; attachFileName = ''; }
              else if (result.type === 'failure') { attachError = (result.data as any)?.attachError ?? 'Upload failed'; }
              await update();
            };
          }}
          ondragover={(e: DragEvent) => { e.preventDefault(); attachDragging = true; }}
          ondragleave={(e: DragEvent) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            if (e.clientX <= rect.left || e.clientX >= rect.right || e.clientY <= rect.top || e.clientY >= rect.bottom) {
              attachDragging = false;
            }
          }}
          ondrop={(e: DragEvent) => {
            e.preventDefault();
            attachDragging = false;
            const file = e.dataTransfer?.files?.[0];
            if (file) {
              const input = document.getElementById('attach-file') as HTMLInputElement;
              const dt = new DataTransfer();
              dt.items.add(file);
              input.files = dt.files;
              attachFileName = file.name;
            }
          }}
          class="flex flex-col gap-3"
        >
          <input id="attach-file" type="file" name="file" class="hidden"
            onchange={(e) => { attachFileName = (e.target as HTMLInputElement).files?.[0]?.name ?? ''; }} />
          <button
            type="button"
            class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-100 transition-colors hover:border-slate-300 dark:border-slate-300 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-600 {attachDragging ? '!border-blue-300 !bg-blue-50 dark:!bg-blue-300/10' : ''}"
            onclick={() => document.getElementById('attach-file')?.click()}
          >
            <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            <span>{attachFileName ? attachFileName : attachDragging ? 'Drop to attach' : 'Choose file or drag here'}</span>
          </button>
          <div class="flex gap-2">
            <button type="submit" class="btn-primary">Attach</button>
            <button type="button" onclick={() => { showAttach = false; attachError = ''; }}
              class="btn-cancel">Cancel</button>
          </div>
        </form>
        {#if attachError}
          <p class="mt-2 text-sm text-rose-400">{attachError}</p>
        {/if}
      {:else}
        <button
          onclick={() => (showAttach = true)}
          class="flex items-center gap-2 text-sm text-slate-100 transition-colors hover:text-slate-100"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          Attach file
        </button>
      {/if}
    </div>
  </div>

  <!-- Learning mode: equation breakdown -->
  {#if learningBeginner}
    <div class="rounded-xl border border-blue-300 bg-blue-50/50 dark:border-blue-300/25 dark:bg-blue-300/5 px-5 py-4 animate-in animate-in-5 space-y-3">
      <div class="flex items-center justify-between">
        <p class="text-base font-semibold text-slate-100 dark:text-slate-100">How this transaction fits the equation</p>
        <a href="/settings#learning" class="text-sm text-blue-600/70 dark:text-blue-500/70 underline underline-offset-2 hover:text-blue-900 dark:hover:text-blue-500">Learning Mode</a>
      </div>
      <EquationDisplay values={{
        assets: equationParts.assets,
        liabilities: -equationParts.liabilities,
        equity: -equationParts.equity,
        income: -equationParts.income,
        expenses: equationParts.expenses,
      }} {fmt} />
      <p class="text-sm text-slate-100 leading-relaxed">
        {#if equationParts.equity !== 0}
          Opening balances — this is the starting snapshot of your accounts. The Equity account is just the balancing entry that makes the numbers work.
        {:else if equationParts.assets !== 0 && equationParts.expenses !== 0 && equationParts.income === 0 && equationParts.liabilities === 0}
          You spent <Amount precise value={Math.abs(equationParts.assets)} /> from your accounts on expenses. Assets went down, Expenses went up — still balanced.
        {:else if equationParts.assets !== 0 && equationParts.income !== 0 && equationParts.expenses === 0 && equationParts.liabilities === 0}
          You received <Amount precise value={Math.abs(equationParts.income)} /> in income. Assets went up, Income recorded where it came from — still balanced.
        {:else if equationParts.assets !== 0 && equationParts.liabilities !== 0 && equationParts.expenses !== 0}
          Part of this payment went to expenses, part reduced a liability. The total leaving Assets equals what arrived in the other accounts — still balanced.
        {:else if equationParts.assets !== 0 && equationParts.liabilities !== 0 && equationParts.assets < 0 && equationParts.liabilities > 0}
          Money moved between Assets and Liabilities — you paid down debt. Still balanced.
        {:else if equationParts.assets !== 0 && equationParts.liabilities !== 0 && equationParts.assets > 0 && equationParts.liabilities < 0}
          A liability increased your assets — you took on new debt or received a credit. Still balanced.
        {:else if equationParts.assets !== 0 && equationParts.liabilities !== 0}
          Money moved between Assets and Liabilities. Still balanced.
        {:else}
          Each account type changed by the amounts shown — still balanced.
        {/if}
      </p>
      <p class="text-sm text-slate-100 leading-relaxed">
        In hledger, <AccountTypeBadge type="liabilities" />, <AccountTypeBadge type="equity" />, and <AccountTypeBadge type="income" /> are stored as negative numbers in the journal — that's how every transaction sums to zero. Reports flip the signs so they read naturally.
      </p>
    </div>
  {/if}

  <!-- Raw journal text -->
  {#if data.txn.rawText}
    <details class="group animate-in animate-in-5">
      <summary class="cursor-pointer list-none text-sm text-slate-100 hover:text-slate-100 transition-colors flex items-center gap-1.5">
        <svg class="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m9 18 6-6-6-6"/></svg>
        <span class="group-open:hidden">Show plain text journal</span>
        <span class="hidden group-open:inline">Hide plain text journal</span>
      </summary>
      {#if editingRaw}
        <form
          method="POST"
          action="?/editRaw"
          class="mt-2"
          use:enhance={() => {
            editSaving = true;
            return async ({ result, update }) => {
              editSaving = false;
              if (result.type === 'success') { editingRaw = false; editError = ''; await invalidateAll(); }
              else if (result.type === 'failure') { editError = (result.data as any)?.editError ?? 'Update failed'; }
              await update();
            };
          }}
        >
          <textarea
            name="rawText"
            bind:value={rawDraft}
            class="w-full rounded-lg border border-slate-300 bg-slate-950 px-4 py-3 font-mono text-sm leading-relaxed text-slate-100 outline-none focus:border-blue-300 resize-y"
            rows={Math.max(4, rawDraft.split('\n').length + 1)}
            spellcheck="false"
          ></textarea>
          {#if editError}
            <p class="mt-2 text-sm text-rose-400">{editError}</p>
          {/if}
          <div class="mt-2 flex gap-2">
            <button type="submit" disabled={editSaving} class="btn-primary text-xs">{editSaving ? 'Saving…' : 'Save'}</button>
            <button type="button" onclick={() => { editingRaw = false; editError = ''; }} class="btn-cancel text-xs">Cancel</button>
          </div>
        </form>
      {:else}
        <div class="mt-2 rounded-lg border border-slate-400 bg-white dark:bg-slate-950 px-4 py-3 font-mono text-sm leading-relaxed overflow-x-auto">
          <div>
            <span class="text-slate-100">{formattedRaw().headerMain}</span>{#if formattedRaw().headerComment}<span class="text-slate-100">  {formattedRaw().headerComment}</span>{/if}
          </div>
          {#each formattedRaw().postings as p}
            <div class="whitespace-pre">
              <span class="text-slate-100">{p.left}</span><span>{p.pad}</span><span class="text-slate-100">{p.amount}</span>
            </div>
          {/each}
        </div>
        <button
          onclick={() => { rawDraft = data.txn.rawText ?? ''; editingRaw = true; editError = ''; }}
          class="mt-2 text-sm text-slate-100 hover:text-slate-100 transition-colors flex items-center gap-1.5"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
          Edit
        </button>
      {/if}
    </details>
  {/if}

</div>

<!-- Delete confirmation -->
<AlertDialog.Root bind:open={showDeleteConfirm}>
  <AlertDialog.Portal>
    <AlertDialog.Overlay class="fixed inset-0 z-50 bg-black/60" />
    <AlertDialog.Content class="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-300 bg-slate-900 p-6 shadow-2xl">
      <AlertDialog.Title class="mb-2 text-base font-semibold text-slate-100">Delete transaction?</AlertDialog.Title>
      <AlertDialog.Description class="mb-5 text-sm text-slate-100">
        "<span class="text-slate-100">{data.txn.description}</span>" on {data.txn.date} will be permanently removed from the journal.
      </AlertDialog.Description>
      <div class="flex justify-end gap-3">
        <AlertDialog.Cancel class="btn-cancel">
          Cancel
        </AlertDialog.Cancel>
        <form method="POST" action="?/delete" use:enhance>
          <AlertDialog.Action type="submit" class="btn-primary bg-rose-500 hover:bg-rose-600 hover:opacity-100">
            Delete
          </AlertDialog.Action>
        </form>
      </div>
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>
