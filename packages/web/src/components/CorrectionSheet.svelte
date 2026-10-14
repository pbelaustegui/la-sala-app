<script lang="ts">
  import type { Side, StateSetPatch } from '@la-sala/domain';
  import type { ScoreboardModel } from '../controllers/scoreboard-controller';
  import type { CorrectionBasis } from '../core/scoreboard-view';
  import { formatClock } from '../core/scoreboard-view';
  import { nameError } from '../core/setup-form';
  import { t, type CopyKey } from '../i18n/t';
  import Icon from './Icon.svelte';
  import NumberField from './NumberField.svelte';

  let {
    names,
    score,
    basis,
    finished,
    error,
    errorParams,
    onsubmit,
    onrename,
    onclose,
  }: {
    names: Readonly<Record<Side, string>>;
    score: Readonly<Record<Side, number>>;
    basis: CorrectionBasis;
    /** The bout is over: applying a correction reopens it. */
    finished: boolean;
    error: ScoreboardModel['error'];
    errorParams: ScoreboardModel['errorParams'];
    /** Returns whether the domain accepted the correction. */
    onsubmit: (patch: StateSetPatch) => boolean;
    /** Renames the fencers without touching the clock. Returns whether the domain accepted it. */
    onrename: (left: string, right: string) => boolean;
    onclose: () => void;
  } = $props();

  const SIDES: readonly Side[] = ['left', 'right'];

  // The sheet is mounted when opened, so the form starts from the state at that moment.
  // svelte-ignore state_referenced_locally
  const seconds = Math.ceil(basis.remainingMs / 1000);
  // svelte-ignore state_referenced_locally
  const initial = {
    left: String(score.left),
    right: String(score.right),
    minutes: String(Math.floor(seconds / 60)),
    seconds: String(seconds % 60),
    period: String(basis.period),
  };

  let fields = $state({ ...initial });
  let clearCards = $state(false);
  let step = $state<'form' | 'confirm'>('form');
  let attempted = $state(false);
  let notice = $state<'none' | 'no-changes' | 'clock-current' | 'score-current'>('none');
  /** A changed group has a field the form cannot even express: block before confirming. */
  let blocked = $state<{ key: CopyKey; params: Record<string, string | number> } | null>(null);

  const scoreChanged = $derived(fields.left !== initial.left || fields.right !== initial.right);
  const clockChanged = $derived(fields.minutes !== initial.minutes || fields.seconds !== initial.seconds);
  const periodChanged = $derived(basis.periods > 1 && fields.period !== initial.period);

  const num = (text: string): number => (text.trim() === '' ? Number.NaN : Number(text));

  function buildPatch(): StateSetPatch {
    return {
      ...(scoreChanged && { score: { left: num(fields.left), right: num(fields.right) } }),
      ...(clockChanged && { remainingMs: (num(fields.minutes) * 60 + num(fields.seconds)) * 1000 }),
      ...(periodChanged && { period: num(fields.period) }),
      ...(clearCards && { clearCards: true as const }),
    };
  }

  const timeText = $derived(`${fields.minutes.trim()}:${fields.seconds.trim().padStart(2, '0')}`);
  const changes = $derived(
    [
      scoreChanged &&
        t('board.correct.change.score', {
          left: names.left,
          leftScore: fields.left.trim(),
          rightScore: fields.right.trim(),
          right: names.right,
        }),
      clockChanged && t('board.correct.change.clock', { time: timeText }),
      periodChanged && t('board.correct.change.period', { period: fields.period.trim() }),
      clearCards && t('board.correct.change.cards'),
    ]
      .filter((part): part is string => part !== false)
      .join(', '),
  );

  /** Full duration of the period the clock would be reset in. */
  const fullDurationMs = $derived(
    basis.inExtraPeriod && !periodChanged ? basis.extraPeriodDurationMs : basis.periodDurationMs,
  );

  const DIGITS = /^\d+$/;

  /**
   * The first changed group with a blank or non-numeric field, in the order the domain
   * validates them. Only expressibility is checked here: ranges stay with the domain.
   */
  function blockedField(): { key: CopyKey; params: Record<string, string | number> } | null {
    if (scoreChanged && (!DIGITS.test(fields.left.trim()) || !DIGITS.test(fields.right.trim()))) {
      return { key: 'board.correct.error.score', params: {} };
    }
    if (periodChanged && !DIGITS.test(fields.period.trim())) {
      return { key: 'board.correct.error.period', params: { periods: basis.periods } };
    }
    if (clockChanged && (!DIGITS.test(fields.minutes.trim()) || !DIGITS.test(fields.seconds.trim()))) {
      return { key: 'board.correct.error.remaining', params: { max: formatClock(fullDurationMs) } };
    }
    return null;
  }

  function review(): void {
    attempted = false;
    if (Object.keys(buildPatch()).length === 0) {
      blocked = null;
      notice = 'no-changes';
      return;
    }
    const problem = blockedField();
    if (problem !== null) {
      blocked = problem;
      notice = 'none';
      return;
    }
    blocked = null;
    notice = 'none';
    step = 'confirm';
  }

  function resetClock(): void {
    const total = Math.ceil(fullDurationMs / 1000);
    fields.minutes = String(Math.floor(total / 60));
    fields.seconds = String(total % 60);
    if (Object.keys(buildPatch()).length === 0) {
      attempted = false;
      blocked = null;
      notice = 'clock-current';
      return;
    }
    review();
  }

  function resetScores(): void {
    fields.left = '0';
    fields.right = '0';
    if (Object.keys(buildPatch()).length === 0) {
      attempted = false;
      blocked = null;
      notice = 'score-current';
      return;
    }
    review();
  }

  function clearAllCards(): void {
    clearCards = true;
    review();
    // Only the confirmation step keeps it pending; a blocked form must not carry it silently.
    if (step === 'form') clearCards = false;
  }

  function back(): void {
    clearCards = false;
    step = 'form';
  }

  function confirm(): void {
    if (onsubmit(buildPatch())) {
      onclose();
      return;
    }
    attempted = true;
    clearCards = false;
    step = 'form';
  }

  // Names are saved on their own: they never stop the clock nor reopen a finished bout.
  // svelte-ignore state_referenced_locally
  let nameFields = $state({ left: names.left, right: names.right });
  let nameState = $state<'idle' | 'unchanged' | 'refused'>('idle');
  const nameErrors = $derived({
    left: nameError(nameFields.left),
    right: nameError(nameFields.right),
  });
  let nameAttempted = $state(false);

  function saveNames(): void {
    nameAttempted = true;
    nameState = 'idle';
    if (nameErrors.left !== null || nameErrors.right !== null) return;
    const left = nameFields.left.trim();
    const right = nameFields.right.trim();
    if (left === names.left && right === names.right) {
      nameState = 'unchanged';
      return;
    }
    if (onrename(left, right)) {
      onclose();
      return;
    }
    nameState = 'refused';
  }

  const ERROR_KEYS: Partial<Record<NonNullable<ScoreboardModel['error']>, CopyKey>> = {
    'state-set-empty': 'board.correct.error.empty',
    'state-set-invalid-score': 'board.correct.error.score',
    'state-set-invalid-remaining': 'board.correct.error.remaining',
    'state-set-invalid-period': 'board.correct.error.period',
    'state-set-needs-time': 'board.correct.error.needsTime',
  };
  const errorKey = $derived(attempted && error !== null ? (ERROR_KEYS[error] ?? 'board.error') : null);
</script>

<div class="sheet" role="group" aria-label={t('board.correct.title')}>
  <div class="top">
    <h2>{t('board.correct.title')}</h2>
    {#if step === 'form'}
      <button class="icon" type="button" aria-label={t('board.correct.close')} title={t('board.correct.close')} onclick={onclose}>
        <Icon name="x" />
      </button>
    {:else}
      <button class="icon" type="button" aria-label={t('board.correct.back')} title={t('board.correct.back')} onclick={back}>
        <Icon name="arrow-left" />
      </button>
    {/if}
  </div>

  {#if step === 'form'}
    <p class="hint">{t('board.correct.hint')}</p>

    <div class="tools quick">
      <button class="icon" type="button" aria-label={t('board.correct.resetClock')} title={t('board.correct.resetClock')} onclick={resetClock}>
        <Icon name="clock" />
      </button>
      <button class="icon" type="button" aria-label={t('board.correct.resetScores')} title={t('board.correct.resetScores')} onclick={resetScores}>
        <Icon name="scores" />
      </button>
      <button class="icon" type="button" aria-label={t('board.correct.clearCards')} title={t('board.correct.clearCards')} onclick={clearAllCards}>
        <Icon name="cards" />
      </button>
    </div>

    <div class="scores">
      {#each SIDES as side (side)}
        <NumberField label={t('board.correct.score', { name: names[side] })} bind:value={fields[side]} />
      {/each}
    </div>

    <div class="time">
      <NumberField label={t('board.correct.minutes')} bind:value={fields.minutes} />
      <NumberField label={t('board.correct.seconds')} bind:value={fields.seconds} max={59} />
    </div>

    {#if basis.periods > 1}
      <NumberField label={t('board.correct.period', { periods: basis.periods })} bind:value={fields.period} min={1} max={basis.periods} />
    {/if}

    <fieldset class="names">
      <legend>{t('board.correct.names.heading')}</legend>
      {#each SIDES as side (side)}
        <label class="field">
          <span>{t(side === 'left' ? 'setup.left' : 'setup.right')}</span>
          <input type="text" autocomplete="off" bind:value={nameFields[side]} />
          {#if nameAttempted && nameErrors[side]}
            <small class="error" role="alert">{t(nameErrors[side])}</small>
          {/if}
        </label>
      {/each}
      {#if nameState === 'unchanged'}
        <p class="hint">{t('board.correct.noChanges')}</p>
      {:else if nameState === 'refused'}
        <p class="error" role="alert">{t('board.correct.error.names')}</p>
      {/if}
      <button class="btn" type="button" onclick={saveNames}>{t('board.correct.names.save')}</button>
    </fieldset>

    {#if blocked !== null}
      <p class="error" role="alert">{t(blocked.key, blocked.params)}</p>
    {:else if errorKey}
      <p class="error" role="alert">
        {t(errorKey, { ...errorParams, max: formatClock(errorParams.maxMs ?? 0) })}
      </p>
    {/if}
    {#if notice === 'no-changes'}
      <p class="hint">{t('board.correct.noChanges')}</p>
    {:else if notice === 'clock-current'}
      <p class="hint">{t('board.correct.clockCurrent', { time: formatClock(fullDurationMs) })}</p>
    {:else if notice === 'score-current'}
      <p class="hint">{t('board.correct.scoreCurrent', { score: '0-0' })}</p>
    {/if}

    <div class="actions">
      <button class="btn primary" type="button" onclick={review}>{t('board.correct.review')}</button>
    </div>
  {:else}
    <div class="notice" role="status">
      <p>{t('board.correct.confirm', { changes })}</p>
      <p>{t('board.correct.confirm.stopped')}</p>
      {#if finished}
        <p><strong>{t('board.correct.confirm.reopens')}</strong></p>
      {/if}
    </div>
    <div class="actions">
      <button class="btn primary" type="button" onclick={confirm}>{t('board.correct.apply')}</button>
    </div>
  {/if}
</div>

<style>
  /* A full-screen overlay: opening it never pushes the scoreboard around. */
  .sheet {
    position: fixed;
    inset: 0;
    z-index: 20;
    box-sizing: border-box;
    overflow-y: auto;
    padding: 0.75rem max(1rem, env(safe-area-inset-right)) 0.75rem max(1rem, env(safe-area-inset-left));
    background: var(--surface-2);
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  h2 {
    margin: 0;
    font-size: 1.15rem;
  }
  .hint {
    margin: 0 0 0.5rem;
    color: var(--muted);
  }
  .scores,
  .time {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .names .field input {
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
  }
  .names {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    margin: 0.5rem 0 0;
    padding: 0;
    border: 0;
  }
  .names legend,
  .names p,
  .names button {
    grid-column: 1 / -1;
  }
  .quick {
    margin-top: 0.25rem;
  }
</style>
