<script lang="ts" module>
  /** Stroke icons on a 24x24 grid; the paths are static literals owned by this file. */
  const PATHS = {
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z" />',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" />',
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" />',
    retry: '<path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" />',
    undo: '<path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" />',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />',
    'arrow-left': '<path d="M15 5l-7 7 7 7" />',
  } as const;

  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  let { name }: { name: IconName } = $props();
</script>

<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {@html PATHS[name]}
</svg>
