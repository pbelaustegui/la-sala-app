<script lang="ts">
  import type { PisteView } from '../core/piste-view';
  import PisteFace from './PisteFace.svelte';

  /** Same data as the card with numerals sized for a TV or a phone held at arm's length. */
  let { view }: { view: PisteView } = $props();
</script>

<section class="detail" class:stale={view.stale} data-stale={view.stale}>
  <PisteFace {view} titleTag="h1" />
</section>

<style>
  .detail {
    --numeral: clamp(4rem, 20vmin, 14rem);
    display: grid;
    gap: 1.5rem;
    padding: 1rem;
  }
  .detail.stale {
    opacity: 0.65;
  }
</style>
