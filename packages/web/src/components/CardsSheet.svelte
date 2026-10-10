<script lang="ts">
  import type { Card, Side } from '@la-sala/domain';
  import { t } from '../i18n/t';

  let {
    names,
    disabled,
    ongive,
    onclose,
  }: {
    names: Readonly<Record<Side, string>>;
    disabled: boolean;
    ongive: (side: Side, card: Card) => void;
    onclose: () => void;
  } = $props();

  const SIDES: readonly Side[] = ['left', 'right'];
  const CARDS: readonly Card[] = ['yellow', 'red', 'black'];
</script>

<div class="sheet" role="group" aria-label={t('board.cards')}>
  {#each SIDES as side (side)}
    <div class="column">
      {#each CARDS as card (card)}
        <button
          class="card {card}"
          type="button"
          {disabled}
          onclick={() => ongive(side, card)}
        >
          {t(`board.card.${card}`, { name: names[side] })}
        </button>
      {/each}
    </div>
  {/each}
  <button class="btn close" type="button" onclick={onclose}>{t('board.cards.close')}</button>
</div>

<style>
  .sheet {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    padding: 0.75rem;
    border: 2px solid var(--muted);
    border-radius: 0.75rem;
    background: #141b36;
  }
  .column {
    display: grid;
    gap: 0.5rem;
  }
  .card {
    min-height: 56px;
    font: inherit;
    font-weight: 700;
    border: 3px solid var(--fg);
    border-radius: 0.5rem;
    cursor: pointer;
  }
  .card:disabled {
    opacity: 0.5;
  }
  .yellow {
    background: #ffd23f;
    color: #0b1020;
  }
  .red {
    background: #e53935;
    color: #fff;
  }
  .black {
    background: #000;
    color: #fff;
  }
  .close {
    grid-column: 1 / -1;
  }
</style>
