<script lang="ts">
  let { ext, size = 'md' }: { ext: string; size?: 'sm' | 'md' } = $props();

  const px = $derived(size === 'sm' ? 16 : 20);
  const labelSize = $derived(size === 'sm' ? 5 : 6);
</script>

<svg width={px} height={px} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="shrink-0">
  <!-- File shape with folded corner -->
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"
    class="{ext === 'pdf' ? 'fill-rose-500/15 stroke-rose-400' : ext === 'csv' ? 'fill-emerald-500/15 stroke-emerald-400' : ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext) ? 'fill-blue-400/15 stroke-blue-400' : 'fill-slate-500/15 stroke-slate-400'}"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
  <polyline points="14 2 14 8 20 8"
    class="{ext === 'pdf' ? 'stroke-rose-400' : ext === 'csv' ? 'stroke-emerald-400' : ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext) ? 'stroke-blue-400' : 'stroke-slate-400'}"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />

  <!-- Extension label -->
  <text x="12" y="17" text-anchor="middle"
    font-size={labelSize} font-weight="700" letter-spacing="0.5"
    class="{ext === 'pdf' ? 'fill-rose-400' : ext === 'csv' ? 'fill-emerald-400' : ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext) ? 'fill-blue-400' : 'fill-slate-400'}"
  >{ext.toUpperCase()}</text>
</svg>
