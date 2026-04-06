<script lang="ts">
  let {
    label,
    onprev,
    onnext,
    disableNext = false,
    disablePrev = false,
  }: {
    label: string;
    onprev: () => void;
    onnext: () => void;
    disableNext?: boolean;
    disablePrev?: boolean;
  } = $props();
</script>

<div class="flex items-center rounded-lg border border-slate-400 bg-slate-900">
  <button
    onclick={onprev}
    disabled={disablePrev}
    class="flex h-8 w-9 items-center justify-center rounded-l-lg text-base text-slate-100 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30 disabled:cursor-default"
    aria-label="Previous"
  >‹</button>
  <span class="min-w-[120px] text-center text-sm text-slate-100">{label}</span>
  <button
    onclick={onnext}
    disabled={disableNext}
    class="flex h-8 w-9 items-center justify-center rounded-r-lg text-base text-slate-100 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30 disabled:cursor-default"
    aria-label="Next"
  >›</button>
</div>
