<script lang="ts">
  import type { Card, Side, StateSetPatch } from '@la-sala/domain';
  import type { ScoreboardModel } from '../controllers/scoreboard-controller';
  import { countCards } from '../core/card-counts';
  import { t } from '../i18n/t';
  import { cardChips } from './piste-labels';
  import CardsSheet from './CardsSheet.svelte';
  import CorrectionSheet from './CorrectionSheet.svelte';

  let {
    model,
    names,
    pending,
    ontouch,
    ondouble,
    onclock,
    onundo,
    oncard,
    onskipbreak,
    onpriority,
    oncorrect,
    onnewbout,
    facing = false,
    onfacing,
  }: {
    model: ScoreboardModel;
    names: Readonly<Record<Side, string>>;
    /** Events not yet acknowledged by the server. */
    pending: number;
    ontouch: (side: Side) => void;
    ondouble: () => void;
    onclock: () => void;
    onundo: () => void;
    oncard: (side: Side, card: Card) => void;
    onskipbreak: () => void;
    onpriority: (side: Side) => void;
    /** Returns whether the correction was accepted. */
    oncorrect: (patch: StateSetPatch) => boolean;
    onnewbout: () => void;
    /** The judge faces the audience: show the fencers mirrored. Display only. */
    facing?: boolean;
    onfacing?: (facing: boolean) => void;
  } = $props();

  let cardsOpen = $state(false);
  let correctOpen = $state(false);
  const cardCounts = $derived(countCards(model.cards));

  // Only the on-screen order changes; sides, events and colours stay with the domain side.
  const SIDES = $derived<readonly Side[]>(facing ? ['right', 'left'] : ['left', 'right']);

  function give(side: Side, card: Card): void {
    oncard(side, card);
    cardsOpen = false;
  }
</script>

<section class="board" data-phase={model.phase}>
  <header class="top">
    <div class="phase">{t(model.phaseLabel.key, model.phaseLabel.params)}</div>
    <div class="clock" data-running={model.clockRunning}>{model.clockText}</div>
    {#if model.priority !== null && model.phase === 'extra-period'}
      <div class="priority">{t('board.priority.holder', { name: names[model.priority] })}</div>
    {/if}
  </header>

  <div class="halves">
    {#each SIDES as side (side)}
      <button
        class="half {side}"
        type="button"
        disabled={!model.canScore}
        aria-label={t('board.touch', { name: names[side] })}
        onclick={() => ontouch(side)}
      >
        <span class="name">{names[side]}</span>
        <span class="score">{model.score[side]}</span>
        <span class="cards">
          {#each cardChips(cardCounts[side]) as label (label)}
            <span class="chip">{label}</span>
          {/each}
        </span>
      </button>
    {/each}
  </div>

  {#if model.error && !model.error.startsWith('state-set-')}
    <p class="error" role="alert">{t('board.error')}</p>
  {/if}

  {#if model.phase === 'scheduled'}
    <p class="hint">{t('board.hint.start')}</p>
  {/if}

  {#if model.awaitingPriority}
    <div class="panel" role="group" aria-label={t('board.priority.title')}>
      <h2>{t('board.priority.title')}</h2>
      <p>{t('board.priority.hint')}</p>
      <div class="pair">
        {#each SIDES as side (side)}
          <button class="btn primary big" type="button" onclick={() => onpriority(side)}>
            {t('board.priority.pick', { name: names[side] })}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if model.result}
    <div class="panel result" role="status">
      <h2>{t('board.result', { name: names[model.result.winner] })}</h2>
      <p>{t(`board.reason.${model.result.reason}`)}</p>
      {#if pending > 0}
        <p class="hint">{t('board.newBout.waiting', { count: pending })}</p>
      {/if}
      <button class="btn primary big" type="button" disabled={pending > 0} onclick={onnewbout}>
        {t('board.newBout')}
      </button>
    </div>
  {/if}

  {#if model.clockAction}
    <button
      class="btn big clock-button {model.clockAction}"
      type="button"
      aria-label={model.clockAction === 'start' ? t('board.clock.start') : t('board.clock.stop')}
      onclick={onclock}
    >
      <!--
        Drawn here instead of the Unicode play/pause characters (U+25B6 / U+23F8): both have an
        emoji presentation, and phones ignore `U+FE0E` when their font stack has no text glyph for
        them, so the system's colour emoji won over the button's `color`. An inline SVG cannot be
        overruled that way.
      -->
      <span class="clock-icon" aria-hidden="true">
        {#if model.clockAction === 'start'}
          <svg viewBox="0 0 16 16" fill="currentColor" data-icon="play">
            <path d="M5.2 2.6v10.8L13.4 8z" />
          </svg>
        {:else}
          <svg viewBox="0 0 16 16" fill="currentColor" data-icon="pause">
            <rect x="4.2" y="2.8" width="3" height="10.4" rx="1" />
            <rect x="8.8" y="2.8" width="3" height="10.4" rx="1" />
          </svg>
        {/if}
      </span>
    </button>
  {/if}

  {#if model.canSkipBreak}
    <button class="btn big" type="button" onclick={onskipbreak}>{t('board.skipBreak')}</button>
  {/if}

  <div class="row">
    {#if model.doubleTouch !== 'hidden'}
      <button class="btn" type="button" disabled={model.doubleTouch === 'disabled'} onclick={ondouble}>
        {t('board.double')}
      </button>
    {/if}
    <button class="btn" type="button" aria-expanded={cardsOpen} onclick={() => (cardsOpen = !cardsOpen)}>
      {t('board.cards')}
    </button>
    <button class="btn" type="button" disabled={!model.canUndo} onclick={onundo}>{t('board.undo')}</button>
  </div>

  {#if cardsOpen}
    <CardsSheet mirrored={facing} {names} disabled={!model.canScore} ongive={give} onclose={() => (cardsOpen = false)} />
  {/if}

  <!-- Apart from the scoring areas and always enabled: it is how a finished bout is reopened. -->
  {#if correctOpen}
    <CorrectionSheet
      mirrored={facing}
      {names}
      score={model.score}
      basis={model.correction}
      finished={model.result !== null}
      error={model.error}
      errorParams={model.errorParams}
      onsubmit={oncorrect}
      onclose={() => (correctOpen = false)}
    />
  {:else}
    <button class="btn correct" type="button" onclick={() => (correctOpen = true)}>{t('board.correct')}</button>
  {/if}

  {#if onfacing}
    <label class="facing">
      <input type="checkbox" checked={facing} onchange={(e) => onfacing(e.currentTarget.checked)} />
      <span>{t('board.facing')}</span>
    </label>
  {/if}
</section>

<style>
  .board {
    display: grid;
    gap: 0.75rem;
  }
  .top {
    text-align: center;
  }
  .phase {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--accent);
  }
  .clock {
    font-size: clamp(4rem, 22vw, 7rem);
    font-weight: 800;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .clock[data-running='false'] {
    color: var(--muted);
  }
  .priority {
    font-weight: 700;
  }
  .halves {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .half {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    min-height: 34vh;
    padding: 1rem 0.5rem;
    font: inherit;
    color: #fff;
    border: 4px solid var(--fg);
    border-radius: 1rem;
    cursor: pointer;
    touch-action: manipulation;
  }
  .half.left {
    background: var(--side-left);
  }
  .half.right {
    background: var(--side-right);
  }
  .half:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .name {
    font-size: 1.25rem;
    font-weight: 700;
    overflow-wrap: anywhere;
    text-align: center;
  }
  .score {
    font-size: clamp(4rem, 24vw, 7rem);
    font-weight: 800;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .cards {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.25rem;
    min-height: 1.75rem;
  }
  .chip {
    padding: 0.1rem 0.5rem;
    border: 2px solid #fff;
    border-radius: 999px;
    font-weight: 700;
    font-size: 1rem;
  }
  .big {
    min-height: 72px;
    font-size: 1.4rem;
    width: 100%;
  }
  .clock-button.stop {
    background: #ff5d5d;
    border-color: #ff5d5d;
    color: #0b1020;
  }
  .clock-button.start {
    background: #5dd68a;
    border-color: #5dd68a;
    color: #0b1020;
  }
  /* Scales with the button's font-size and inherits its colour, like the character did. */
  .clock-icon svg {
    display: block;
    width: 1.15em;
    height: 1.15em;
  }
  .row {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: 0.5rem;
  }
  /*
   * Three labels in equal columns on a narrow phone: at 360px the shell leaves 328px, so each
   * column is 104px, and the global 1rem side padding plus the 2px border leaves a 68px text box
   * — "Doble toque" (11 characters) does not fit and wraps while its neighbours stay on one line.
   * Only the chrome of this row shrinks; the touch target keeps its height.
   */
  .row > .btn {
    padding-inline: 0.5rem;
  }
  .correct {
    margin-top: 1rem;
  }
  /* Whole row is the tap target; wraps instead of overflowing on a narrow phone. */
  .facing {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 48px;
    cursor: pointer;
  }
  .facing input {
    width: 1.5rem;
    height: 1.5rem;
    flex: none;
  }
  .panel {
    padding: 0.75rem;
    border: 2px solid var(--accent);
    border-radius: 0.75rem;
    text-align: center;
  }
  .pair {
    display: grid;
    gap: 0.5rem;
  }
  h2 {
    margin: 0 0 0.25rem;
    font-size: 1.4rem;
  }
  .hint {
    text-align: center;
    color: var(--muted);
    margin: 0;
  }
</style>
