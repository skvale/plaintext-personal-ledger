<script lang="ts">
  import { page } from '$app/stores';
  import { invalidateAll } from '$app/navigation';

  let {
    id,
    dismissable = true,
    children
  }: {
    id: string;
    dismissable?: boolean;
    children?: import('svelte').Snippet;
  } = $props();

  const learningEnabled = $derived($page.data.settings?.learning?.enabled ?? false);
  const learningLevel = $derived($page.data.settings?.learning?.level ?? 'beginner');
  const dismissedTips = $derived($page.data.settings?.learning?.dismissedTips ?? []);
  const isDismissed = $derived((dismissedTips as string[]).includes(`${id}:help`));

  // Show help banners only when learning enabled AND level is beginner (not advanced)
  const visible = $derived(learningEnabled && learningLevel === 'beginner' && !isDismissed);

  async function dismiss() {
    await fetch('/api/dismiss-tour', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tipKey: `${id}:help` })
    });
    await invalidateAll();
  }
</script>

{#if visible}
  <div class="mb-4 min-h-28 rounded-lg border border-blue-300 bg-blue-50/50 dark:border-blue-300/40 dark:bg-blue-300/5 px-4 py-3 text-sm text-slate-100 dark:text-slate-100">
    <div class="flex items-start gap-3">
      <svg class="mt-0.5 h-5 w-5 shrink-0 text-slate-100 dark:text-slate-100" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1.3.5 2.6 1.5 3.5.8.8 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>

      <div class="flex-1 min-w-0">
        <p class="leading-relaxed">
          {#if children}
            {@render children()}
          {/if}
        </p>
      </div>

      {#if dismissable}
        <button
          type="button"
          onclick={dismiss}
          title="Dismiss"
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-300 dark:border-slate-400/40 text-sm text-slate-100 dark:text-slate-100 transition-colors hover:border-slate-300 dark:hover:border-slate-300/50 hover:bg-blue-100 dark:hover:bg-slate-700/40"
        >&#x2715;</button>
      {/if}
    </div>
  </div>
{/if}
