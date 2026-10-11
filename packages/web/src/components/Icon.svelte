<script lang="ts" module>
  /** Stroke icons on a 24x24 grid; the paths are static literals owned by this file. */
  const PATHS = {
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z" />',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" />',
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" />',
    retry: '<path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" />',
    undo: '<path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" />',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" />',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />',
    flag: '<path d="M5 21V4" /><path d="M5 4h12l-2 4 2 4H5" />',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />',
    users: '<circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5a3 3 0 0 1 0 6M18 20a6 6 0 0 0-2-4.5" />',
    admin: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" />',
    x: '<path d="M6 6l12 12M18 6 6 18" />',
    clock: '<circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />',
    scores: '<rect x="3" y="5" width="18" height="14" rx="2" /><path d="M12 5v14M7 12h2M15 12h2" />',
    cards: '<rect x="4" y="6" width="9" height="13" rx="1.5" /><path d="M15 8l5 1-2.5 10-3-.6" />',
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
