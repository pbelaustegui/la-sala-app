<script lang="ts">
  import type { Card, Side, StateSetPatch } from '@la-sala/domain';
  import type { ScoreboardModel } from '../controllers/scoreboard-controller';
  import CardDot from './CardDot.svelte';
  import { countCards, highestCard } from '../core/card-counts';
  import { t } from '../i18n/t';
  import CorrectionSheet from './CorrectionSheet.svelte';
  import Icon from './Icon.svelte';

  let {
    model,
    names,
    pending,
    ontouch,
    onsubtract,
    ondouble,
    onclock,
    onpreset,
    onreset,
    onundo,
    ontogglecard,
    onskipbreak,
    onpriority,
    oncorrect,
    onnewbout,
    facing = false,
    facingBusy = false,
    facingFailed = false,
    onfacing,
  }: {
    model: ScoreboardModel;
    names: Readonly<Record<Side, string>>;
    /** Events not yet acknowledged by the server. */
    pending: number;
    ontouch: (side: Side) => void;
    onsubtract: (side: Side) => void;
    ondouble: () => void;
    onclock: () => void;
    /** Sets the clock to this many minutes (3, 2 or 1). */
    onpreset: (minutes: number) => void;
    onreset: () => void;
    onundo: () => void;
    /** Gives the card when the side has none of that type, removes it otherwise. */
    ontogglecard: (side: Side, card: Card) => void;
    onskipbreak: () => void;
    onpriority: (side: Side) => void;
    /** Returns whether the correction was accepted. */
    oncorrect: (patch: StateSetPatch) => boolean;
    onnewbout: () => void;
    /** Piste flag "facing the audience": it mirrors the SPECTATOR views, never this screen. */
    facing?: boolean;
    /** The flag is being saved. */
    facingBusy?: boolean;
    /** The last change could not be saved (offline); the previous value is shown. */
    facingFailed?: boolean;
    onfacing?: (facing: boolean) => void;
  } = $props();

  let correctOpen = $state(false);
  const cardCounts = $derived(countCards(model.cards));

  /** The card just given, shown full screen so the judge can hold the phone up as the card. */
  let shownCard = $state<Card | null>(null);

  function toggleCard(side: Side, card: Card): void {
    const adding = cardCounts[side][card] === 0;
    ontogglecard(side, card);
    if (adding) shownCard = card;
  }

  const SIDES: readonly Side[] = ['left', 'right'];
  const CARDS: readonly Card[] = ['yellow', 'red', 'black'];
  const PRESETS: readonly number[] = [3, 2, 1];
</script>

<section class="board" data-phase={model.phase}>
  <div class="toolbar">
    <button class="icon" type="button" aria-label={t('board.correct')} onclick={() => (correctOpen = true)}>
      <Icon name="edit" />
    </button>
    {#if onfacing}
      <label class="icon toggle" class:on={facing}>
        <input
          type="checkbox"
          aria-label={t('board.facing')}
          checked={facing}
          disabled={facingBusy}
          onchange={(e) => onfacing(e.currentTarget.checked)}
        />
        <Icon name="monitor" />
        <span class="toggle-label" aria-hidden="true">{t('board.facing.short')}</span>
      </label>
    {/if}
    <div class="phase">{t(model.phaseLabel.key, model.phaseLabel.params)}</div>
    {#if model.priority !== null && model.phase === 'extra-period'}
      <div class="priority">{t('board.priority.holder', { name: names[model.priority] })}</div>
    {/if}
    <!-- Far from the scoring controls on purpose: one tap wipes the bout (undo brings it back). -->
    <button class="icon danger reset" type="button" aria-label={t('board.reset')} onclick={onreset}>
      <Icon name="reset" />
    </button>
  </div>
  {#if facingFailed}
    <p class="note" role="status">{t('board.facing.failed')}</p>
  {/if}

  <div class="clock" data-running={model.clockRunning}>{model.clockText}</div>

  <div class="halves">
    {#each SIDES as side (side)}
      {@const shown = highestCard(cardCounts[side])}
      <div class="half {side}">
        <button
          class="tap"
          type="button"
          disabled={!model.canScore}
          aria-label={t('board.touch', { name: names[side] })}
          onclick={() => ontouch(side)}
        >
          <span class="name">{names[side]}</span>
          <span class="score">{model.score[side]}</span>
        </button>
        <button
          class="minus"
          type="button"
          disabled={!model.canScore || model.score[side] === 0}
          aria-label={t('board.subtract', { name: names[side] })}
          onclick={() => onsubtract(side)}
        >
          <span aria-hidden="true">−</span>
        </button>
        {#if shown}
          <CardDot card={shown} />
        {/if}
        <div class="cards">
          {#each CARDS as card (card)}
            <button
              class="card-toggle {card}"
              type="button"
              disabled={!model.canScore}
              aria-pressed={cardCounts[side][card] > 0}
              aria-label={t(`board.card.${card}`, { name: names[side] })}
              onclick={() => toggleCard(side, card)}
            ></button>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  {#if model.error && !model.error.startsWith('state-set-')}
    <p class="error" role="alert">{t('board.error')}</p>
  {/if}

  {#if model.awaitingPriority}
    <div class="panel" role="group" aria-label={t('board.priority.title')}>
      <div class="pair">
        {#each SIDES as side (side)}
          <button class="btn primary" type="button" onclick={() => onpriority(side)}>
            {t('board.priority.pick', { name: names[side] })}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if model.result}
    <div class="panel result" role="status">
      <strong>{t('board.result', { name: names[model.result.winner] })}</strong>
      <span>{t(`board.reason.${model.result.reason}`)}</span>
      {#if pending > 0}
        <span class="hint">{t('board.newBout.waiting', { count: pending })}</span>
      {/if}
      <button class="btn primary" type="button" disabled={pending > 0} onclick={onnewbout}>
        {t('board.newBout')}
      </button>
    </div>
  {/if}

  <div class="controls clock-row">
    {#if model.clockAction}
      <button
        class="btn clock-button {model.clockAction}"
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
      <button class="btn skip" type="button" onclick={onskipbreak}>{t('board.skipBreak')}</button>
    {/if}
  </div>

  <div class="controls">
    {#each PRESETS as minutes (minutes)}
      <button
        class="btn preset"
        type="button"
        disabled={model.clockAction === null}
        aria-label={t(`board.clock.preset.${minutes}` as 'board.clock.preset.3')}
        onclick={() => onpreset(minutes)}
      >
        {minutes}
      </button>
    {/each}
    <button class="btn" type="button" aria-label={t('board.undo')} disabled={!model.canUndo} onclick={onundo}>
      <Icon name="undo" />
    </button>
    {#if model.doubleTouch !== 'hidden'}
      <button
        class="btn"
        type="button"
        aria-label={t('board.double')}
        disabled={model.doubleTouch === 'disabled'}
        onclick={ondouble}
      >
        <span aria-hidden="true">×2</span>
      </button>
    {/if}
  </div>

  <!-- An overlay, so opening it never moves the scoring controls. -->
  {#if correctOpen}
    <CorrectionSheet
      {names}
      score={model.score}
      basis={model.correction}
      finished={model.result !== null}
      error={model.error}
      errorParams={model.errorParams}
      onsubmit={oncorrect}
      onclose={() => (correctOpen = false)}
    />
  {/if}

  {#if shownCard}
    <button
      class="card-screen"
      type="button"
      data-card={shownCard}
      aria-label={t('board.card.dismiss')}
      onclick={() => (shownCard = null)}
    ></button>
  {/if}
</section>

<style>
  .board {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    flex: 1;
    min-height: 0;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .phase {
    flex: 1;
    min-width: 0;
    text-align: center;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--accent);
  }
  .priority {
    font-weight: 700;
    font-size: 0.85rem;
  }
  .toggle {
    position: relative;
    gap: 0.4rem;
    padding-inline: 0.6rem;
    min-width: var(--tap);
    min-height: var(--tap);
  }
  .toggle-label {
    font-size: 0.85rem;
    font-weight: 700;
  }
  .toggle input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }
  .reset {
    border-style: dashed;
  }
  .note {
    margin: 0;
    color: var(--accent);
    font-weight: 700;
    font-size: 0.85rem;
  }
  .clock {
    text-align: center;
    font-size: clamp(2.6rem, 12vh, 5rem);
    font-weight: 800;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .clock[data-running='false'] {
    color: var(--muted);
  }
  .halves {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    flex: 1;
    min-height: 0;
  }
  .half {
    position: relative;
    display: flex;
    min-height: 0;
    color: #fff;
    border: 3px solid var(--fg);
    border-radius: 1rem;
    overflow: hidden;
  }
  .half.left {
    background: var(--side-left);
  }
  .half.right {
    background: var(--side-right);
  }
  .tap {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    /* Leaves room for the minus button on top and the card toggles at the bottom. */
    padding: 3.2rem 0.25rem 3.6rem;
    font: inherit;
    color: inherit;
    background: transparent;
    border: 0;
    cursor: pointer;
    touch-action: manipulation;
  }
  .tap:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .name {
    font-size: 0.95rem;
    font-weight: 700;
    overflow-wrap: anywhere;
    text-align: center;
  }
  .score {
    font-size: clamp(3.5rem, 20vw, 6rem);
    font-weight: 800;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .minus {
    position: absolute;
    top: 0.25rem;
    left: 0.25rem;
    font: inherit;
    font-size: 1.6rem;
    font-weight: 800;
    line-height: 1;
    color: #fff;
    background: rgb(0 0 0 / 0.35);
    border: 2px solid #fff;
    border-radius: 0.6rem;
    cursor: pointer;
  }
  .minus:disabled {
    opacity: 0.35;
  }
  .half > :global(.card-dot) {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
  }
  .cards {
    position: absolute;
    left: 0.25rem;
    right: 0.25rem;
    bottom: 0.25rem;
    display: flex;
    justify-content: center;
    gap: 0.3rem;
  }
  .card-screen {
    position: fixed;
    inset: 0;
    z-index: 20;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    cursor: pointer;
  }
  .card-screen[data-card='yellow'] {
    background: #ffd23f;
  }
  .card-screen[data-card='red'] {
    background: #e53935;
  }
  .card-screen[data-card='black'] {
    background: #000;
  }
  .card-toggle {
    flex: 1;
    max-width: 3.4rem;
    border: 2px solid #fff;
    border-radius: 0.5rem;
    cursor: pointer;
    opacity: 0.5;
  }
  .card-toggle[aria-pressed='true'] {
    opacity: 1;
    box-shadow: 0 0 0 3px #fff;
  }
  .card-toggle:disabled {
    cursor: not-allowed;
    opacity: 0.3;
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
  .controls {
    display: flex;
    gap: 0.4rem;
  }
  .controls .btn {
    padding-inline: 0;
    flex: 0 0 auto;
    min-width: var(--tap);
  }
  .clock-button {
    flex: 1 1 auto !important;
    min-height: 72px;
    font-size: 1.6rem;
  }
  .skip {
    flex: 1 1 auto !important;
    padding-inline: 0.75rem !important;
  }
  .clock-button.stop {
    background: var(--danger);
    border-color: var(--danger);
    color: var(--ink);
  }
  .clock-button.start {
    background: var(--ok);
    border-color: var(--ok);
    color: var(--ink);
  }
  /* Presets, undo and double share the second row evenly. */
  .controls:not(.clock-row) .btn {
    flex: 1 1 0;
  }
  /* Scales with the button's font-size and inherits its colour, like the character did. */
  .clock-icon svg {
    display: block;
    width: 1.15em;
    height: 1.15em;
  }
  .panel {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.4rem 0.75rem;
    padding: 0.5rem;
    border: 2px solid var(--accent);
    border-radius: 0.75rem;
    text-align: center;
  }
  .pair {
    display: flex;
    gap: 0.5rem;
    width: 100%;
  }
  .pair .btn {
    flex: 1;
  }
  .hint {
    color: var(--muted);
  }
</style>
