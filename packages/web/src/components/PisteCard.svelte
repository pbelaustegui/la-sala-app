<script lang="ts">
  import type { PisteView } from '../core/piste-view';
  import { hrefTo } from '../router';
  import PisteFace from './PisteFace.svelte';

  /** A board card: the whole card is one tap target that opens the piste detail. */
  let { view }: { view: PisteView } = $props();
</script>

<a class="card" class:stale={view.stale} data-stale={view.stale} href={hrefTo({ name: 'piste', pisteId: view.pisteId })}>
  <PisteFace {view} />
</a>

<style>
  .card {
    --numeral: clamp(2.5rem, 9vw, 4.5rem);
    display: grid;
    gap: 0.75rem;
    padding: 1rem;
    box-sizing: border-box;
    color: var(--fg);
    text-decoration: none;
    background: var(--surface-2);
    border: 2px solid var(--muted);
    border-radius: 1rem;
  }
  .card.stale {
    opacity: 0.65;
  }
</style>
