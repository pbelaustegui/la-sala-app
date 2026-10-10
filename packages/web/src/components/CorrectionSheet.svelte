<script lang="ts">
  import type { Side, StateSetPatch } from '@la-sala/domain';
  import type { ScoreboardModel } from '../controllers/scoreboard-controller';
  import type { CorrectionBasis } from '../core/scoreboard-view';
  import { formatClock } from '../core/scoreboard-view';
  import { t, type CopyKey } from '../i18n/t';

  let {
    names,
    score,
    basis,
    finished,
    error,
    errorParams,
    onsubmit,
    onclose,
    mirrored = false,
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
    onclose: () => void;
    /** Show the right-hand fencer first (judge facing the audience). */
    mirrored?: boolean;
  } = $props();

  const SIDES = $derived<readonly Side[]>(mirrored ? ['right', 'left'] : ['left', 'right']);

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

  function confirm(): void {
    if (onsubmit(buildPatch())) {
      onclose();
      return;
    }
    attempted = true;
    step = 'form';
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
  <h2>{t('board.correct.title')}</h2>

  {#if step === 'form'}
    <p class="hint">{t('board.correct.hint')}</p>

    <div class="actions quick">
      <button class="btn" type="button" onclick={resetClock}>{t('board.correct.resetClock')}</button>
      <button class="btn" type="button" onclick={resetScores}>{t('board.correct.resetScores')}</button>
    </div>

    <div class="scores">
      {#each SIDES as side (side)}
        <label class="field">
          <span>{t('board.correct.score', { name: names[side] })}</span>
          <input type="text" inputmode="numeric" autocomplete="off" bind:value={fields[side]} />
        </label>
      {/each}
    </div>

    <div class="time">
      <label class="field">
        <span>{t('board.correct.minutes')}</span>
        <input type="text" inputmode="numeric" autocomplete="off" bind:value={fields.minutes} />
      </label>
      <label class="field">
        <span>{t('board.correct.seconds')}</span>
        <input type="text" inputmode="numeric" autocomplete="off" bind:value={fields.seconds} />
      </label>
    </div>

    {#if basis.periods > 1}
      <label class="field">
        <span>{t('board.correct.period', { periods: basis.periods })}</span>
        <input type="text" inputmode="numeric" autocomplete="off" bind:value={fields.period} />
      </label>
    {/if}

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
      <button class="btn" type="button" onclick={onclose}>{t('board.correct.close')}</button>
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
      <button class="btn" type="button" onclick={() => (step = 'form')}>{t('board.correct.back')}</button>
    </div>
  {/if}
</div>

<style>
  .sheet {
    padding: 0.75rem;
    border: 2px solid var(--muted);
    border-radius: 0.75rem;
    background: #141b36;
  }
  h2 {
    margin: 0 0 0.25rem;
    font-size: 1.25rem;
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
  .field input {
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
  }
  .quick {
    margin-top: 0;
  }
</style>
