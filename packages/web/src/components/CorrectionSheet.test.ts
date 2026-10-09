// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { StateSetPatch } from '@la-sala/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CorrectionBasis } from '../core/scoreboard-view';
import CorrectionSheet from './CorrectionSheet.svelte';

const basis: CorrectionBasis = {
  period: 2,
  periods: 3,
  remainingMs: 95_000,
  periodDurationMs: 180_000,
  extraPeriodDurationMs: 60_000,
  inExtraPeriod: false,
};

function mount(overrides: Record<string, unknown> = {}) {
  const onsubmit = vi.fn<(patch: StateSetPatch) => boolean>(() => true);
  const onclose = vi.fn();
  render(CorrectionSheet, {
    names: { left: 'Ana', right: 'Bea' },
    score: { left: 3, right: 2 },
    basis,
    finished: false,
    error: null,
    errorParams: {},
    onsubmit,
    onclose,
    ...overrides,
  });
  return { onsubmit, onclose };
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const type = (label: string | RegExp, value: string) =>
  fireEvent.input(screen.getByLabelText(label), { target: { value } });
const value = (label: string | RegExp) => (screen.getByLabelText(label) as HTMLInputElement).value;

afterEach(cleanup);

describe('CorrectionSheet', () => {
  it('starts from the current state, with numeric inputs', () => {
    mount();
    expect(value('Tocados de Ana')).toBe('3');
    expect(value('Tocados de Bea')).toBe('2');
    expect(value('Minutos')).toBe('1');
    expect(value('Segundos')).toBe('35');
    expect(value(/^Periodo/)).toBe('2');
    expect(screen.getByLabelText('Minutos').getAttribute('inputmode')).toBe('numeric');
  });

  it('has no period field when the rules have a single period', () => {
    mount({ basis: { ...basis, period: 1, periods: 1 } });
    expect(screen.queryByLabelText(/^Periodo/)).toBeNull();
  });

  it('sends nothing before the confirmation and only the fields that changed', async () => {
    const { onsubmit } = mount();
    await type('Tocados de Ana', '5');
    await click('Revisar cambios');
    expect(onsubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Se va a cambiar el marcador a Ana 5 - 2 Bea.')).toBeTruthy();

    await click('Sí, aplicar el cambio');
    expect(onsubmit).toHaveBeenCalledExactlyOnceWith({ score: { left: 5, right: 2 } });
  });

  it('converts minutes and seconds to milliseconds and sends the period', async () => {
    const { onsubmit } = mount();
    await type('Minutos', '2');
    await type('Segundos', '5');
    await type(/^Periodo/, '3');
    await click('Revisar cambios');
    expect(screen.getByText('Se va a cambiar el reloj a 2:05, el periodo a 3.')).toBeTruthy();
    await click('Sí, aplicar el cambio');
    expect(onsubmit).toHaveBeenCalledWith({ remainingMs: 125_000, period: 3 });
  });

  it('never sends an empty patch', async () => {
    const { onsubmit } = mount();
    await click('Revisar cambios');
    expect(screen.getByText('No has cambiado nada.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sí, aplicar el cambio' })).toBeNull();
    expect(onsubmit).not.toHaveBeenCalled();
  });

  it('reset clock asks to confirm the full period duration', async () => {
    const { onsubmit } = mount();
    await click('Reiniciar reloj');
    expect(screen.getByText('Se va a cambiar el reloj a 3:00.')).toBeTruthy();
    await click('Sí, aplicar el cambio');
    expect(onsubmit).toHaveBeenCalledWith({ remainingMs: 180_000 });
  });

  it('reset clock in the extra period uses the extra period duration', async () => {
    const { onsubmit } = mount({ basis: { ...basis, remainingMs: 20_000, inExtraPeriod: true } });
    await click('Reiniciar reloj');
    await click('Sí, aplicar el cambio');
    expect(onsubmit).toHaveBeenCalledWith({ remainingMs: 60_000 });
  });

  it('reset scores asks to confirm 0-0', async () => {
    const { onsubmit } = mount();
    await click('Marcador a 0-0');
    expect(screen.getByText('Se va a cambiar el marcador a Ana 0 - 0 Bea.')).toBeTruthy();
    await click('Sí, aplicar el cambio');
    expect(onsubmit).toHaveBeenCalledWith({ score: { left: 0, right: 0 } });
  });

  it('says that applying reopens a finished bout, and only then', async () => {
    mount({ finished: true });
    await click('Marcador a 0-0');
    expect(screen.getByText('El combate ya terminó: esto lo reabre.')).toBeTruthy();
    cleanup();

    mount();
    await click('Marcador a 0-0');
    expect(screen.queryByText('El combate ya terminó: esto lo reabre.')).toBeNull();
  });

  it('can go back from the confirmation without dispatching', async () => {
    const { onsubmit } = mount();
    await click('Marcador a 0-0');
    await click('Volver');
    expect(screen.getByLabelText('Tocados de Ana')).toBeTruthy();
    expect(onsubmit).not.toHaveBeenCalled();
  });

  it('closes after an accepted correction and on cancel', async () => {
    const { onclose } = mount();
    await click('Cerrar corrección');
    expect(onclose).toHaveBeenCalledTimes(1);
    await click('Marcador a 0-0');
    await click('Sí, aplicar el cambio');
    expect(onclose).toHaveBeenCalledTimes(2);
  });

  it('shows a specific alert for a refused correction and keeps the sheet open', async () => {
    const onsubmit = vi.fn(() => false);
    const { onclose } = mount({ onsubmit, error: 'state-set-invalid-remaining', errorParams: { maxMs: 180_000 } });
    expect(screen.queryByRole('alert')).toBeNull();

    await type('Minutos', '9');
    await click('Revisar cambios');
    await click('Sí, aplicar el cambio');
    expect(screen.getByRole('alert').textContent?.trim()).toBe('El tiempo debe estar entre 0:00 y 3:00.');
    expect(onclose).not.toHaveBeenCalled();
    expect(value('Minutos')).toBe('9');
  });

  it('blocks the review while the minutes are blank, without reaching the confirmation', async () => {
    const { onsubmit } = mount();
    await type('Minutos', '');
    await click('Revisar cambios');
    expect(screen.getByRole('alert').textContent?.trim()).toBe('El tiempo debe estar entre 0:00 y 3:00.');
    expect(screen.queryByRole('button', { name: 'Sí, aplicar el cambio' })).toBeNull();
    expect(onsubmit).not.toHaveBeenCalled();
  });

  it('blocks the review while the seconds are blank', async () => {
    const { onsubmit } = mount();
    await type('Segundos', '');
    await click('Revisar cambios');
    expect(screen.getByRole('alert').textContent?.trim()).toBe('El tiempo debe estar entre 0:00 y 3:00.');
    expect(screen.queryByRole('button', { name: 'Sí, aplicar el cambio' })).toBeNull();
    expect(onsubmit).not.toHaveBeenCalled();
  });

  it('blocks the review while the period is blank', async () => {
    const { onsubmit } = mount();
    await type(/^Periodo/, '');
    await click('Revisar cambios');
    expect(screen.getByRole('alert').textContent?.trim()).toBe('El periodo debe estar entre 1 y 3.');
    expect(screen.queryByRole('button', { name: 'Sí, aplicar el cambio' })).toBeNull();
    expect(onsubmit).not.toHaveBeenCalled();
  });

  it('blocks the review while a score is not a number', async () => {
    const { onsubmit } = mount();
    await type('Tocados de Ana', 'x');
    await click('Revisar cambios');
    expect(screen.getByRole('alert').textContent?.trim()).toBe('Los tocados deben ser números enteros, de 0 en adelante.');
    expect(screen.queryByRole('button', { name: 'Sí, aplicar el cambio' })).toBeNull();
    expect(onsubmit).not.toHaveBeenCalled();
  });

  it('drops the blocked message once the field is valid again', async () => {
    mount();
    await type('Minutos', '');
    await click('Revisar cambios');
    expect(screen.getByRole('alert')).toBeTruthy();
    await type('Minutos', '2');
    await click('Revisar cambios');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Se va a cambiar el reloj a 2:35.')).toBeTruthy();
  });

  it('reset clock says the clock is already there when nothing would change', async () => {
    const { onsubmit } = mount({ basis: { ...basis, remainingMs: 180_000 } });
    await click('Reiniciar reloj');
    expect(screen.getByText('El reloj ya está en 3:00.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sí, aplicar el cambio' })).toBeNull();
    expect(onsubmit).not.toHaveBeenCalled();
  });

  it('reset scores says the score is already there when nothing would change', async () => {
    const { onsubmit } = mount({ score: { left: 0, right: 0 } });
    await click('Marcador a 0-0');
    expect(screen.getByText('El marcador ya está 0-0.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sí, aplicar el cambio' })).toBeNull();
    expect(onsubmit).not.toHaveBeenCalled();
  });

  it.each([
    ['state-set-invalid-score', {}, 'Los tocados deben ser números enteros, de 0 en adelante.'],
    ['state-set-invalid-period', { periods: 3 }, 'El periodo debe estar entre 1 y 3.'],
    ['state-set-needs-time', {}, 'Indica el tiempo que queda para reabrir el combate.'],
  ])('explains %s', async (error, errorParams, text) => {
    mount({ onsubmit: () => false, error, errorParams });
    await type('Tocados de Ana', '4');
    await click('Revisar cambios');
    await click('Sí, aplicar el cambio');
    expect(screen.getByRole('alert').textContent?.trim()).toBe(text);
  });
});
