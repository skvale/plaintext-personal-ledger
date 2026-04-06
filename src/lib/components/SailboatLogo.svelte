<script lang="ts">
  let {
    class: className = '',
    withText = false,
  }: {
    class?: string;
    withText?: boolean;
  } = $props();
</script>

{#if withText}
<svg class="{className}" viewBox="0 0 200 50" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Circle badge -->
  <ellipse cx="25" cy="25" rx="23" ry="24" fill="currentColor" class="text-slate-800" />
  <ellipse cx="25" cy="25" rx="22" ry="23" stroke="currentColor" class="text-slate-300/50" stroke-width="1" fill="none" />

  <clipPath id="badge-clip-wt">
    <ellipse cx="25" cy="25" rx="20.5" ry="21.5" />
  </clipPath>
  <g clip-path="url(#badge-clip-wt)">
    <!-- Sun -->
    <circle cx="36" cy="8" r="5" fill="currentColor" class="text-amber-400/30" />
    <circle cx="36" cy="8" r="3" fill="currentColor" class="text-amber-400" />

    <!-- Main sail -->
    <path d="M23 5 L23 24 L14 24 Z" fill="currentColor" class="text-amber-100" />
    <path d="M23 5 L23 24 L14 24 Z" stroke="currentColor" class="text-amber-300" stroke-width="0.4" fill="none" />
    <path d="M23 12 L17.5 24" stroke="currentColor" class="text-amber-300" stroke-width="0.3" opacity="0.5" />

    <!-- Jib sail -->
    <path d="M24 8 L24 24 L33 24 Z" fill="currentColor" class="text-amber-50" />
    <path d="M24 8 L24 24 L33 24 Z" stroke="currentColor" class="text-amber-300" stroke-width="0.4" fill="none" />

    <!-- Mast -->
    <line x1="23.5" y1="4" x2="23.5" y2="24" stroke="currentColor" class="text-amber-800" stroke-width="0.8" />
    <!-- Boom -->
    <line x1="23" y1="24" x2="14" y2="24" stroke="currentColor" class="text-amber-800" stroke-width="0.5" />

    <!-- Rigging -->
    <path d="M23.5 5 L14 24" stroke="currentColor" class="text-amber-600" stroke-width="0.3" opacity="0.4" />
    <path d="M23.5 8 L33 24" stroke="currentColor" class="text-amber-600" stroke-width="0.3" opacity="0.4" />

    <!-- Cabin -->
    <path d="M19 22.5 L29 22.5 L28.5 24 L19 24 Z" fill="currentColor" class="text-amber-800" />
    <rect x="20" y="22.5" width="1.5" height="1.5" fill="currentColor" class="text-amber-400" opacity="0.35" />
    <rect x="23" y="22.5" width="1.5" height="1.5" fill="currentColor" class="text-amber-400" opacity="0.35" />

    <!-- Hull (softened trapezoid) -->
    <path d="M11 24 L39 24 L37.5 28 Q36.5 29 35 29 L15 29 Q13.5 29 12.5 28 Z" fill="currentColor" class="text-orange-600" />
    <path d="M12 24 L38 24 L37 27.5 Q36 28.5 35 28.5 L15 28.5 Q14 28.5 13 27.5 Z" fill="currentColor" class="text-orange-500" />
    <path d="M14 26.5 L36 26.5" stroke="currentColor" class="text-orange-700" stroke-width="0.3" opacity="0.4" />

    <!-- Portholes -->
    <circle cx="18" cy="26.5" r="0.8" fill="currentColor" class="text-amber-300" opacity="0.3" />
    <circle cx="23" cy="26.5" r="0.8" fill="currentColor" class="text-amber-300" opacity="0.3" />
    <circle cx="28" cy="26.5" r="0.8" fill="currentColor" class="text-amber-300" opacity="0.3" />

    <!-- Water surface (cuts across mid-hull) -->
    <path d="M4 27 Q10 25.5 16 27 Q22 28.5 28 27 Q34 25.5 40 27 Q46 28.5 50 27" stroke="currentColor" class="text-cyan-400" stroke-width="0.8" fill="none" opacity="0.7" />
    <path d="M4 28.5 Q10 27.5 16 28.5 Q22 29.5 28 28.5 Q34 27.5 40 28.5" stroke="currentColor" class="text-cyan-500" stroke-width="0.5" fill="none" opacity="0.35" />

    <!-- Water tint below surface -->
    <rect x="4" y="27" width="42" height="21" fill="currentColor" class="text-cyan-900" opacity="0.12" />

    <!-- Centerboard (keel, rounded bottom) -->
    <path d="M22 29 L28 29 L27 35 Q25 37 23 35 Z" fill="currentColor" class="text-orange-900" opacity="0.5" />
    <path d="M22 29 L28 29 L27 35 Q25 37 23 35 Z" stroke="currentColor" class="text-orange-950" stroke-width="0.3" opacity="0.3" fill="none" />

    <!-- Rudder -->
    <path d="M33 29 L34.5 29 L34.5 34 Q34.5 35 33.5 35 L32.5 35 Z" fill="currentColor" class="text-amber-900" opacity="0.45" />

    <!-- Underwater ripples -->
    <path d="M6 31 Q12 30 18 31 Q24 32 30 31 Q36 30 42 31" stroke="currentColor" class="text-cyan-400" stroke-width="0.4" fill="none" opacity="0.15" />
    <path d="M8 34 Q14 33 20 34 Q26 35 32 34 Q38 33 44 34" stroke="currentColor" class="text-cyan-400" stroke-width="0.3" fill="none" opacity="0.1" />
  </g>

  <!-- Text beside the badge -->
  <text x="52" y="20" fill="currentColor" class="text-brand-400" font-family="'Manrope', system-ui, sans-serif" font-size="11" font-weight="600" letter-spacing="0.5">Plaintext</text>
  <text x="52" y="37" fill="currentColor" class="text-slate-100" font-family="'Manrope', system-ui, sans-serif" font-size="14" font-weight="600" letter-spacing="0.3">Personal Ledger</text>
</svg>
{:else}
<svg class="{className}" viewBox="0 0 50 52" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Circle badge -->
  <ellipse cx="25" cy="26" rx="23" ry="24" fill="currentColor" class="text-slate-800" />
  <ellipse cx="25" cy="26" rx="22" ry="23" stroke="currentColor" class="text-slate-300/50" stroke-width="1" fill="none" />

  <clipPath id="badge-clip">
    <ellipse cx="25" cy="26" rx="20.5" ry="21.5" />
  </clipPath>
  <g clip-path="url(#badge-clip)">
    <!-- Sun -->
    <circle cx="36" cy="9" r="5" fill="currentColor" class="text-amber-400/30" />
    <circle cx="36" cy="9" r="3" fill="currentColor" class="text-amber-400" />

    <!-- Main sail -->
    <path d="M23 6 L23 25 L14 25 Z" fill="currentColor" class="text-amber-100" />
    <path d="M23 6 L23 25 L14 25 Z" stroke="currentColor" class="text-amber-300" stroke-width="0.4" fill="none" />
    <path d="M23 13 L17.5 25" stroke="currentColor" class="text-amber-300" stroke-width="0.3" opacity="0.5" />

    <!-- Jib sail -->
    <path d="M24 9 L24 25 L33 25 Z" fill="currentColor" class="text-amber-50" />
    <path d="M24 9 L24 25 L33 25 Z" stroke="currentColor" class="text-amber-300" stroke-width="0.4" fill="none" />

    <!-- Mast -->
    <line x1="23.5" y1="5" x2="23.5" y2="25" stroke="currentColor" class="text-amber-800" stroke-width="0.8" />
    <!-- Boom -->
    <line x1="23" y1="25" x2="14" y2="25" stroke="currentColor" class="text-amber-800" stroke-width="0.5" />

    <!-- Rigging -->
    <path d="M23.5 6 L14 25" stroke="currentColor" class="text-amber-600" stroke-width="0.3" opacity="0.4" />
    <path d="M23.5 9 L33 25" stroke="currentColor" class="text-amber-600" stroke-width="0.3" opacity="0.4" />

    <!-- Cabin -->
    <path d="M19 23.5 L29 23.5 L28.5 25 L19 25 Z" fill="currentColor" class="text-amber-800" />
    <rect x="20" y="23.5" width="1.5" height="1.5" fill="currentColor" class="text-amber-400" opacity="0.35" />
    <rect x="23" y="23.5" width="1.5" height="1.5" fill="currentColor" class="text-amber-400" opacity="0.35" />

    <!-- Hull (softened trapezoid) -->
    <path d="M11 25 L39 25 L37.5 29 Q36.5 30 35 30 L15 30 Q13.5 30 12.5 29 Z" fill="currentColor" class="text-orange-600" />
    <path d="M12 25 L38 25 L37 28.5 Q36 29.5 35 29.5 L15 29.5 Q14 29.5 13 28.5 Z" fill="currentColor" class="text-orange-500" />
    <path d="M14 27.5 L36 27.5" stroke="currentColor" class="text-orange-700" stroke-width="0.3" opacity="0.4" />

    <!-- Portholes -->
    <circle cx="18" cy="27.5" r="0.8" fill="currentColor" class="text-amber-300" opacity="0.3" />
    <circle cx="23" cy="27.5" r="0.8" fill="currentColor" class="text-amber-300" opacity="0.3" />
    <circle cx="28" cy="27.5" r="0.8" fill="currentColor" class="text-amber-300" opacity="0.3" />

    <!-- Water surface (cuts across mid-hull) -->
    <path d="M4 28 Q10 26.5 16 28 Q22 29.5 28 28 Q34 26.5 40 28 Q46 29.5 50 28" stroke="currentColor" class="text-cyan-400" stroke-width="0.8" fill="none" opacity="0.7" />
    <path d="M4 29.5 Q10 28.5 16 29.5 Q22 30.5 28 29.5 Q34 28.5 40 29.5" stroke="currentColor" class="text-cyan-500" stroke-width="0.5" fill="none" opacity="0.35" />

    <!-- Water tint below surface -->
    <rect x="4" y="28" width="42" height="21" fill="currentColor" class="text-cyan-900" opacity="0.12" />

    <!-- Centerboard (keel, rounded bottom) -->
    <path d="M22 30 L28 30 L27 36 Q25 38 23 36 Z" fill="currentColor" class="text-orange-900" opacity="0.5" />
    <path d="M22 30 L28 30 L27 36 Q25 38 23 36 Z" stroke="currentColor" class="text-orange-950" stroke-width="0.3" opacity="0.3" fill="none" />

    <!-- Rudder -->
    <path d="M33 30 L34.5 30 L34.5 35 Q34.5 36 33.5 36 L32.5 36 Z" fill="currentColor" class="text-amber-900" opacity="0.45" />

    <!-- Underwater ripples -->
    <path d="M6 32 Q12 31 18 32 Q24 33 30 32 Q36 31 42 32" stroke="currentColor" class="text-cyan-400" stroke-width="0.4" fill="none" opacity="0.15" />
    <path d="M8 35 Q14 34 20 35 Q26 36 32 35 Q38 34 44 35" stroke="currentColor" class="text-cyan-400" stroke-width="0.3" fill="none" opacity="0.1" />
  </g>
</svg>
{/if}
