<script lang="ts">
  import type { Side } from '@la-sala/domain';
  import type { PisteView } from '../core/piste-view';
  import { t } from '../i18n/t';
  import { cardLabels, clockText, periodText, phaseLabel, winnerText } from './piste-labels';

  /**
   * What a piste shows, shared by the board card and the detail screen. Size comes from the
   * `--numeral` custom property of the parent, so the same markup serves a phone and a TV.
   */
  let { view, titleTag = 'span' }: { view: PisteView; titleTag?: 'span' | 'h1' } = $props();

  const sides: readonly Side[] = ['left', 'right'];
  const clock = $derived(clockText(view));
  const period = $derived(periodText(view));
  const winnerLine = $derived(winnerText(view));
</script>

<span class="head">
  <svelte:element this={titleTag} class="piste">{t('board.piste', { piste: view.pisteId })}</svelte:element>
  <span class="phase">{phaseLabel(view)}</span>
</span>

{#if view.fencers}
  <span class="fencers">
    {#each sides as side (side)}
      {@const name = view.fencers[side]}
      <span class="fencer" class:winner={view.winner === side}>
        <span class="name">{name}</span>
        <span class="score" aria-label={t('spectator.score', { name })}>{view.score[side]}</span>
        <span class="cards">
          {#each cardLabels(view, side) as label (label)}
            <span class="chip">{label}</span>
          {/each}
        </span>
      </span>
    {/each}
  </span>
{/if}

{#if clock !== null}
  <span class="clock" class:frozen={view.stale || !view.running} aria-label={t('spectator.clock')}>{clock}</span>
{/if}
{#if period !== null}<span class="period">{period}</span>{/if}
{#if winnerLine !== null}<span class="result">{winnerLine}</span>{/if}
{#if view.stale}<span class="stale-note">{t('spectator.staleCard')}</span>{/if}

<style>
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .piste {
    margin: 0;
    font-weight: 800;
    font-size: calc(var(--numeral) * 0.35);
  }
  .phase {
    color: var(--muted);
    font-weight: 700;
    font-size: calc(var(--numeral) * 0.3);
  }
  .fencers {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .fencer {
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 0.25rem;
    padding: 0.5rem;
    border: 3px solid transparent;
    border-radius: 0.75rem;
    min-width: 0;
  }
  .fencer.winner {
    border-color: var(--accent);
    background: rgb(255 210 63 / 0.15);
  }
  .name {
    font-weight: 700;
    font-size: calc(var(--numeral) * 0.3);
    overflow-wrap: anywhere;
    text-align: center;
  }
  .score {
    font-weight: 900;
    font-size: var(--numeral);
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .cards {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.25rem;
    min-height: 1.5rem;
  }
  .chip {
    padding: 0.1rem 0.5rem;
    border: 2px solid var(--muted);
    border-radius: 999px;
    font-weight: 700;
    font-size: calc(var(--numeral) * 0.25);
  }
  .clock {
    text-align: center;
    font-weight: 800;
    font-size: calc(var(--numeral) * 0.8);
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .clock.frozen {
    color: var(--muted);
  }
  .period {
    text-align: center;
    color: var(--muted);
    font-weight: 700;
    font-size: calc(var(--numeral) * 0.3);
  }
  .result {
    text-align: center;
    color: var(--accent);
    font-weight: 800;
    font-size: calc(var(--numeral) * 0.3);
  }
  .stale-note {
    text-align: center;
    color: var(--muted);
    font-style: italic;
    font-size: calc(var(--numeral) * 0.25);
  }
</style>
