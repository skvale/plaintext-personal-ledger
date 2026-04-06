<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="text-lg font-semibold text-slate-100">Journal</h1>
    <span class="font-mono text-xs text-slate-100">{data.path}</span>
  </div>
  <div class="rounded-xl border border-slate-400 bg-slate-900 overflow-clip">
    <pre class="p-4 text-sm font-mono text-slate-100 leading-relaxed overflow-x-auto whitespace-pre bg-transparent">{data.content || 'Empty journal.'}</pre>
  </div>
</div>
