<script lang="ts">
  import { onMount } from 'svelte';
  import type { ChartConfiguration } from 'chart.js';

  let { config, height }: { config: ChartConfiguration; height?: string } = $props();

  let canvas: HTMLCanvasElement;
  let chart = $state<import('chart.js').Chart | undefined>(undefined);

  // Inject maintainAspectRatio: false when a fixed height is specified
  const resolvedConfig = $derived.by(() => {
    if (!height) return config;
    return {
      ...config,
      options: { ...config.options, maintainAspectRatio: false }
    };
  });

  onMount(() => {
    import('chart.js').then(({ Chart: ChartJS, registerables }) => {
      ChartJS.register(...registerables);
      chart = new ChartJS(canvas, resolvedConfig);
    });
    return () => chart?.destroy();
  });

  $effect(() => {
    if (!chart) return;
    chart.data = resolvedConfig.data;
    // Sync options so theme changes (grid/tick colors) take effect
    (chart as any).options = resolvedConfig.options;
    chart.update();
  });
</script>

<div style:max-height={height}>
  <canvas bind:this={canvas}></canvas>
</div>
