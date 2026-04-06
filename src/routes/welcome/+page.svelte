<script lang="ts">
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import { tick } from "svelte";
  import { slide } from "svelte/transition";
  import Combobox from "$lib/components/Combobox.svelte";
  import DatePicker from "$lib/components/DatePicker.svelte";
  import SailboatLogo from "$lib/components/SailboatLogo.svelte";
  import AccountLabel from "$lib/components/AccountLabel.svelte";
  import Amount from "$lib/components/Amount.svelte";
  import AccountTypeBadge from "$lib/components/AccountTypeBadge.svelte";
  import EquationDisplay from "$lib/components/EquationDisplay.svelte";
  import TransactionExample from "$lib/components/TransactionExample.svelte";

  let { data, form } = $props();

  // Opening balances only need asset/liability accounts
  const balanceAccounts = $derived(
    (data.accounts ?? []).filter(
      (a: string) => a.startsWith("assets") || a.startsWith("liabilities"),
    ),
  );

  // Opening balances form state
  let rows = $state([
    { account: "", amount: "" },
    { account: "", amount: "" },
    { account: "", amount: "" },
  ]);

  const localToday = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  let obDate = $state(localToday);
  let showOB = $state(false);

  function fmtDate(iso: string) {
    return new Date(iso + "T00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function addRow() {
    rows = [...rows, { account: "", amount: "" }];
  }

  function removeRow(i: number) {
    rows = rows.filter((_, idx) => idx !== i);
  }

  // Accordion state for sections
  let expandedSection = $state<string | null>("get-started");

  const hledgerStatusColor = $derived(
    !data.hledgerOk ? "rose" : !data.hledgerSupported ? "amber" : "emerald",
  );

  function toggleSection(section: string, el: HTMLElement) {
    const opening = expandedSection !== section;
    expandedSection = opening ? section : null;
    if (opening) {
      tick().then(() =>
        el.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    }
  }
</script>

<div class="space-y-8 max-w-2xl">
  <!-- Hero -->
  <div class="text-center py-6">
    <div class="inline-block mb-4">
      <SailboatLogo withText class="h-20 mx-auto" />
    </div>
    <p class="-mt-4 text-base text-slate-100 max-w-md mx-auto leading-relaxed">
      Personal accounting powered by hledger.
    </p>
  </div>

  <!-- Prerequisites -->
  <section
    class="rounded-xl border
    {hledgerStatusColor === 'emerald' ? 'border-blue-300/30 bg-blue-300/5' : ''}
    {hledgerStatusColor === 'amber' ? 'border-amber-500/30 bg-amber-500/5' : ''}
    {hledgerStatusColor === 'rose' ? 'border-rose-500/30 bg-rose-500/5' : ''}
    p-5"
  >
    <div class="flex items-center gap-3">
      {#if data.hledgerOk && data.hledgerSupported}
        <div>
          <p class="text-base font-medium text-blue-500">
            hledger {data.hledgerVersion}
          </p>
          <p class="text-base text-slate-100">Ready to go</p>
        </div>
      {:else if data.hledgerOk && !data.hledgerSupported}
        <span
          class="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 text-base"
          >⚠</span
        >
        <div>
          <p class="text-base font-medium text-amber-400">
            hledger {data.hledgerVersion}
          </p>
          <p class="text-base text-amber-300">{data.hledgerMessage}</p>
        </div>
      {:else}
        <span
          class="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/20 text-rose-400 text-base"
          >✗</span
        >
        <div>
          <p class="text-base font-medium text-rose-400">hledger not found</p>
          <p class="text-base text-slate-100">Install it to get started</p>
        </div>
      {/if}
    </div>
    {#if !data.hledgerOk || !data.hledgerSupported}
      <div
        class="mt-4 rounded-lg bg-slate-800 p-4 font-mono text-base text-slate-100 space-y-2"
      >
        <p class="text-slate-100"># macOS (Homebrew)</p>
        <p>brew install hledger@1.52</p>
        <p class="text-slate-100 mt-3"># Linux / WSL</p>
        <p>curl -sO https://hledger.org/install.sh && bash install.sh</p>
        <p class="text-slate-100 mt-3"># Via Stack (any version)</p>
        <p>stack install hledger-1.52</p>
        <p class="text-slate-100 mt-3"># Verify</p>
        <p>hledger --version</p>
      </div>
      <p class="mt-3 text-base text-slate-100">
        Requires hledger 1.40+. Once installed, restart the dev server.
      </p>
    {/if}
  </section>

  <!-- Get Started -->
  <section>
    <button
      onclick={(e: MouseEvent) =>
        toggleSection("get-started", e.currentTarget as HTMLElement)}
      class="w-full flex items-center gap-3 text-left cursor-pointer rounded-lg px-3 py-3 -mx-3 transition-colors hover:bg-slate-800/40"
    >
      <span
        class="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-300 text-base font-bold border border-emerald-500/30"
        >1</span
      >
      <div class="flex-1">
        <h2 class="text-base font-semibold text-slate-100">Get Started</h2>
        <p class="text-base text-slate-100">
          Set your starting balances so the numbers make sense from day one
        </p>
      </div>
      <span
        class="text-slate-100 text-xl font-bold transition-transform {expandedSection ===
        'get-started'
          ? 'rotate-90'
          : ''}">▸</span
      >
    </button>

    {#if expandedSection === "get-started"}
      <div class="mt-3 space-y-4" transition:slide={{ duration: 250 }}>
        <div
          class="rounded-lg border border-slate-400 bg-slate-900 p-4 space-y-2"
        >
          <h3 class="text-base font-semibold text-slate-100 mb-1">
            Your finances are a text file
          </h3>
          <p class="text-base text-slate-100 leading-relaxed">
            Every transaction is a few lines of text in, or included from, <code
              class="font-mono text-base text-slate-100">main.journal</code
            >
            <a
              href="/journal"
              class="text-blue-500 hover:text-blue-500 underline underline-offset-2"
              >(view plain text)</a
            >. The file is local to you, you can edit it in a text editor.
            Nothing external. No databases, no proprietary format.
          </p>
          <p class="mt-1 text-base text-slate-100 leading-relaxed">
            Plain text is also easy for AI tools to read and work with.
          </p>
        </div>
        <div
          class="rounded-lg border border-slate-400 bg-slate-900 p-4 space-y-2"
        >
          <h3 class="text-base font-semibold text-slate-100 mb-2">Currency</h3>
          <p class="text-base text-slate-100 leading-relaxed mb-3">
            This sets how amounts are displayed and lets you write bare numbers
            in your journal without a currency symbol.
          </p>
          <form
            method="POST"
            action="?/setCommodity"
            use:enhance={() => {
              return async ({ update }) => {
                await update();
              };
            }}
          >
            <div class="flex items-center gap-2 mb-3">
              <label for="commodity" class="text-base text-slate-100"
                >Directive</label
              >
              <input
                id="commodity"
                name="commodity"
                type="text"
                value={data.commodity}
                autocomplete="off"
                class="flex-1 rounded-lg border border-slate-300 bg-slate-900 px-3 py-2 font-mono text-base text-slate-100 outline-none focus:border-blue-300"
              />
              <button
                type="submit"
                class="rounded-lg border border-slate-300 bg-slate-900 px-4 py-2 text-base text-slate-100 transition-colors hover:border-blue-300 hover:text-blue-500"
                >Save</button
              >
            </div>
          </form>
          <details class="rounded-md bg-slate-800/40 text-base text-slate-100">
            <summary
              class="cursor-pointer select-none px-3 py-2 text-slate-100 font-semibold hover:text-slate-100 transition-colors"
              >Common formats</summary
            >
            <div class="px-3 pb-2.5 space-y-1">
              <p>
                <code class="font-mono text-slate-100">$1,000.00</code> — US Dollar
              </p>
              <p>
                <code class="font-mono text-slate-100">€1.000,00</code> — Euro (dot
                for thousands, comma for decimals)
              </p>
              <p>
                <code class="font-mono text-slate-100">£1,000.00</code> — British
                Pound
              </p>
              <p>
                <code class="font-mono text-slate-100">¥1,000</code> — Japanese Yen
                (no decimals)
              </p>
              <p>
                <code class="font-mono text-slate-100">₹1,00,000.00</code> — Indian
                Rupee (lakhs grouping)
              </p>
            </div>
          </details>
        </div>
        <div
          class="rounded-lg border border-slate-400 bg-slate-900 p-4 space-y-2"
        >
          {#if data.openingTxn}
            <div class="flex items-center gap-2 mb-2">
              <span class="text-emerald-400">✓</span>
              <strong class="text-base text-slate-100">Opening balances</strong>
              <span class="text-base text-slate-100"
                >— {fmtDate(data.openingTxn.date)}</span
              >
            </div>
            <div class="rounded-md bg-slate-800/30 p-3 space-y-1">
              {#each (data.openingTxn.postings ?? []).filter((p: any) => !p.account.startsWith("equity")) as posting}
                <div class="flex items-center justify-between text-base">
                  <AccountLabel account={posting.account} />
                  <Amount
                    value={Number(posting.amount)}
                    class="font-mono text-slate-100"
                  />
                </div>
              {/each}
            </div>
            <p class="mt-2 text-base text-slate-100">
              <a
                href="/tx/{data.openingTxn.tindex}"
                class="text-blue-500 hover:text-blue-500 underline underline-offset-2"
                >Edit this transaction</a
              > if you need to update these.
            </p>
          {:else}
            <p class="text-base text-slate-100 leading-relaxed mb-3">
              <strong class="text-slate-100">Opening balances</strong> tell the app
              what you had when you started tracking.
            </p>
            <p class="text-base text-slate-100 leading-relaxed mb-3">
              Pick a start date and enter the balances of your bank accounts,
              credit cards, and loans as of that date. This can be today, the
              start of the year, or whenever you want to begin tracking.
            </p>

            {#if !showOB}
              <button onclick={() => (showOB = true)} class="btn-primary">
                Set opening balances
              </button>
            {:else}
              <p>You can edit this later</p>
              <p class="text-base text-slate-100">
                Don't see the account you want? Add it in <a
                  href="/accounts"
                  class="text-blue-500 hover:text-blue-500 underline underline-offset-2"
                  >Accounts</a
                >. or create it in the dropdown
              </p>
              <div
                class="mb-3 rounded-lg border border-blue-300 bg-blue-50/50 dark:border-blue-300/40 dark:bg-blue-300/5 px-3 py-2 text-sm text-slate-100"
              >
                <p class="leading-relaxed">
                  Debts go in as negative number liabilities. If you owe $3,000
                  on a credit card, enter <AccountLabel
                    account="liabilities:credit-card"
                  /> <code class="font-mono text-blue-400">-5,000</code>.
                </p>
              </div>
              <form
                method="POST"
                action="?/openingBalances"
                use:enhance
                class="space-y-3"
              >
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-base text-slate-100">Date</span>
                  <DatePicker bind:value={obDate} name="date" />
                </div>

                <div
                  class="flex items-center gap-2 mb-1 text-xs font-medium text-slate-400 uppercase tracking-wide"
                >
                  <span class="flex-1">Account</span>
                  <span class="w-40 text-right">Amount</span>
                  <span class="w-11 shrink-0"></span>
                </div>

                {#each rows as row, i}
                  <div class="flex items-center gap-2">
                    <input type="hidden" name="account" value={row.account} />
                    <div class="flex-1">
                      <Combobox
                        items={balanceAccounts}
                        value={row.account}
                        onchange={(val) => {
                          rows[i].account = val;
                        }}
                        inputClass="w-full rounded border border-slate-300 bg-slate-950 px-2.5 pr-8 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-300 font-mono"
                      />
                    </div>
                    <input
                      type="text"
                      name="amount"
                      bind:value={row.amount}
                      class="w-40 rounded border border-slate-300 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-300 font-mono text-right"
                    />
                    <button
                      type="button"
                      onclick={() => removeRow(i)}
                      title="Remove row"
                      class="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-rose-500/30 text-rose-400 transition-colors hover:border-rose-500/60 hover:bg-rose-500/10"
                      ><svg
                        class="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        ><path d="M18 6 6 18M6 6l12 12" /></svg
                      ></button
                    >
                  </div>
                {/each}

                <div class="flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onclick={addRow}
                    class="text-base text-blue-500 hover:text-blue-500 transition-colors"
                    >+ Add row</button
                  >
                </div>

                <div class="flex items-center gap-3 pt-1">
                  <button type="submit" class="btn-primary">
                    Save to journal
                  </button>
                  <button
                    type="button"
                    onclick={() => (showOB = false)}
                    class="btn-cancel">Cancel</button
                  >
                  {#if form?.success}
                    <span class="text-base text-emerald-400">Saved!</span>
                  {/if}
                  {#if form?.error}
                    <span class="text-base text-rose-400">{form.error}</span>
                  {/if}
                </div>

                <p class="text-base text-slate-100 leading-relaxed">
                  This creates a transaction dated <strong
                    class="text-slate-100">{fmtDate(obDate)}</strong
                  >
                  with your account balances balanced against
                  <AccountLabel account="equity:opening balances" />.
                </p>
              </form>
            {/if}
          {/if}
        </div>

        <div
          class="rounded-lg border border-slate-400 bg-slate-900 p-4 space-y-2"
        >
          <p class="text-base text-slate-100 leading-relaxed">
            <strong class="text-slate-100">Add your first transaction</strong> —
            press
            <kbd
              class="mx-0.5 rounded border border-slate-300 bg-slate-900 px-1.5 py-0.5 font-mono text-base text-slate-100"
              >n</kbd
            >
            anywhere or click
            <a
              href="/add"
              class="text-blue-500 hover:text-blue-500 font-semibold underline underline-offset-2"
              >+ Add Transaction</a
            > in the sidebar.
          </p>
        </div>

        <div
          class="rounded-lg border border-slate-400 bg-slate-900 p-4 space-y-2"
        >
          <p class="text-base text-slate-100 leading-relaxed">
            <strong class="text-slate-100">Import bank data</strong> — got a CSV
            from your bank?
          </p>
          <p class="mt-1.5 text-base text-slate-100 leading-relaxed">
            Head to <a
              href="/docs"
              class="text-blue-500 hover:text-blue-500 underline underline-offset-2"
              >Documents</a
            >
            to upload and import it.
          </p>
        </div>

        <div
          class="rounded-lg border border-slate-400 bg-slate-900 p-4 space-y-2"
        >
          <p class="text-base text-slate-100 leading-relaxed">
            <strong class="text-slate-100">Customize your sidebar</strong> — the
            sidebar starts minimal.
          </p>
          <p class="mt-1.5 text-base text-slate-100 leading-relaxed">
            Add pages like Budget, Portfolio, Forecast, and others in
            <a
              href="/settings"
              class="text-blue-500 hover:text-blue-500 underline underline-offset-2"
              >Settings</a
            >.
          </p>
        </div>
      </div>
    {/if}
  </section>

  <!-- How it works -->
  <section>
    <button
      onclick={(e: MouseEvent) =>
        toggleSection("how-it-works", e.currentTarget as HTMLElement)}
      class="w-full flex items-center gap-3 text-left cursor-pointer rounded-lg px-3 py-3 -mx-3 transition-colors hover:bg-slate-800/40"
    >
      <span
        class="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-300/20 text-blue-500 text-base font-bold border border-blue-300/30"
        >2</span
      >
      <div class="flex-1">
        <h2 class="text-base font-semibold text-slate-100">How It Works</h2>
        <p class="text-base text-slate-100">
          The basic ideas behind plain-text accounting
        </p>
      </div>
      <span
        class="text-slate-100 text-xl font-bold transition-transform {expandedSection ===
        'how-it-works'
          ? 'rotate-90'
          : ''}">▸</span
      >
    </button>

    {#if expandedSection === "how-it-works"}
      <div class="mt-4 space-y-6" transition:slide={{ duration: 250 }}>
        <!-- The accounting equation -->
        <div
          class="rounded-lg border border-slate-400 bg-slate-900 p-5 space-y-5"
        >
          <h3 class="text-base font-bold text-slate-100">
            The accounting equation
          </h3>
          <p class="text-base text-slate-100 leading-relaxed">
            Accounting comes down to this equation:
          </p>
          <div
            class="rounded-md border border-blue-300 bg-blue-50/50 dark:border-blue-300/25 dark:bg-blue-300/5 px-4 py-4 text-center"
          >
            <EquationDisplay />
          </div>
          <p class="text-base text-slate-100 leading-relaxed">
            Every transaction keeps this equation balanced. Here's how each
            piece works:
          </p>
          <ul class="space-y-3 text-base text-slate-100 leading-relaxed">
            <li>
              <AccountTypeBadge type="assets" /> — what you have (bank accounts,
              cash, investments)
            </li>
            <li>
              <AccountTypeBadge type="liabilities" /> — what you owe (credit cards,
              loans, mortgage)
            </li>
            <li>
              <AccountTypeBadge type="equity" /> — your starting balances and adjustments
            </li>
            <li>
              <AccountTypeBadge type="income" /> — money coming in (salary, interest)
            </li>
            <li>
              <AccountTypeBadge type="expenses" /> — money going out (groceries,
              rent)
            </li>
          </ul>
        </div>

        <!-- How money moves -->
        <div
          class="rounded-lg border border-slate-400 bg-slate-900 p-5 space-y-4"
        >
          <h3 class="text-base font-bold text-slate-100">How money moves</h3>
          <p class="text-base text-slate-100 leading-relaxed">
            Every transaction touches at least two accounts. One side goes up,
            another adjusts to match — the equation always stays balanced.
          </p>
          <p class="text-base text-slate-100 leading-relaxed">
            <strong class="text-slate-100">Get paid $4,000</strong> — $4,000
            arrives in <AccountTypeBadge type="assets" />, <AccountTypeBadge
              type="income"
            /> records where it came from — still balanced.
          </p>
          <p class="text-base text-slate-100 leading-relaxed">
            <strong class="text-slate-100">Pay your electric bill</strong> — <AccountTypeBadge
              type="assets"
            /> goes down, <AccountTypeBadge type="expenses" /> goes up — both sides
            adjusted, still balanced.
          </p>
          <p class="text-base text-slate-100 leading-relaxed">
            <strong class="text-slate-100">Swipe your credit card</strong> — <AccountTypeBadge
              type="expenses"
            /> goes up, <AccountTypeBadge type="liabilities" /> goes up — you spent
            money you owe, still balanced.
          </p>
          <p class="text-base text-slate-100 leading-relaxed">
            <strong class="text-slate-100">Pay off the card</strong> — <AccountTypeBadge
              type="assets"
            /> goes down, <AccountTypeBadge type="liabilities" /> goes down — still
            balanced.
          </p>
        </div>

        <!-- Accounts have sub-accounts -->
        <div
          class="rounded-lg border border-slate-400 bg-slate-900 p-5 space-y-4"
        >
          <h3 class="text-base font-bold text-slate-100">
            Accounts have sub-accounts
          </h3>
          <p class="text-base text-slate-100 leading-relaxed">
            Accounts are organized in a hierarchy using colons.
          </p>
          <p class="text-base text-slate-100 leading-relaxed">
            For example,
            <span class="font-mono text-base"
              ><AccountTypeBadge type="expenses" /><span class="text-rose-400"
                >:food:groceries</span
              ></span
            >
            is a sub-account of
            <span class="font-mono text-base"
              ><AccountTypeBadge type="expenses" /><span class="text-rose-400"
                >:food</span
              ></span
            >.
          </p>
          <p class="text-base text-slate-100 leading-relaxed">
            And <span class="font-mono text-base"
              ><AccountTypeBadge type="assets" /><span class="text-blue-500"
                >:bank:checking</span
              ></span
            >
            is a sub-account of
            <span class="font-mono text-base"
              ><AccountTypeBadge type="assets" /><span class="text-blue-500"
                >:bank</span
              ></span
            >.
          </p>
          <p class="text-base text-slate-100 leading-relaxed">
            The top-level name determines the type — everything under <AccountTypeBadge
              type="expenses"
            /> is an expense, everything under <AccountTypeBadge
              type="assets"
            /> is an asset. You can nest as deep as you like.
          </p>
        </div>

        <!-- Your journal -->
        <div
          class="rounded-lg border border-slate-400 bg-slate-900 p-5 space-y-4"
        >
          <h3 class="text-base font-bold text-slate-100">Your journal</h3>
          <p class="text-base text-slate-100 leading-relaxed">
            Under the hood, this app is powered by <a
              href="https://hledger.org"
              target="_blank"
              class="text-blue-500 hover:text-blue-500 underline underline-offset-2"
              >hledger</a
            >
            — a plain-text accounting tool. Your transactions live in a simple text
            file called a <strong class="text-slate-100">journal</strong>.
          </p>
          <p class="text-base text-slate-100 leading-relaxed">
            In the journal, each transaction uses <strong class="text-slate-100"
              >signed numbers</strong
            >
            — positive and negative — that add up to zero. You'll notice some account
            types like <AccountTypeBadge type="income" /> and <AccountTypeBadge
              type="liabilities"
            /> show as negative. That can feel odd at first, but that's how the journal
            keeps each transaction balanced.
          </p>
          <p class="text-base text-slate-100 leading-relaxed">
            Don't worry about memorizing the rules — with <a
              href="/settings#learning"
              class="text-blue-500 hover:text-blue-500 underline underline-offset-2"
              >Learning Mode</a
            > on, the transaction details page shows how the equation applies to
            that specific transaction.
          </p>
        </div>

        <!-- Every transaction balances -->
        <div
          class="rounded-lg border border-slate-400 bg-slate-900 p-5 space-y-5"
        >
          <h3 class="text-base font-bold text-slate-100">
            Every transaction balances
          </h3>

          <!-- Electric bill example -->
          <div class="space-y-3">
            <p class="text-base text-slate-100 leading-relaxed font-semibold">
              Pay your $150 electric bill from checking:
            </p>
            <TransactionExample
              title="Electric Bill"
              date="Mar 1"
              postings={[
                {
                  type: "expenses",
                  account: ":housing:electric",
                  amount: "$150.00",
                },
                {
                  type: "assets",
                  account: ":bank:checking",
                  amount: "−$150.00",
                },
              ]}
            />
            <p class="text-base text-slate-100 leading-relaxed">
              $150 went to <AccountTypeBadge type="expenses" /> (positive — it received
              money), $150 left <AccountTypeBadge type="assets" /> (negative — money
              left). They cancel out — balanced.
            </p>
          </div>

          <!-- Paycheck example -->
          <div class="space-y-3">
            <p class="text-base text-slate-100 leading-relaxed font-semibold">
              Get paid $4,000:
            </p>
            <TransactionExample
              title="Paycheck"
              date="Mar 15"
              postings={[
                {
                  type: "assets",
                  account: ":bank:checking",
                  amount: "$4,000.00",
                },
                { type: "income", account: ":salary", amount: "−$4,000.00" },
              ]}
            />
            <p class="text-base text-slate-100 leading-relaxed">
              <strong class="text-slate-100">Why is income negative?</strong>
              It's not just income — <AccountTypeBadge type="liabilities" />, <AccountTypeBadge
                type="equity"
              />, and <AccountTypeBadge type="income" /> are stored as negative numbers
              in the journal. That's how every transaction sums to zero.
            </p>
            <p class="text-base text-slate-100 leading-relaxed">
              Reports flip the signs so they read naturally — your income and
              liabilities will show as positive numbers on the Balance Sheet and
              P&L.
            </p>
          </div>

          <!-- Mortgage payment example -->
          <div class="space-y-3">
            <p class="text-base text-slate-100 leading-relaxed font-semibold">
              Make your $1,802 mortgage payment from checking:
            </p>
            <TransactionExample
              title="Mortgage Payment"
              date="Mar 1"
              postings={[
                {
                  type: "expenses",
                  account: ":mortgage:interest",
                  amount: "$892.00",
                },
                {
                  type: "expenses",
                  account: ":mortgage:escrow",
                  amount: "$362.00",
                },
                {
                  type: "liabilities",
                  account: ":mortgage",
                  amount: "$548.00",
                },
                {
                  type: "assets",
                  account: ":bank:checking",
                  amount: "−$1,802.00",
                },
              ]}
            />
            <p class="text-base text-slate-100 leading-relaxed">
              One payment, four accounts. $892 to interest, $362 to escrow, $548
              paid down the mortgage — and $1,802 left checking. It all sums to
              zero.
            </p>
            <p class="text-base text-slate-100 leading-relaxed">
              Notice <AccountTypeBadge type="liabilities" /> is positive here. This
              is probably the trickiest part. Since liabilities are normally negative,
              adding a positive amount brings the balance closer to zero. You owe
              less.
            </p>
          </div>

          <p class="text-base text-slate-100 leading-relaxed">
            If a transaction doesn't balance, it's rejected — errors get caught
            immediately, not months later.
          </p>

          <details class="rounded-md bg-slate-800/40 text-base text-slate-100">
            <summary
              class="cursor-pointer select-none px-3 py-2 text-slate-100 font-medium hover:text-slate-100 transition-colors"
              >Traditional accounting: debits and credits</summary
            >
            <div class="px-3 pb-3 space-y-3">
              <p class="text-base text-slate-100 leading-relaxed">
                In traditional accounting, positive amounts are called <strong
                  class="text-slate-100">debits</strong
                >
                and negative amounts are
                <strong class="text-slate-100">credits</strong>. Rearrange the
                equation and you can see which accounts live on each side:
              </p>
              <div
                class="rounded-md border border-slate-300/60 bg-white/5 px-3 py-3 text-center"
              >
                <div
                  class="flex items-center justify-center gap-1.5 font-mono text-base font-semibold flex-wrap"
                >
                  <span
                    class="text-base uppercase tracking-wide text-slate-100 font-medium"
                    >Debit</span
                  >
                  <AccountTypeBadge type="assets" />
                  <span class="text-slate-100">+</span>
                  <AccountTypeBadge type="expenses" />
                  <span class="text-slate-100">=</span>
                  <AccountTypeBadge type="liabilities" />
                  <span class="text-slate-100">+</span>
                  <AccountTypeBadge type="equity" />
                  <span class="text-slate-100">+</span>
                  <AccountTypeBadge type="income" />
                  <span
                    class="text-base uppercase tracking-wide text-slate-100 font-medium"
                    >Credit</span
                  >
                </div>
              </div>
              <p class="text-base text-slate-100 leading-relaxed">
                A debit increases left-side accounts (assets, expenses). A
                credit increases right-side accounts (liabilities, equity,
                income). This app uses signed numbers instead — positive and
                negative — which means the same thing without the extra
                vocabulary.
              </p>
            </div>
          </details>
        </div>

        <!-- Reports do the math -->
        <div
          class="rounded-lg border border-slate-400 bg-slate-900 p-5 space-y-4"
        >
          <h3 class="text-base font-bold text-slate-100">
            Reports do the math
          </h3>
          <div class="space-y-3">
            <div
              class="rounded-md border border-slate-300/60 bg-white/5 px-4 py-3.5 text-center"
            >
              <span class="font-mono text-base font-semibold">
                <AccountTypeBadge type="assets" />
                <span class="text-slate-100">−</span>
                <AccountTypeBadge type="liabilities" />
                <span class="text-slate-100">=</span>
                <span class="text-slate-100">Net Worth</span>
              </span>
              <p class="mt-2 text-base text-slate-100">
                <a
                  href="/balancesheet"
                  class="text-blue-500 hover:text-blue-500 underline underline-offset-2"
                  >Balance Sheet</a
                > — your financial snapshot at a point in time
              </p>
            </div>
            <div
              class="rounded-md border border-slate-300/60 bg-white/5 px-4 py-3.5 text-center"
            >
              <span class="font-mono text-base font-semibold">
                <AccountTypeBadge type="income" />
                <span class="text-slate-100">−</span>
                <AccountTypeBadge type="expenses" />
                <span class="text-slate-100">=</span>
                <span class="text-slate-100">Net Income</span>
              </span>
              <p class="mt-2 text-sm text-slate-100">
                <a
                  href="/income"
                  class="text-blue-500 hover:text-blue-500 underline underline-offset-2"
                  >P&L</a
                > — how much you earned vs spent over a period
              </p>
            </div>
            <div
              class="rounded-md border border-slate-300/60 bg-white/5 px-4 py-3.5 text-center"
            >
              <span class="font-mono text-sm font-semibold">
                <span class="text-slate-100">(</span>
                <AccountTypeBadge type="income" />
                <span class="text-slate-100">−</span>
                <AccountTypeBadge type="expenses" />
                <span class="text-slate-100">) ÷</span>
                <AccountTypeBadge type="income" />
                <span class="text-slate-100">=</span>
                <span class="text-slate-100">Savings Rate</span>
              </span>
              <p class="mt-2 text-sm text-slate-100">
                <a
                  href="/dashboard"
                  class="text-blue-500 hover:text-blue-500 underline underline-offset-2"
                  >Dashboard</a
                > — your big picture at a glance
              </p>
            </div>
          </div>
          <p class="text-sm text-slate-100 leading-relaxed">
            All derived from the journal entries.
          </p>
        </div>
      </div>
    {/if}
  </section>

  <!-- Resources -->
  <section>
    <button
      onclick={(e: MouseEvent) =>
        toggleSection("resources", e.currentTarget as HTMLElement)}
      class="w-full flex items-center gap-3 text-left cursor-pointer rounded-lg px-3 py-3 -mx-3 transition-colors hover:bg-slate-800/40"
    >
      <span
        class="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/20 text-amber-300 text-base font-bold border border-amber-500/30"
        >3</span
      >
      <div class="flex-1">
        <h2 class="text-base font-semibold text-slate-100">Learn More</h2>
        <p class="text-base text-slate-100">
          Resources for going deeper with plain-text accounting
        </p>
      </div>
      <span
        class="text-slate-100 text-xl font-bold transition-transform {expandedSection ===
        'resources'
          ? 'rotate-90'
          : ''}">▸</span
      >
    </button>

    {#if expandedSection === "resources"}
      <div class="mt-3 space-y-2" transition:slide={{ duration: 250 }}>
        <p class="text-base text-slate-100 leading-relaxed mb-3">
          Under the hood, this app uses plain text accounting with hledger as
          the source of data. Your transactions live in a simple text file — no
          database, no proprietary format.
        </p>
        {#each [{ title: "hledger docs", url: "https://hledger.org", desc: "Official documentation — command reference, cookbook, and tutorials" }, { title: "Plain Text Accounting", url: "https://plaintextaccounting.org", desc: "Community wiki covering all plain-text accounting tools and workflows" }, { title: "Accounting for Developers", url: "https://hledger.org/accounting-pta.html", desc: "A gentle intro to accounting concepts for people who think in code" }, { title: "hledger fan — tutorials & tips", url: "https://hledger.org/videos.html", desc: "Video walkthroughs and community blog posts" }, { title: "hledger cookbook", url: "https://hledger.org/cookbook.html", desc: "Practical recipes for common personal finance scenarios" }] as link}
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-start gap-3 rounded-lg border border-slate-400 bg-slate-900/60 p-3 hover:border-slate-300 hover:bg-slate-900 transition-colors group"
          >
            <span
              class="mt-0.5 text-slate-100 group-hover:text-blue-500 transition-colors"
              >↗</span
            >
            <div>
              <p
                class="text-base font-medium text-slate-100 group-hover:text-blue-500 transition-colors"
              >
                {link.title}
              </p>
              <p class="text-base text-slate-100">{link.desc}</p>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Quick nav to dashboard -->
  <div class="flex items-center justify-center gap-4 pt-4 pb-2">
    <a
      href="/dashboard"
      class="rounded-md bg-blue-300/10 px-5 py-2.5 text-base font-medium text-blue-500 hover:bg-blue-300/20 transition-colors"
    >
      Go to Dashboard →
    </a>
  </div>

  <!-- Disable hint -->
  <p class="text-center text-base text-slate-100">
    You can disable this page in <a
      href="/settings"
      class="text-slate-100 hover:text-slate-100 underline underline-offset-2"
      >Settings</a
    >.
  </p>
</div>
