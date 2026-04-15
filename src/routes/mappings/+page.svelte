<script lang="ts">
  import { enhance } from "$app/forms";
  import { goto, invalidateAll } from "$app/navigation";
  import {
    DndContext,
    DragOverlay,
    type DragEndEvent,
    type DragStartEvent,
  } from "@dnd-kit-svelte/core";
  import { SortableContext, arrayMove } from "@dnd-kit-svelte/sortable";
  import type { RulesItem } from "$lib/types.js";
  import LearningBanner from "$lib/components/LearningBanner.svelte";
  import RuleSortableItem from "$lib/components/RuleSortableItem.svelte";
  import SectionDropTarget from "$lib/components/SectionDropTarget.svelte";
  import Combobox from "$lib/components/Combobox.svelte";
  import { Popover } from "bits-ui";
  import { page } from "$app/stores";

  const learningEnabled = $derived(
    $page.data.settings?.learning?.enabled ?? false,
  );

  function suggestAccount(description: string): string {
    const lower = description.toLowerCase();
    // User keywords first (higher priority), then built-in
    const allKeywords = [
      ...(_props.data.userKeywords ?? []),
      ...BUILT_IN_KEYWORDS,
    ];
    for (const entry of allKeywords) {
      if (entry.keywords.some((kw: string) => lower.includes(kw)))
        return entry.account;
    }
    return "";
  }

  const BUILT_IN_KEYWORDS = [
    {
      keywords: [
        "restaurant",
        "bistro",
        "grill",
        "diner",
        "izakaya",
        "trattoria",
        "brasserie",
      ],
      account: "expenses:food:dining",
    },
    {
      keywords: [
        "pizza",
        "sushi",
        "taco",
        "burger",
        "ramen",
        "pho",
        "bbq",
        "wok",
        "noodle",
      ],
      account: "expenses:food:dining",
    },
    {
      keywords: [
        "chipotle",
        "mcdonalds",
        "wendys",
        "chick-fil-a",
        "subway",
        "panera",
        "panda express",
      ],
      account: "expenses:food:dining",
    },
    {
      keywords: ["doordash", "grubhub", "ubereats", "postmates", "seamless"],
      account: "expenses:food:dining",
    },
    {
      keywords: ["bar", "pub", "brewery", "tavern", "taproom", "winery"],
      account: "expenses:food:dining",
    },
    {
      keywords: ["bakery", "deli", "bagel", "smoothie", "juice"],
      account: "expenses:food:dining",
    },
    {
      keywords: [
        "starbucks",
        "dunkin",
        "cafe",
        "coffee",
        "peets",
        "tim hortons",
      ],
      account: "expenses:food:coffee",
    },
    {
      keywords: ["grocery", "grocer", "supermarket"],
      account: "expenses:food:groceries",
    },
    {
      keywords: [
        "whole foods",
        "trader joe",
        "kroger",
        "safeway",
        "aldi",
        "publix",
        "wegmans",
        "heb",
      ],
      account: "expenses:food:groceries",
    },
    {
      keywords: ["costco", "sam's club", "bj's"],
      account: "expenses:food:groceries",
    },
    {
      keywords: [
        "amazon",
        "target",
        "walmart",
        "bestbuy",
        "best buy",
        "ikea",
        "home depot",
        "lowes",
      ],
      account: "expenses:shopping",
    },
    {
      keywords: ["store", "shop", "mall", "outlet", "marketplace", "hilldale"],
      account: "expenses:shopping",
    },
    {
      keywords: ["ebay", "etsy", "wayfair", "overstock"],
      account: "expenses:shopping",
    },
    {
      keywords: [
        "netflix",
        "spotify",
        "hulu",
        "disney",
        "hbo",
        "peacock",
        "paramount",
        "youtube",
      ],
      account: "expenses:entertainment:streaming",
    },
    {
      keywords: ["apple", "itunes", "app store", "google play"],
      account: "expenses:entertainment:subscriptions",
    },
    {
      keywords: ["cinema", "theater", "theatre", "movie", "amc", "regal"],
      account: "expenses:entertainment",
    },
    {
      keywords: [
        "ticketmaster",
        "stubhub",
        "eventbrite",
        "livenation",
        "concert",
        "ticket",
      ],
      account: "expenses:entertainment",
    },
    {
      keywords: ["xbox", "playstation", "steam", "nintendo"],
      account: "expenses:entertainment",
    },
    {
      keywords: [
        "shell",
        "exxon",
        "chevron",
        "bp",
        "mobil",
        "sunoco",
        "gas station",
        "fuel",
      ],
      account: "expenses:transportation:gas",
    },
    {
      keywords: ["uber", "lyft", "taxi", "cab", "rideshare"],
      account: "expenses:transportation",
    },
    {
      keywords: ["parking", "parkwhiz", "spothero"],
      account: "expenses:transportation:parking",
    },
    {
      keywords: ["toll", "ezpass", "fastrak"],
      account: "expenses:transportation:tolls",
    },
    {
      keywords: [
        "airline",
        "flight",
        "delta",
        "united",
        "southwest",
        "american air",
        "jetblue",
        "frontier",
        "spirit",
      ],
      account: "expenses:travel:flights",
    },
    {
      keywords: [
        "hotel",
        "airbnb",
        "vrbo",
        "marriott",
        "hilton",
        "hyatt",
        "motel",
      ],
      account: "expenses:travel:lodging",
    },
    {
      keywords: ["pharmacy", "cvs", "walgreens", "rite aid", "prescription"],
      account: "expenses:health",
    },
    {
      keywords: [
        "doctor",
        "hospital",
        "clinic",
        "medical",
        "urgent care",
        "lab",
        "quest diagnostics",
      ],
      account: "expenses:health",
    },
    {
      keywords: ["dental", "dentist", "orthodontist"],
      account: "expenses:health:dental",
    },
    {
      keywords: ["vision", "optometrist", "eye", "lenscrafters"],
      account: "expenses:health:vision",
    },
    {
      keywords: [
        "electric",
        "power",
        "energy",
        "pge",
        "duke energy",
        "con edison",
      ],
      account: "expenses:housing:utilities",
    },
    {
      keywords: ["water", "sewer", "garbage", "waste", "trash"],
      account: "expenses:housing:utilities",
    },
    {
      keywords: [
        "comcast",
        "xfinity",
        "spectrum",
        "att",
        "verizon fios",
        "internet",
      ],
      account: "expenses:housing:utilities",
    },
    {
      keywords: ["rent", "landlord", "lease"],
      account: "expenses:housing:rent",
    },
    { keywords: ["mortgage"], account: "expenses:housing:mortgage" },
    {
      keywords: [
        "insurance",
        "geico",
        "progressive",
        "state farm",
        "allstate",
        "usaa",
      ],
      account: "expenses:insurance",
    },
    {
      keywords: [
        "t-mobile",
        "tmobile",
        "verizon wireless",
        "att wireless",
        "mint mobile",
        "visible",
      ],
      account: "expenses:phone",
    },
    {
      keywords: [
        "gym",
        "fitness",
        "planet fitness",
        "equinox",
        "orangetheory",
        "crossfit",
        "ymca",
        "peloton",
      ],
      account: "expenses:fitness",
    },
    {
      keywords: [
        "tuition",
        "school",
        "university",
        "college",
        "udemy",
        "coursera",
        "skillshare",
      ],
      account: "expenses:education",
    },
    {
      keywords: ["book", "kindle", "audible"],
      account: "expenses:education:books",
    },
    {
      keywords: ["vet", "veterinary", "petco", "petsmart", "chewy"],
      account: "expenses:pets",
    },
    {
      keywords: ["haircut", "salon", "barber", "spa", "massage", "nail"],
      account: "expenses:personal-care",
    },
    {
      keywords: ["dry clean", "laundry", "cleaners"],
      account: "expenses:personal-care",
    },
    {
      keywords: ["donation", "charity", "nonprofit", "gofundme", "patreon"],
      account: "expenses:charity",
    },
    {
      keywords: ["gift", "present", "flowers", "hallmark"],
      account: "expenses:gifts",
    },
  ];

  const _props = $props<{ data: any; form: any }>();
  const data = $derived(_props.data);
  const form = $derived(_props.form);

  let baseHeader = $state("");
  let items = $state<RulesItem[]>([]);
  $effect(() => {
    baseHeader = _props.data.parsed.header;
    items = structuredClone(_props.data.parsed.items);
  });
  let dirty = $state(false);
  let saving = $state(false);
  let uid = 0;
  let showRaw = $state(false);
  let rawError = $state("");
  let detecting = $state(false);
  let detectError = $state("");
  let creatingFile = $state(false);
  let newFileName = $state("");
  let createError = $state("");
  let renamingFile = $state<string | null>(null);
  let renameInput = $state("");
  let renameError = $state("");
  let csvFileInput = $state<HTMLInputElement | null>(null);
  let csvFileSelected = $state("");

  // Parse editable directive fields from header
  function parseDirective(header: string, key: string): string {
    const m = header.match(new RegExp(`^${key}\\s+(.+)`, "m"));
    return m ? m[1].trim() : "";
  }

  function buildHeader(
    original: string,
    directives: Record<string, string>,
  ): string {
    let h = original;
    for (const [key, value] of Object.entries(directives)) {
      if (!value) continue;
      const re = new RegExp(`^(${key.replace(/[-]/g, "\\$&")}\\s+).+`, "m");
      if (re.test(h)) {
        // Replace existing directive
        h = h.replace(re, (_, prefix) => `${prefix}${value}`);
      } else if (parseDirective(original, key) === "" && value) {
        // Add new directive that wasn't in the original
        h = h.trimEnd() + `\n${key} ${value}`;
      }
    }
    return h;
  }

  // Dynamically find all accountN/amountN directives beyond 1 and 2
  function parseExtraPostings(
    header: string,
  ): { n: number; account: string; amount: string }[] {
    const result: { n: number; account: string; amount: string }[] = [];
    for (let n = 3; n <= 9; n++) {
      const acc = parseDirective(header, `account${n}`);
      const amt = parseDirective(header, `amount${n}`);
      if (acc || amt) result.push({ n, account: acc, amount: amt });
    }
    return result;
  }

  const OPTIONAL_DIRECTIVES = [
    {
      key: "decimal-mark",
      label: "Decimal mark",
      help: "Decimal point character (. or ,). Use , for European-style CSVs.",
    },
    {
      key: "separator",
      label: "Separator",
      help: "CSV field separator character. Default is comma; use \\t for TSV.",
    },
    {
      key: "encoding",
      label: "Encoding",
      help: "File encoding of the CSV, e.g. utf-8 or latin1.",
    },
    {
      key: "timezone",
      label: "Timezone",
      help: "Timezone for interpreting dates, e.g. America/New_York.",
    },
    {
      key: "newest-first",
      label: "Newest first",
      help: "Set to true if the CSV lists newest transactions at the top.",
    },
    {
      key: "intra-day-reversed",
      label: "Intra-day reversed",
      help: "Set to true to reverse the order of transactions sharing the same date.",
    },
    {
      key: "balance-type",
      label: "Balance type",
      help: "Balance assertion style to generate: =, ==, =*, or ==*.",
    },
    {
      key: "source",
      label: "Source",
      help: "Override the source account (account1) for all transactions.",
    },
    {
      key: "archive",
      label: "Archive",
      help: "Filesystem path to move the CSV to after a successful import.",
    },
  ] as const;

  function parseExtraDirectives(
    header: string,
  ): { key: string; value: string }[] {
    return OPTIONAL_DIRECTIVES.map((d) => ({
      key: d.key,
      value: parseDirective(header, d.key),
    })).filter((d) => d.value !== "");
  }

  let skip = $state("");
  let fields = $state("");
  let dateFormat = $state("");
  let currency = $state("");
  let account1 = $state("");
  let defaultAccount2 = $state("");
  let description = $state("");
  let extraPostings = $state<{ n: number; account: string; amount: string }[]>(
    [],
  );
  let extraDirectives = $state<{ key: string; value: string }[]>([]);
  $effect(() => {
    const h = _props.data.parsed.header;
    skip = parseDirective(h, "skip");
    fields = parseDirective(h, "fields");
    dateFormat = parseDirective(h, "date-format");
    currency = parseDirective(h, "currency");
    account1 = parseDirective(h, "account1");
    defaultAccount2 = parseDirective(h, "account2");
    description = parseDirective(h, "description");
    extraPostings = parseExtraPostings(h);
    extraDirectives = parseExtraDirectives(h);
  });

  const availableDirectives = $derived(
    OPTIONAL_DIRECTIVES.filter(
      (d) => !extraDirectives.some((e) => e.key === d.key),
    ),
  );

  function addExtraPosting() {
    const nums = extraPostings.map((p) => p.n);
    const next = nums.length ? Math.max(...nums) + 1 : 3;
    if (next > 9) return;
    extraPostings = [...extraPostings, { n: next, account: "", amount: "" }];
    mark();
  }

  function removeExtraPosting(idx: number) {
    const p = extraPostings[idx];
    const re = new RegExp(`^(account|amount)${p.n}\\s+.+\n?`, "gm");
    baseHeader = baseHeader.replace(re, "");
    extraPostings = extraPostings.filter((_, i) => i !== idx);
    mark();
  }

  function removeExtraDirective(idx: number) {
    const key = extraDirectives[idx].key;
    const re = new RegExp(`^${key.replace(/[-]/g, "\\$&")}\\s+.+\n?`, "m");
    baseHeader = baseHeader.replace(re, "");
    extraDirectives = extraDirectives.filter((_, i) => i !== idx);
    mark();
  }

  const currentHeader = $derived(
    buildHeader(baseHeader, {
      skip,
      fields,
      "date-format": dateFormat,
      currency,
      description,
      account1,
      account2: defaultAccount2,
      ...Object.fromEntries(
        extraPostings.flatMap((p) => [
          [`account${p.n}`, p.account],
          [`amount${p.n}`, p.amount],
        ]),
      ),
      ...Object.fromEntries(extraDirectives.map((d) => [d.key, d.value])),
    }),
  );

  // Client-side serialize to keep raw text in sync with visual state
  function serializeRules(header: string, ruleItems: RulesItem[]): string {
    const out: string[] = [header.trimEnd(), ""];
    for (const item of ruleItems) {
      if (item.type === "section") {
        out.push(`; === ${item.label} ===`);
      } else if (item.type === "include") {
        out.push(`include ${item.path}`);
      } else if (item.type === "raw") {
        out.push(item.content);
      } else {
        out.push(`if ${item.patterns}`);
        if (item.assignments && item.assignments.length > 0) {
          for (const a of item.assignments) {
            out.push(` ${a.key} ${a.value}`);
          }
        } else if (item.account) {
          out.push(` account2 ${item.account}`);
        }
        out.push("");
      }
    }
    return (
      out
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trimEnd() + "\n"
    );
  }

  // Client-side parse to sync raw text edits back to visual state
  const HEADER_KEYS = new Set([
    "skip",
    "fields",
    "date-format",
    "currency",
    "decimal-mark",
    "separator",
    "encoding",
    "timezone",
    "newest-first",
    "intra-day-reversed",
    "balance-type",
    "source",
    "archive",
    "description",
  ]);
  function isHeaderDirective(line: string): boolean {
    const key = line.split(/\s+/)[0];
    return (
      HEADER_KEYS.has(key) ||
      /^account\d+$/.test(key) ||
      /^amount\d+$/.test(key)
    );
  }
  function parseRulesClient(content: string): {
    header: string;
    items: RulesItem[];
  } {
    const lines = content.split("\n");
    const headerLines: string[] = [];
    const ruleItems: RulesItem[] = [];
    let inHeader = true;
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (inHeader) {
        if (line.startsWith("if ") || line.startsWith("include ")) {
          inHeader = false;
          continue;
        }
        headerLines.push(line);
        i++;
        continue;
      }
      if (isHeaderDirective(line)) {
        headerLines.push(line);
        i++;
        continue;
      }
      if (line.startsWith("if ")) {
        const patterns = line.slice(3).trim();
        let account = "";
        const assignments: { key: string; value: string }[] = [];
        let j = i + 1;
        while (j < lines.length && /^\s+\S/.test(lines[j])) {
          const t = lines[j].trim();
          const sp = t.indexOf(" ");
          if (sp > 0) {
            const key = t.slice(0, sp);
            const val = t.slice(sp + 1).trim();
            assignments.push({ key, value: val });
            if (/^account\d*$/.test(key) && !account) account = val;
          }
          j++;
        }
        ruleItems.push({
          type: "rule",
          id: `r${i}`,
          patterns,
          account,
          assignments,
        });
        i = j;
      } else if (line.startsWith("include ")) {
        ruleItems.push({
          type: "include",
          id: `inc-${i}`,
          path: line.slice(8).trim(),
        });
        i++;
      } else if (/^; ===/.test(line)) {
        const label = line
          .replace(/^;\s*=+\s*/, "")
          .replace(/\s*=+\s*$/, "")
          .trim();
        if (label) ruleItems.push({ type: "section", id: `sec-${i}`, label });
        i++;
      } else {
        ruleItems.push({ type: "raw", id: `raw-${i}`, content: line });
        i++;
      }
    }
    return { header: headerLines.join("\n"), items: ruleItems };
  }

  function applyRawEdit(raw: string) {
    const parsed = parseRulesClient(raw);
    items = parsed.items;
    skip = parseDirective(parsed.header, "skip");
    fields = parseDirective(parsed.header, "fields");
    dateFormat = parseDirective(parsed.header, "date-format");
    currency = parseDirective(parsed.header, "currency");
    account1 = parseDirective(parsed.header, "account1");
    defaultAccount2 = parseDirective(parsed.header, "account2");
    description = parseDirective(parsed.header, "description");
    extraPostings = parseExtraPostings(parsed.header);
    extraDirectives = parseExtraDirectives(parsed.header);
    baseHeader = parsed.header;
    mark();
  }

  // Raw text syncs with visual state, but not while user is typing
  let rawTextLocal = $state("");
  let rawFocused = $state(false);
  $effect(() => {
    const text = serializeRules(currentHeader, items);
    if (!rawFocused) rawTextLocal = text;
  });

  $effect(() => {
    items = structuredClone(data.parsed.items);
    baseHeader = data.parsed.header;
    skip = parseDirective(data.parsed.header, "skip");
    fields = parseDirective(data.parsed.header, "fields");
    dateFormat = parseDirective(data.parsed.header, "date-format");
    currency = parseDirective(data.parsed.header, "currency");
    account1 = parseDirective(data.parsed.header, "account1");
    defaultAccount2 = parseDirective(data.parsed.header, "account2");
    description = parseDirective(data.parsed.header, "description");
    extraPostings = parseExtraPostings(data.parsed.header);
    extraDirectives = parseExtraDirectives(data.parsed.header);
    rawError = "";
    dirty = false;
  });

  function mark() {
    dirty = true;
  }

  let pendingAccounts = $state<Set<string>>(new Set());
  const allAccountsWithPending = $derived(
    [...new Set([...(data.accounts as string[]), ...pendingAccounts])].sort(),
  );

  function trackAccount(name: string) {
    pendingAccounts = new Set([...pendingAccounts, name]);
  }

  async function persistPendingAccounts() {
    for (const name of pendingAccounts) {
      if (!(data.accounts as string[]).includes(name)) {
        await fetch("/api/accounts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        });
      }
    }
    pendingAccounts = new Set();
  }

  function addRule() {
    items = [
      ...items,
      {
        type: "rule",
        id: `new-${uid++}`,
        patterns: "",
        account: "",
        assignments: [{ key: "account2", value: "" }],
      },
    ];
    mark();
  }

  function removeRule(id: string) {
    items = items.filter((x) => !(x.type === "rule" && x.id === id));
    mark();
  }

  // Drag-and-drop state
  let activeDragId = $state<string | null>(null);
  const activeDragItem = $derived(
    activeDragId
      ? (items.find((x) => x.type === "rule" && x.id === activeDragId) as
          | (RulesItem & { type: "rule" })
          | undefined)
      : undefined,
  );

  function onDragStart(event: DragStartEvent) {
    activeDragId = event.active.id as string;
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    activeDragId = null;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((x) => x.id === active.id);
    const newIndex = items.findIndex((x) => x.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    items = arrayMove(items, oldIndex, newIndex);
    mark();
  }

  function updateRule(
    id: string,
    field: "patterns" | "account",
    value: string,
  ) {
    items = items.map((x) => {
      if (x.type !== "rule" || x.id !== id) return x;
      const updated = { ...x, [field]: value };
      // Keep assignments in sync with account
      if (field === "account") {
        const assigns = [...(updated.assignments ?? [])];
        const idx = assigns.findIndex((a) => a.key === "account2");
        if (idx >= 0) assigns[idx] = { ...assigns[idx], value };
        else assigns.unshift({ key: "account2", value });
        updated.assignments = assigns;
      }
      return updated;
    });
    mark();
  }

  function updateAssignment(
    ruleId: string,
    assignIdx: number,
    field: "key" | "value",
    val: string,
  ) {
    items = items.map((x) => {
      if (x.type !== "rule" || x.id !== ruleId) return x;
      const assigns = [...(x.assignments ?? [])];
      assigns[assignIdx] = { ...assigns[assignIdx], [field]: val };
      // Keep account in sync
      const acc2 = assigns.find((a) => a.key === "account2");
      return { ...x, assignments: assigns, account: acc2?.value ?? x.account };
    });
    mark();
  }

  function addAssignment(ruleId: string) {
    items = items.map((x) => {
      if (x.type !== "rule" || x.id !== ruleId) return x;
      const assigns = [...(x.assignments ?? [])];
      // Find next account number
      const nums = assigns.map((a) => {
        const m = a.key.match(/^account(\d+)$/);
        return m ? +m[1] : 0;
      });
      const next = Math.max(2, ...nums) + 1;
      assigns.push({ key: `account${next}`, value: "" });
      return { ...x, assignments: assigns };
    });
    mark();
  }

  function removeAssignment(ruleId: string, assignIdx: number) {
    items = items.map((x) => {
      if (x.type !== "rule" || x.id !== ruleId) return x;
      const assigns = (x.assignments ?? []).filter((_, i) => i !== assignIdx);
      const acc2 = assigns.find((a) => a.key === "account2");
      return { ...x, assignments: assigns, account: acc2?.value ?? "" };
    });
    mark();
  }

  // All non-raw items participate in sorting so rules can be dragged across sections
  const sortableIds = $derived(
    items.filter((x) => x.type !== "raw").map((x) => x.id),
  );

  const allAccounts = $derived(allAccountsWithPending);

  function saveEnhance() {
    saving = true;
    persistPendingAccounts();
    return async ({ result, update }: any) => {
      saving = false;
      if (result.type === "success") {
        dirty = false;
        await update();
      }
    };
  }

  function createEnhance() {
    return async ({ result, update }: any) => {
      if (result.type === "success" && result.data?.created) {
        creatingFile = false;
        newFileName = "";
        createError = "";
        await update();
        goto(`/mappings?file=${encodeURIComponent(result.data.created)}`);
      } else if (result.type === "failure") {
        createError = result.data?.createError ?? "Create failed";
      }
    };
  }

  function createFromCsvEnhance() {
    return async ({ result, update }: any) => {
      if (result.type === "success" && result.data?.createdFromCsv) {
        csvFileSelected = "";
        await update();
        goto(
          `/mappings?file=${encodeURIComponent(result.data.createdFromCsv)}`,
        );
      } else if (result.type === "failure") {
        createError = result.data?.createCsvError ?? "Create failed";
      }
    };
  }

  function renameEnhance(oldName: string) {
    return async ({ result, update }: any) => {
      if (result.type === "success" && result.data?.renamed) {
        renamingFile = null;
        renameInput = "";
        renameError = "";
        await update();
        goto(`/mappings?file=${encodeURIComponent(result.data.renamed)}`);
      } else if (result.type === "failure") {
        renameError = result.data?.renameError ?? "Rename failed";
      }
    };
  }
</script>

<LearningBanner id="mappings" title="Auto-sorting imports">
  Import mappings automatically sort your transactions into the right
  categories. For example: "anything with WHOLE FOODS in the description goes to
  expenses:food:groceries." The more mappings you add, the less manual sorting
  you'll need to do after each import.
</LearningBanner>

<div class="space-y-5">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <h1 class="text-lg font-semibold text-slate-100">Import Mappings</h1>
    <div class="flex items-center gap-3">
      {#if dirty}
        <span class="text-sm text-amber-400">Unsaved changes</span>
        <button
          type="button"
          onclick={() =>
            document
              .querySelector<HTMLFormElement>("#mappingsForm")
              ?.requestSubmit()}
          disabled={saving}
          class="rounded-md bg-blue-300/10 px-3 py-1 text-sm font-medium text-blue-500 transition-colors hover:bg-blue-300/20 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      {:else if form?.saved}
        <span class="text-sm text-emerald-400">Saved</span>
      {/if}
      {#if form?.error}
        <span class="text-sm text-rose-400">{form.error}</span>
      {/if}
      {#if data.active}
        <button
          type="button"
          onclick={() => (showRaw = !showRaw)}
          class="rounded-md px-2.5 py-1 text-sm font-medium transition-colors
            {showRaw
            ? 'bg-slate-700 text-slate-100'
            : 'text-slate-100 hover:bg-slate-800 hover:text-slate-100'}"
        >
          {showRaw ? "Hide plain text" : "Show plain text"}
        </button>
      {/if}
    </div>
  </div>

  <!-- File tabs -->
  <div class="flex flex-wrap items-center gap-1">
    {#each data.rulesFiles as file}
      {#if renamingFile === file}
        <form
          method="POST"
          action="?/rename"
          use:enhance={renameEnhance(file)}
          class="flex items-center gap-1"
        >
          <input type="hidden" name="oldName" value={file} />
          <input
            type="text"
            name="newName"
            bind:value={renameInput}
            onkeydown={(e) => {
              if (e.key === "Escape") {
                renamingFile = null;
                renameInput = "";
                renameError = "";
              }
            }}
            class="rounded-md border border-slate-400 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-blue-300 w-36"
          />
          <span class="text-xs text-slate-400">.rules</span>
          <button
            type="submit"
            class="rounded-md bg-blue-300/10 px-2 py-1 text-xs text-blue-500 hover:bg-blue-300/20"
            >Save</button
          >
          <button
            type="button"
            onclick={() => {
              renamingFile = null;
              renameInput = "";
              renameError = "";
            }}
            class="text-slate-400 hover:text-slate-200 text-xs px-1">✕</button
          >
        </form>
        {#if renameError}
          <span class="text-xs text-rose-400">{renameError}</span>
        {/if}
      {:else}
        <a
          href="/mappings?file={encodeURIComponent(file)}"
          class="group rounded-md px-3 py-1.5 text-sm font-medium transition-colors
            {data.active === file
            ? 'bg-slate-800 text-slate-100'
            : 'text-slate-100 hover:bg-slate-800/50 hover:text-slate-100'}"
        >
          {file}
          <button
            type="button"
            onclick={() => {
              renamingFile = file;
              renameInput = file.replace(/\.rules$/, "");
              renameError = "";
            }}
            class="ml-1 inline-block text-slate-500 hover:text-slate-200 transition-colors"
            title="Rename">✎</button
          >
        </a>
      {/if}
    {/each}

    {#if creatingFile}
      <form
        method="POST"
        action="?/create"
        use:enhance={createEnhance}
        class="flex items-center gap-1"
      >
        <input
          type="text"
          name="name"
          bind:value={newFileName}
          placeholder="filename"
          autofocus
          onkeydown={(e) => {
            if (e.key === "Escape") {
              creatingFile = false;
              newFileName = "";
              createError = "";
            }
          }}
          class="rounded-md border border-slate-400 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-blue-300 w-36"
        />
        <span class="text-xs text-slate-400">.rules</span>
        <button
          type="submit"
          class="rounded-md bg-blue-300/10 px-2 py-1 text-xs text-blue-500 hover:bg-blue-300/20"
          >Create</button
        >
        <button
          type="button"
          onclick={() => {
            creatingFile = false;
            newFileName = "";
            createError = "";
          }}
          class="text-slate-400 hover:text-slate-200 text-xs px-1">✕</button
        >
      </form>
      {#if createError}
        <span class="text-xs text-rose-400">{createError}</span>
      {/if}
    {:else}
      <button
        type="button"
        onclick={() => {
          creatingFile = true;
        }}
        class="rounded-md border border-dashed border-slate-500 px-2.5 py-1 text-xs text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-200"
      >
        + New file
      </button>
      <label
        class="rounded-md border border-dashed border-slate-500 px-2.5 py-1 text-xs text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-200 cursor-pointer"
      >
        + From CSV
        <input
          type="file"
          accept=".csv"
          bind:this={csvFileInput}
          onchange={async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            csvFileSelected = file.name;
            const fd = new FormData();
            fd.set("csvFile", file);
            const res = await fetch("?/createFromCsv", {
              method: "POST",
              body: fd,
            });
            const json = await res.json();
            // SvelteKit form action responses nest data as a stringified array:
            // [{createdFromCsv: 1}, "actual-filename.rules"]
            let createdFromCsv: string | undefined;
            if (json?.data) {
              try {
                const parsed =
                  typeof json.data === "string"
                    ? JSON.parse(json.data)
                    : json.data;
                if (Array.isArray(parsed) && parsed[0]?.createdFromCsv) {
                  createdFromCsv = parsed[1];
                } else if (parsed?.createdFromCsv) {
                  createdFromCsv = parsed.createdFromCsv;
                }
              } catch {
                // Fallback
              }
            }
            if (createdFromCsv) {
              csvFileSelected = "";
              await invalidateAll();
              goto(`/mappings?file=${encodeURIComponent(createdFromCsv)}`);
            } else {
              createError = "Create failed";
            }
            // Reset input so same file can be re-selected
            if (csvFileInput) csvFileInput.value = "";
          }}
          class="sr-only"
        />
      </label>
    {/if}
  </div>

  {#if data.active && showRaw}
    <div class="space-y-3">
      <textarea
        bind:value={rawTextLocal}
        oninput={(e) => applyRawEdit((e.target as HTMLTextAreaElement).value)}
        onfocus={() => (rawFocused = true)}
        onblur={() => {
          rawFocused = false;
          rawTextLocal = serializeRules(currentHeader, items);
        }}
        spellcheck="false"
        rows="20"
        class="w-full rounded-lg border border-slate-300 bg-slate-900 p-4 font-mono text-sm leading-relaxed text-slate-100 outline-none focus:border-blue-300 resize-y"
      ></textarea>
      {#if rawError}
        <p class="text-sm text-rose-400">{rawError}</p>
      {/if}
    </div>
  {/if}

  {#if data.active}
    <!-- Editable directives -->
    {#if data.parsed.header.trim() || data.csvDefaults}
      <div
        class="overflow-hidden rounded-lg border border-slate-400 bg-slate-900"
      >
        <div
          class="border-b border-slate-400 px-4 py-2 flex items-center justify-between gap-3"
        >
          <span class="text-xs font-semibold tracking-wide text-slate-100"
            >Directives</span
          >
          {#if data.csvFiles.length > 0}
            <div class="flex items-center gap-2">
              {#if detectError}
                <span class="text-xs text-rose-400">{detectError}</span>
              {/if}
              <select
                id="detectCsv"
                class="rounded-md border border-slate-300 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none focus:border-blue-300"
                onchange={async (e) => {
                  const csvFile = (e.target as HTMLSelectElement).value;
                  if (!csvFile) return;
                  detecting = true;
                  detectError = "";
                  const fd = new FormData();
                  fd.set("csvFile", csvFile);
                  const res = await fetch("?/detect", {
                    method: "POST",
                    body: fd,
                  });
                  detecting = false;
                  const json = await res.json();
                  const resData = json?.data ? JSON.parse(json.data) : null;
                  if (resData?.detectError) {
                    detectError = resData.detectError;
                    return;
                  }
                  const d = resData?.detected;
                  if (!d) {
                    detectError = "No results";
                    return;
                  }
                  // Additive: only fill empty directives
                  if (!skip && d.skip) {
                    skip = d.skip;
                    mark();
                  }
                  if (!fields && d.fields) {
                    fields = d.fields;
                    mark();
                  }
                  if (!dateFormat && d.dateFormat) {
                    dateFormat = d.dateFormat;
                    mark();
                  }
                  if (!currency && d.currency) {
                    currency = d.currency;
                    mark();
                  }
                  if (!defaultAccount2 && d.account2) {
                    defaultAccount2 = d.account2;
                    mark();
                  }
                  // Add mappings for new descriptions
                  if (d.descriptions?.length) {
                    const existingPatterns = new Set(
                      items
                        .filter((x) => x.type === "rule")
                        .map((x) => x.patterns?.toUpperCase()),
                    );
                    for (const desc of d.descriptions) {
                      if (!existingPatterns.has(desc.toUpperCase())) {
                        const suggested =
                          suggestAccount(desc) ||
                          defaultAccount2 ||
                          "expenses:unknown";
                        items = [
                          ...items,
                          {
                            type: "rule",
                            id: `detect-${uid++}`,
                            patterns: desc,
                            account: suggested,
                            assignments: [
                              { key: "account2", value: suggested },
                            ],
                          },
                        ];
                      }
                    }
                    mark();
                  }
                  // Reset picker
                  (e.target as HTMLSelectElement).value = "";
                }}
              >
                <option value=""
                  >{detecting ? "Detecting…" : "Detect from CSV…"}</option
                >
                {#each data.csvFiles as file}
                  <option value={file}>{file}</option>
                {/each}
              </select>
            </div>
          {/if}
        </div>
        <div class="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-3">
          {#each [["skip", "Skip rows", skip, (v: string) => {
                skip = v;
                mark();
              }, "Number of header rows to skip at the top of the CSV. Most bank exports have 1 header row."], ["fields", "Fields", fields, (v: string) => {
                fields = v;
                mark();
              }, "Maps CSV columns to transaction fields — order matters, it must match the column order in your CSV. Common fields: date, description, amount, amount-in, amount-out, balance. Use a blank name to skip a column."], ["date-format", "Date format", dateFormat, (v: string) => {
                dateFormat = v;
                mark();
              }, "How dates appear in this CSV. Examples: %m/%d/%Y (12/31/2025), %Y-%m-%d (2025-12-31), %d/%m/%Y (31/12/2025)."], ["currency", "Currency", currency, (v: string) => {
                currency = v;
                mark();
              }, "Currency symbol to prepend to amounts, e.g. $ or £ or EUR."], ["description", "Description", description, (v: string) => {
                description = v;
                mark();
              }, "Static description applied to all imported transactions from this CSV."]] as [key, label, value, setter, help]}
            {#if value !== undefined && value !== ""}
              <div class="flex items-center gap-3">
                <div class="w-28 shrink-0 flex items-center gap-1.5">
                  <span class="text-xs text-slate-100">{label}</span>
                  {#if learningEnabled && help}
                    <Popover.Root>
                      <Popover.Trigger
                        class="text-slate-100 hover:text-slate-100 transition-colors"
                      >
                        <svg
                          class="h-3.5 w-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          ><circle cx="12" cy="12" r="10" /><path
                            d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"
                          /><path d="M12 17h.01" /></svg
                        >
                      </Popover.Trigger>
                      <Popover.Portal>
                        <Popover.Content
                          side="top"
                          sideOffset={6}
                          class="z-50 max-w-xs rounded-lg border border-blue-300/20 bg-blue-300/5 px-3 py-2 text-sm leading-relaxed text-blue-500 shadow-xl backdrop-blur-sm"
                          >{help}</Popover.Content
                        >
                      </Popover.Portal>
                    </Popover.Root>
                  {/if}
                </div>
                <input
                  type="text"
                  value={value as string}
                  oninput={(e) =>
                    (setter as any)((e.target as HTMLInputElement).value)}
                  class="flex-1 rounded-md border border-slate-300 bg-slate-900 px-2 py-1 font-mono text-sm text-slate-100 outline-none focus:border-blue-300"
                />
              </div>
            {/if}
          {/each}
          {#if account1}
            <div class="flex items-center gap-3">
              <div class="w-28 shrink-0 flex items-center gap-1.5">
                <span class="text-xs text-slate-100">Account 1</span>
                {#if learningEnabled}
                  <Popover.Root>
                    <Popover.Trigger
                      class="text-slate-100 hover:text-slate-100 transition-colors"
                    >
                      <svg
                        class="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        ><circle cx="12" cy="12" r="10" /><path
                          d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"
                        /><path d="M12 17h.01" /></svg
                      >
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content
                        side="top"
                        sideOffset={6}
                        class="z-50 max-w-xs rounded-lg border border-blue-300/20 bg-blue-300/5 px-3 py-2 text-sm leading-relaxed text-blue-500 shadow-xl backdrop-blur-sm"
                        >The first posting's account — usually the bank or
                        credit card this CSV belongs to, e.g. assets:checking or
                        liabilities:visa.</Popover.Content
                      >
                    </Popover.Portal>
                  </Popover.Root>
                {/if}
              </div>
              <div class="flex-1">
                <Combobox
                  items={data.accounts}
                  value={account1}
                  onchange={(v) => {
                    account1 = v;
                    mark();
                  }}
                  oncreate={trackAccount}
                  placeholder="assets:checking"
                  inputClass="w-full border border-slate-300 rounded-md bg-slate-900 px-2 py-1 pr-6 font-mono text-sm text-slate-100 placeholder:text-slate-100 focus:border-blue-300 outline-none"
                />
              </div>
            </div>
          {/if}
          {#if defaultAccount2}
            <div class="flex items-center gap-3">
              <div class="w-28 shrink-0 flex items-center gap-1.5">
                <span class="text-xs text-slate-100">Account 2</span>
                {#if learningEnabled}
                  <Popover.Root>
                    <Popover.Trigger
                      class="text-slate-100 hover:text-slate-100 transition-colors"
                    >
                      <svg
                        class="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        ><circle cx="12" cy="12" r="10" /><path
                          d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"
                        /><path d="M12 17h.01" /></svg
                      >
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content
                        side="top"
                        sideOffset={6}
                        class="z-50 max-w-xs rounded-lg border border-blue-300/20 bg-blue-300/5 px-3 py-2 text-sm leading-relaxed text-blue-500 shadow-xl backdrop-blur-sm"
                        >The second posting's default account — used when no
                        mapping rule matches. Typically "expenses:unknown" so
                        unmatched transactions show up in triage.</Popover.Content
                      >
                    </Popover.Portal>
                  </Popover.Root>
                {/if}
              </div>
              <div class="flex-1">
                <Combobox
                  items={allAccounts}
                  value={defaultAccount2}
                  onchange={(v) => {
                    defaultAccount2 = v;
                    mark();
                  }}
                  oncreate={trackAccount}
                  placeholder="expenses:unknown"
                  inputClass="w-full border border-slate-300 rounded-md bg-slate-900 px-2 py-1 pr-6 font-mono text-sm text-slate-100 placeholder:text-slate-100 focus:border-blue-300 outline-none"
                />
              </div>
            </div>
          {/if}
          {#each extraPostings as posting, idx}
            <div class="col-span-2 flex items-center gap-2">
              <span class="w-28 shrink-0 text-xs text-slate-100"
                >Split {idx + 1}</span
              >
              <div class="flex-1">
                <Combobox
                  items={allAccounts}
                  value={posting.account}
                  onchange={(v) => {
                    extraPostings[idx].account = v;
                    mark();
                  }}
                  oncreate={trackAccount}
                  placeholder="account"
                  inputClass="w-full border border-slate-300 rounded-md bg-slate-900 px-2 py-1 pr-6 font-mono text-sm text-slate-100 placeholder:text-slate-100 focus:border-blue-300 outline-none"
                />
              </div>
              <input
                type="text"
                value={posting.amount}
                placeholder="amount (optional)"
                oninput={(e) => {
                  extraPostings[idx].amount = (
                    e.target as HTMLInputElement
                  ).value;
                  mark();
                }}
                class="w-36 rounded-md border border-slate-300 bg-slate-900 px-2 py-1 font-mono text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-300 outline-none"
              />
              <button
                type="button"
                onclick={() => removeExtraPosting(idx)}
                aria-label="Remove posting"
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-rose-500/30 text-rose-400 transition-colors hover:border-rose-500/60 hover:bg-rose-500/10"
                ><svg
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg
                ></button
              >
            </div>
          {/each}

          {#if extraPostings.length < 7}
            <div class="col-span-2 pt-1">
              <button
                type="button"
                onclick={addExtraPosting}
                class="text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >+ Add split</button
              >
            </div>
          {/if}

          {#each extraDirectives as ed, idx}
            <div class="flex items-center gap-3">
              <div class="w-28 shrink-0">
                <span class="text-xs text-slate-100"
                  >{OPTIONAL_DIRECTIVES.find((d) => d.key === ed.key)?.label ??
                    ed.key}</span
                >
              </div>
              <input
                type="text"
                value={ed.value}
                oninput={(e) => {
                  extraDirectives[idx].value = (
                    e.target as HTMLInputElement
                  ).value;
                  mark();
                }}
                class="flex-1 rounded-md border border-slate-300 bg-slate-900 px-2 py-1 font-mono text-sm text-slate-100 outline-none focus:border-blue-300"
              />
              <button
                type="button"
                onclick={() => removeExtraDirective(idx)}
                aria-label="Remove directive"
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-rose-500/30 text-rose-400 transition-colors hover:border-rose-500/60 hover:bg-rose-500/10"
                ><svg
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg
                ></button
              >
            </div>
          {/each}

          {#if availableDirectives.length > 0}
            <div class="col-span-2 pt-1">
              <select
                onchange={(e) => {
                  const key = (e.target as HTMLSelectElement).value;
                  if (!key) return;
                  extraDirectives = [...extraDirectives, { key, value: "" }];
                  (e.target as HTMLSelectElement).value = "";
                  mark();
                }}
                class="rounded-md border border-dashed border-slate-500 bg-slate-900 px-2 py-1 text-xs text-slate-400 outline-none focus:border-slate-300 cursor-pointer"
              >
                <option value="">+ Add directive…</option>
                {#each availableDirectives as d}
                  <option value={d.key} title={d.help}>{d.label}</option>
                {/each}
              </select>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Rules list + save form -->
    <form
      id="mappingsForm"
      method="POST"
      action="?/save"
      use:enhance={saveEnhance}
    >
      <input type="hidden" name="filename" value={data.active} />
      <input
        type="hidden"
        name="payload"
        value={JSON.stringify({ header: currentHeader, items })}
      />

      <DndContext {onDragStart} {onDragEnd}>
        <SortableContext items={sortableIds.map((id) => ({ id }))}>
          <div class="space-y-0">
            {#each items as item (item.id)}
              {#if item.type === "section"}
                <SectionDropTarget id={item.id} label={item.label} />
              {:else if item.type === "include"}
                <div
                  class="flex items-center gap-2 rounded-md border border-slate-400 bg-slate-900/50 px-3 py-2 mb-1.5"
                >
                  <span class="text-xs text-slate-100">include</span>
                  <span class="font-mono text-sm text-slate-100"
                    >{item.path}</span
                  >
                </div>
              {:else if item.type === "raw"}
                <!-- Skip blank lines and comments -->
              {:else}
                <RuleSortableItem
                  id={item.id}
                  item={{
                    patterns: item.patterns ?? "",
                    account: item.account ?? "",
                    assignments: item.assignments ?? [],
                  }}
                  accounts={allAccounts}
                  onupdate={(field, value) => updateRule(item.id, field, value)}
                  onremove={() => removeRule(item.id)}
                  onupdateassignment={(idx, field, val) =>
                    updateAssignment(item.id, idx, field, val)}
                  onaddassignment={() => addAssignment(item.id)}
                  onremoveassignment={(idx) => removeAssignment(item.id, idx)}
                  oncreateaccount={trackAccount}
                />
              {/if}
            {/each}
          </div>
        </SortableContext>

        <DragOverlay>
          {#if activeDragItem}
            <div
              class="flex items-center gap-2 rounded-md border border-slate-600 bg-slate-800 px-3 py-2 shadow-lg"
            >
              <span class="text-slate-100 select-none">⠿</span>
              <span class="font-mono text-sm text-amber-400/80"
                >{activeDragItem.patterns}</span
              >
              <span class="text-sm text-slate-100">→</span>
              <span class="font-mono text-sm text-emerald-400/80"
                >{activeDragItem.account}</span
              >
            </div>
          {/if}
        </DragOverlay>
      </DndContext>

      <div class="mt-4">
        <button
          type="button"
          onclick={addRule}
          class="rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-sm text-slate-100 transition-colors hover:border-slate-400 hover:text-slate-100"
        >
          + Add mapping
        </button>
      </div>
    </form>
  {:else}
    <p class="text-sm text-slate-400">
      No .rules files yet. Use <span class="font-medium text-slate-300"
        >+ New file</span
      > above to create one.
    </p>
  {/if}
</div>
