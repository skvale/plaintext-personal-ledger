<script lang="ts">
  import { page } from '$app/stores';
  import { invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';

  interface Tip {
    text: string;
  }

  let {
    id,
    title = '',
    tips = [],
    children
  }: {
    id: string;
    title?: string;
    tips?: Tip[];
    children?: import('svelte').Snippet;
  } = $props();

  const completedTours = $derived($page.data.settings?.learning?.completedTours ?? []);
  const dismissedTips = $derived($page.data.settings?.learning?.dismissedTips ?? []);
  const learningEnabled = $derived($page.data.settings?.learning?.enabled ?? false);
  const learningLevel = $derived($page.data.settings?.learning?.level ?? 'beginner');
  const tourDismissed = $derived((completedTours as string[]).includes(id));

  // Filter to only undismissed tips (track original index for stable keys)
  const remainingTips = $derived(
    tips.map((tip, i) => ({ ...tip, origIndex: i, tipKey: `${id}:${i}` }))
      .filter(t => !(dismissedTips as string[]).includes(t.tipKey))
  );

  // Visible if learning enabled, level is beginner, tour not fully dismissed, and tips remain
  const visible = $derived(learningEnabled && learningLevel === 'beginner' && !tourDismissed && (remainingTips.length > 0 || (tips.length === 0 && !!children)));

  const isCarousel = $derived(tips.length > 0);

  let currentIndex = $state(0);
  onMount(() => { currentIndex = Math.floor(Math.random() * Math.max(remainingTips.length, 1)); });

  const safeIndex = $derived(remainingTips.length > 0 ? currentIndex % remainingTips.length : 0);

  function prev() {
    currentIndex = (safeIndex - 1 + remainingTips.length) % remainingTips.length;
  }

  function next() {
    currentIndex = (safeIndex + 1) % remainingTips.length;
  }

  async function dismissTip() {
    const tip = remainingTips[safeIndex];
    if (!tip) return;
    await fetch('/api/dismiss-tour', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tipKey: tip.tipKey })
    });
    // Adjust index so we don't jump past the end
    if (safeIndex >= remainingTips.length - 1 && currentIndex > 0) {
      currentIndex--;
    }
    await invalidateAll();
  }

  async function dismissAll() {
    await fetch('/api/dismiss-tour', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id })
    });
    await invalidateAll();
  }
</script>

{#if visible}
  <div
    class="mb-4 flex min-h-28 flex-col rounded-lg border border-blue-300 bg-blue-50/50 dark:border-blue-300/40 dark:bg-blue-300/5 px-4 py-3 text-base font-medium text-slate-100 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-400/50"
    tabindex="0"
    role="toolbar"
    aria-label="Learning tips — use left and right arrow keys to navigate"
    onkeydown={(e: KeyboardEvent) => {
      if (isCarousel && remainingTips.length > 1) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      }
    }}
  >
    <!-- Top bar: nav + settings link + dismiss -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        {#if isCarousel && remainingTips.length > 0}
          <button
            onclick={dismissTip}
            class="flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-400/40 px-2 py-1 text-xs text-slate-100 dark:text-slate-100 transition-colors hover:border-emerald-500/60 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-300"
            title="Got it — don't show this tip again"
          >
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Got it
          </button>
          {#if remainingTips.length > 1}
            <button
              onclick={prev}
              class="flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 dark:border-slate-400/40 text-slate-100 dark:text-slate-100 transition-colors hover:border-slate-300 dark:hover:border-slate-300/50 hover:bg-blue-100 dark:hover:bg-slate-700/40"
              aria-label="Previous tip"
            ><svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
            <span class="text-xs tabular-nums text-slate-100 dark:text-slate-100">{safeIndex + 1}/{remainingTips.length}</span>
            <button
              onclick={next}
              class="flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 dark:border-slate-400/40 text-slate-100 dark:text-slate-100 transition-colors hover:border-slate-300 dark:hover:border-slate-300/50 hover:bg-blue-100 dark:hover:bg-slate-700/40"
              aria-label="Next tip"
            ><svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
          {/if}
        {/if}
        {#if title}
          <span class="text-xs font-bold tracking-wide text-slate-100 dark:text-slate-100">{title}</span>
        {/if}
      </div>
      <div class="flex items-center gap-2">
        <a href="/settings#learning" class="whitespace-nowrap text-xs text-slate-100 dark:text-slate-100 underline underline-offset-2 visited:text-slate-100 dark:visited:text-slate-100 hover:text-blue-600 dark:hover:text-blue-500">
          Learning Mode settings
        </a>
        <button
          type="button"
          onclick={dismissAll}
          title="Dismiss all tips for this page"
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-300 dark:border-slate-400/40 text-sm text-slate-100 dark:text-slate-100 transition-colors hover:border-slate-300 dark:hover:border-slate-300/50 hover:bg-blue-100 dark:hover:bg-slate-700/40"
        >✕</button>
      </div>
    </div>

    <!-- Tip content -->
    <div class="flex flex-1 items-start gap-3 pt-2">
      <svg class="mt-0.5 h-5 w-5 shrink-0 text-slate-100 dark:text-slate-100" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1.3.5 2.6 1.5 3.5.8.8 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
      <div class="flex-1 min-w-0">
        <p class="leading-relaxed">
          {#if isCarousel && remainingTips.length > 0}
            {@html remainingTips[safeIndex].text}
          {:else if children}
            {@render children()}
          {/if}
        </p>
      </div>
    </div>
  </div>
{/if}
