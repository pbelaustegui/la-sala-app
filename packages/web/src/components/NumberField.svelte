<script lang="ts">
  import { t } from '../i18n/t';

  let {
    label,
    value = $bindable(),
    min = 0,
    max = Number.MAX_SAFE_INTEGER,
    hint,
    error,
  }: {
    label: string;
    /** Digits only; a blank field is allowed so the form can tell "empty" from "zero". */
    value: string;
    min?: number;
    max?: number;
    hint?: string;
    error?: string;
  } = $props();

  const labelId = $props.id();

  const current = $derived(value.trim() === '' ? Number.NaN : Number(value));
  const atMin = $derived(current <= min);
  const atMax = $derived(current >= max);

  function nudge(delta: 1 | -1): void {
    const base = Number.isNaN(current) ? min - (delta === 1 ? 1 : 0) : current;
    value = String(Math.min(max, Math.max(min, base + delta)));
  }

  function keepDigits(event: Event & { currentTarget: HTMLInputElement }): void {
    const digits = event.currentTarget.value.replace(/\D/g, '');
    event.currentTarget.value = digits;
    value = digits;
  }
</script>

<div class="field">
  <span id={labelId}>{label}</span>
  <div class="stepper">
    <button class="btn" type="button" aria-label={t('number.decrease', { field: label })} disabled={atMin} onclick={() => nudge(-1)}>−</button>
    <input
      type="text"
      inputmode="numeric"
      autocomplete="off"
      aria-labelledby={labelId}
      aria-invalid={error ? 'true' : undefined}
      {value}
      oninput={keepDigits}
    />
    <button class="btn" type="button" aria-label={t('number.increase', { field: label })} disabled={atMax} onclick={() => nudge(1)}>+</button>
  </div>
  {#if hint}<small>{hint}</small>{/if}
  {#if error}<span class="error" role="alert">{error}</span>{/if}
</div>

<style>
  .stepper {
    display: grid;
    grid-template-columns: var(--tap) minmax(0, 1fr) var(--tap);
    gap: 0.4rem;
  }
  .stepper .btn {
    padding: 0;
    font-size: 1.5rem;
    line-height: 1;
  }
  small {
    font-size: 0.8rem;
  }
  .stepper input {
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
</style>
