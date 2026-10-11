<script lang="ts">
  import type { Card } from '@la-sala/domain';

  /**
   * A round, colour-only marker for the most severe card a fencer holds. Size comes from the
   * `--dot-size` custom property of the parent. Decorative unless a label is given.
   */
  let { card, label }: { card: Card; label?: string } = $props();
</script>

<span
  class="card-dot {card}"
  data-card={card}
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
></span>

<style>
  .card-dot {
    display: inline-block;
    box-sizing: border-box;
    width: var(--dot-size, 1.6rem);
    height: var(--dot-size, 1.6rem);
    border: 2px solid #fff;
    border-radius: 50%;
    pointer-events: none;
    flex: none;
  }
  .yellow {
    background: #ffd23f;
  }
  .red {
    background: #e53935;
  }
  .black {
    background: #000;
  }
</style>
