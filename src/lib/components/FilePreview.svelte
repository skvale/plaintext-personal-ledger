<script lang="ts">
  import { tick } from 'svelte';

  let { src, name, ext, children }: { src: string; name: string; ext: string; children: any } = $props();

  const isImage = $derived(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext));
  const isPdf = $derived(ext === 'pdf');
  const isCsv = $derived(ext === 'csv');
  const hasPreview = $derived(isImage || isPdf || isCsv);

  let visible = $state(false);
  let style = $state('');
  let triggerEl = $state<HTMLElement | null>(null);
  let csvRows = $state<string[][]>([]);
  let csvLoaded = $state(false);

  // Portal action: move element to document.body so backdrop-filter ancestors don't trap it
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() { node.remove(); }
    };
  }

  async function onEnter() {
    visible = true;
    await tick();
    if (triggerEl) {
      const rect = triggerEl.getBoundingClientRect();
      const previewH = isImage ? 300 : isCsv ? 260 : 340;
      const previewW = isImage ? 384 : isCsv ? 448 : 384;
      let left = rect.left;
      if (left + previewW > window.innerWidth) left = window.innerWidth - previewW - 8;
      if (left < 8) left = 8;
      if (rect.top > previewH + 16) {
        style = `left: ${left}px; bottom: ${window.innerHeight - rect.top + 8}px;`;
      } else {
        style = `left: ${left}px; top: ${rect.bottom + 8}px;`;
      }
    }
    if (isCsv && !csvLoaded) {
      try {
        const res = await fetch(src);
        const text = await res.text();
        const lines = text.split('\n').filter(l => l.trim());
        csvRows = lines.slice(0, 8).map(line => {
          const row: string[] = [];
          let cur = '';
          let inQuote = false;
          for (const ch of line) {
            if (ch === '"') { inQuote = !inQuote; }
            else if (ch === ',' && !inQuote) { row.push(cur.trim()); cur = ''; }
            else { cur += ch; }
          }
          row.push(cur.trim());
          return row;
        });
        csvLoaded = true;
      } catch { /* ignore */ }
    }
  }
</script>

{#if hasPreview}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <span
    bind:this={triggerEl}
    class="inline"
    onmouseenter={onEnter}
    onmouseleave={() => visible = false}
  >
    {@render children()}
  </span>
  {#if visible}
    <div
      use:portal
      class="pointer-events-none fixed rounded-lg border border-slate-200 bg-white shadow-xl overflow-hidden z-[100] dark:border-slate-300 dark:bg-slate-900"
      {style}
    >
      {#if isImage}
        <img {src} alt={name} class="max-w-sm max-h-[50vh] object-contain" />
      {:else if isCsv}
        <div class="max-w-md max-h-64 overflow-hidden p-2">
          {#if csvRows.length > 0}
            <table class="text-xs font-mono">
              <thead>
                <tr>
                  {#each csvRows[0] as cell}
                    <th class="px-2 py-1 text-left text-slate-100 font-semibold border-b border-slate-300 whitespace-nowrap">{cell}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each csvRows.slice(1) as row}
                  <tr>
                    {#each row as cell}
                      <td class="px-2 py-0.5 text-slate-100 whitespace-nowrap">{cell}</td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          {:else}
            <p class="text-xs text-slate-100 px-2 py-1">Loading…</p>
          {/if}
        </div>
      {:else}
        <div class="w-96 h-80 overflow-hidden">
          <iframe src="{src}#toolbar=0&navpanes=0&scrollbar=0" title={name} class="border-0" style="margin-right: -20px; margin-bottom: -20px; width: calc(100% + 20px); height: calc(100% + 20px);"></iframe>
        </div>
      {/if}
    </div>
  {/if}
{:else}
  {@render children()}
{/if}
