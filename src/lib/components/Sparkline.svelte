<script lang="ts">
  let {
    values,
    labels,
    width = 120,
    height = 32,
    color = '#f87171',
    fillOpacity = 0.15,
    showAxis = false,
  }: {
    values: number[];
    labels?: string[];
    width?: number;
    height?: number;
    color?: string;
    fillOpacity?: number;
    showAxis?: boolean;
  } = $props();

  // Layout: leave room for labels if showing axis
  const topPad = $derived(showAxis ? 14 : 0);
  const labelH = $derived(showAxis ? 12 : 0);
  const yLabelW = $derived(showAxis ? 32 : 0);
  const plotW = $derived(width - yLabelW);
  const plotH = $derived(height - labelH - topPad);
  const pad = 2;

  const max = $derived(Math.max(...values, 1));
  const min = $derived(Math.min(...values, 0));
  const range = $derived(max - min || 1);

  const path = $derived.by(() => {
    if (values.length < 2) return '';
    const step = plotW / (values.length - 1);
    const h = plotH - pad * 2;

    return values.map((v, i) => {
      const x = yLabelW + i * step;
      const r = showAxis ? axisRange : range;
      const y = topPad + pad + h - ((v - min) / r) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  });

  const fillPath = $derived.by(() => {
    if (!path) return '';
    const step = plotW / (values.length - 1);
    const lastX = yLabelW + (values.length - 1) * step;
    return `${path} L${lastX.toFixed(1)},${topPad + plotH} L${yLabelW},${topPad + plotH} Z`;
  });

  const niceTop = $derived(niceMax(max));
  const axisRange = $derived(niceTop - min || 1);

  // Round up to a "nice" axis number
  function niceMax(n: number): number {
    if (n <= 0) return 0;
    const mag = Math.pow(10, Math.floor(Math.log10(n)));
    const steps = [1, 2, 2.5, 5, 10];
    for (const s of steps) {
      const nice = Math.ceil(n / (mag * s)) * (mag * s);
      if (nice >= n) return nice;
    }
    return Math.ceil(n / mag) * mag;
  }

  // Zero baseline Y position (if min < 0)
  const zeroY = $derived(topPad + pad + (plotH - pad * 2) - ((0 - min) / (showAxis ? axisRange : range)) * (plotH - pad * 2));

  function fmtShort(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
    return n.toFixed(0);
  }
</script>

<svg {width} {height} class="inline-block align-middle">
  {#if showAxis}
    <!-- Y axis labels -->
    <text x={yLabelW - 4} y={topPad + pad + 3} text-anchor="end" class="fill-slate-500" font-size="8">{fmtShort(niceTop)}</text>
    <text x={yLabelW - 4} y={topPad + plotH} text-anchor="end" class="fill-slate-500" font-size="8">{fmtShort(min)}</text>

    <!-- X axis labels -->
    {#if labels}
      {#each labels as label, i}
        {#if i === 0 || i === labels.length - 1 || (labels.length > 4 && i === Math.floor(labels.length / 2))}
          {@const x = yLabelW + i * (plotW / (labels.length - 1))}
          <text x={x} y={height - 1} text-anchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'} class="fill-slate-500" font-size="8">{label}</text>
        {/if}
      {/each}
    {/if}

    <!-- Axis lines -->
    <line x1={yLabelW} y1={topPad} x2={yLabelW} y2={topPad + plotH} class="stroke-slate-700" stroke-width="0.5" />
    <line x1={yLabelW} y1={topPad + plotH} x2={width} y2={topPad + plotH} class="stroke-slate-700" stroke-width="0.5" />

    <!-- Zero baseline -->
    {#if min < 0}
      <line x1={yLabelW} y1={zeroY} x2={width} y2={zeroY} class="stroke-slate-600" stroke-width="0.5" stroke-dasharray="2,2" />
    {/if}
  {/if}

  {#if fillPath}
    <path d={fillPath} fill={color} fill-opacity={fillOpacity} />
  {/if}
  {#if path}
    <path d={path} fill="none" stroke={color} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
  {/if}
</svg>
