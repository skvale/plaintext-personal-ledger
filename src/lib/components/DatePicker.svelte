<script lang="ts">
  import { DatePicker } from 'bits-ui';
  import { CalendarDate, type DateValue } from '@internationalized/date';

  let {
    value = $bindable(''),
    placeholder = 'Pick a date',
    onchange,
    inputClass = '',
    name,
  }: {
    value?: string;
    placeholder?: string;
    onchange?: () => void;
    inputClass?: string;
    name?: string;
  } = $props();

  function parseDate(s: string): DateValue | undefined {
    if (!s) return undefined;
    const [y, m, d] = s.split('-').map(Number);
    if (!y || !m || !d) return undefined;
    return new CalendarDate(y, m, d);
  }

  function formatDate(d: DateValue | undefined): string {
    if (!d) return '';
    return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
  }

  let inner = $state<DateValue | undefined>(parseDate(value));

  // Sync inward: string -> DateValue
  $effect(() => {
    const parsed = parseDate(value);
    if (parsed && inner && parsed.year === inner.year && parsed.month === inner.month && parsed.day === inner.day) return;
    if (!parsed && !inner) return;
    inner = parsed;
  });

  function handleChange(d: DateValue | undefined) {
    inner = d;
    const str = formatDate(d);
    if (str !== value) {
      value = str;
      onchange?.();
    }
  }
</script>

<DatePicker.Root
  value={inner}
  onValueChange={handleChange}
  weekStartsOn={1}
>
  <div class="relative">
    <DatePicker.Input
      class="flex w-full items-center rounded-lg border border-slate-300 bg-white px-3 pr-8 py-2 text-sm text-slate-100 outline-none focus-within:border-blue-300 dark:border-slate-300 dark:bg-slate-950 {inputClass}"
    >
      {#snippet children({ segments })}
        {#each segments as { part, value: segVal }}
          {#if part === 'literal'}
            <span class="text-slate-100">{segVal}</span>
          {:else}
            <DatePicker.Segment
              {part}
              class="rounded px-0.5 tabular-nums outline-none focus:bg-blue-300/20 focus:text-blue-500 data-[placeholder]:text-slate-100"
            >{segVal}</DatePicker.Segment>
          {/if}
        {/each}
      {/snippet}
    </DatePicker.Input>
    <DatePicker.Trigger
      class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-100 transition-colors hover:text-slate-100"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
      </svg>
    </DatePicker.Trigger>
  </div>
  <DatePicker.Content
    sideOffset={12}
    class="popover-caret z-50 rounded-xl border border-slate-300 bg-slate-900 p-3 shadow-xl"
  >
    <DatePicker.Calendar>
      {#snippet children({ months, weekdays })}
        <DatePicker.Header class="flex items-center justify-between pb-2">
          <DatePicker.PrevButton class="flex h-8 w-8 items-center justify-center rounded-md text-slate-100 transition-colors hover:bg-slate-800 hover:text-slate-100">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </DatePicker.PrevButton>
          <DatePicker.Heading class="text-sm font-medium text-slate-100" />
          <DatePicker.NextButton class="flex h-8 w-8 items-center justify-center rounded-md text-slate-100 transition-colors hover:bg-slate-800 hover:text-slate-100">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </DatePicker.NextButton>
        </DatePicker.Header>
        {#each months as month}
          <DatePicker.Grid class="w-full border-collapse">
            <DatePicker.GridHead>
              <DatePicker.GridRow class="flex">
                {#each weekdays as day}
                  <DatePicker.HeadCell class="w-9 text-center text-xs font-medium text-slate-100">{day.slice(0, 2)}</DatePicker.HeadCell>
                {/each}
              </DatePicker.GridRow>
            </DatePicker.GridHead>
            <DatePicker.GridBody>
              {#each month.weeks as weekDates}
                <DatePicker.GridRow class="flex">
                  {#each weekDates as date}
                    <DatePicker.Cell {date} month={month.value} class="relative p-0">
                      <DatePicker.Day
                        class="flex h-9 w-9 items-center justify-center rounded-md text-sm transition-colors
                          text-slate-100 hover:bg-slate-800
                          data-[today]:font-bold data-[today]:text-blue-500
                          data-[selected]:bg-blue-300 data-[selected]:text-white data-[selected]:hover:bg-blue-600
                          data-[outside-month]:text-slate-100 data-[outside-month]:hover:bg-slate-800/50
                          data-[disabled]:text-slate-100 data-[disabled]:pointer-events-none"
                      >{date.day}</DatePicker.Day>
                    </DatePicker.Cell>
                  {/each}
                </DatePicker.GridRow>
              {/each}
            </DatePicker.GridBody>
          </DatePicker.Grid>
        {/each}
      {/snippet}
    </DatePicker.Calendar>
  </DatePicker.Content>
  {#if name}
    <input type="hidden" {name} value={value} />
  {/if}
</DatePicker.Root>
