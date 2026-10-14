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
  const onrename = vi.fn<(left: string, right: string) => boolean>(() => true);
  render(CorrectionSheet, {
    names: { left: 'Ana', right: 'Bea' },
    score: { left: 3, right: 2 },
    basis,
    finished: false,
    error: null,
    errorParams: {},
    onsubmit,
    onrename,
    onclose,
    ...overrides,
  });
  return { onsubmit, onrename, onclose };
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const type = (label: string | RegExp, value: string) =>
  fireEvent.input(screen.getByLabelText(label), { target: { value } });
const value = (label: string | RegExp) => (screen.getByLabelText(label) as HTMLInputElement).value;

afterEach(cleanup);

const apply = () => click('Aplicar cambios');

describe('CorrectionSheet: fencer names', () => {
  it('starts from the current names and renames without touching the clock', async () => {
    const { onrename, onsubmit, onclose } = mount();
    expect(value('Tirador izquierda')).toBe('Ana');
    expect(value('Tirador derecha')).toBe('Bea');
    await type('Tirador izquierda', '  Cris ');
    await apply();
    expect(onrename).toHaveBeenCalledWith('Cris', 'Bea');
    expect(onsubmit).not.toHaveBeenCalled();
    expect(onclose).toHaveBeenCalled();
  });

  it('applies a state change and a rename together', async () => {
    const { onrename, onsubmit, onclose } = mount();
    await type('Tocados de Ana', '5');
    await type('Tirador derecha', 'Dora');
    await apply();
    expect(onsubmit).toHaveBeenCalledExactlyOnceWith({ score: { left: 5, right: 2 } });
    expect(onrename).toHaveBeenCalledExactlyOnceWith('Ana', 'Dora');
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it('validates names like the setup form without calling the controller', async () => {
    const { onrename, onsubmit } = mount();
    await type('Tocados de Ana', '5');
    await type('Tirador izquierda', '   ');
    await type('Tirador derecha', 'x'.repeat(101));
    await apply();
    expect(onrename).not.toHaveBeenCalled();
    expect(onsubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Escribe el nombre.')).toBeTruthy();
    expect(screen.getByText('El nombre admite como máximo 100 caracteres.')).toBeTruthy();
  });

  it('keeps the sheet open and shows an error when the rename is refused', async () => {
    const { onclose } = mount({ onrename: () => false, error: 'names-invalid' });
    await type('Tirador izquierda', 'Cris');
    await apply();
    expect(onclose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent?.trim()).toBe('No se pudieron guardar los nombres.');
  });

  it('does not rename when the state change is refused', async () => {
    const { onrename, onclose } = mount({ onsubmit: () => false, error: 'state-set-invalid-score' });
    await type('Tocados de Ana', '5');
    await type('Tirador izquierda', 'Cris');
    await apply();
    expect(onrename).not.toHaveBeenCalled();
    expect(onclose).not.toHaveBeenCalled();
  });
});

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

  it('applies straight away and only the fields that changed', async () => {
    const { onsubmit, onclose } = mount();
    await type('Tocados de Ana', '5');
    await apply();
    expect(onsubmit).toHaveBeenCalledExactlyOnceWith({ score: { left: 5, right: 2 } });
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it('converts minutes and seconds to milliseconds and sends the period', async () => {
    const { onsubmit } = mount();
    await type('Minutos', '2');
    await type('Segundos', '5');
    await type(/^Periodo/, '3');
    await apply();
    expect(onsubmit).toHaveBeenCalledWith({ remainingMs: 125_000, period: 3 });
  });

  it('never sends an empty patch', async () => {
    const { onsubmit, onrename, onclose } = mount();
    await apply();
    expect(screen.getByText('No has cambiado nada.')).toBeTruthy();
    expect(onsubmit).not.toHaveBeenCalled();
    expect(onrename).not.toHaveBeenCalled();
    expect(onclose).not.toHaveBeenCalled();
  });

  it('reset clock only fills the full period duration until applied', async () => {
    const { onsubmit } = mount();
    await click('Reiniciar reloj');
    expect(value('Minutos')).toBe('3');
    expect(value('Segundos')).toBe('0');
    expect(onsubmit).not.toHaveBeenCalled();
    await apply();
    expect(onsubmit).toHaveBeenCalledWith({ remainingMs: 180_000 });
  });

  it('reset clock in the extra period uses the extra period duration', async () => {
    const { onsubmit } = mount({ basis: { ...basis, remainingMs: 20_000, inExtraPeriod: true } });
    await click('Reiniciar reloj');
    await apply();
    expect(onsubmit).toHaveBeenCalledWith({ remainingMs: 60_000 });
  });

  it('reset scores only fills 0-0 until applied', async () => {
    const { onsubmit } = mount();
    await click('Marcador a 0-0');
    expect(value('Tocados de Ana')).toBe('0');
    expect(value('Tocados de Bea')).toBe('0');
    expect(onsubmit).not.toHaveBeenCalled();
    await apply();
    expect(onsubmit).toHaveBeenCalledWith({ score: { left: 0, right: 0 } });
  });

  it('clear cards is a toggle that sends only clearCards when applied', async () => {
    const { onsubmit } = mount();
    const button = screen.getByRole('button', { name: 'Quitar tarjetas' });
    await fireEvent.click(button);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(onsubmit).not.toHaveBeenCalled();
    await apply();
    expect(onsubmit).toHaveBeenCalledWith({ clearCards: true });
  });

  it('clear cards can be switched off again before applying', async () => {
    const { onsubmit } = mount();
    await click('Quitar tarjetas');
    await click('Quitar tarjetas');
    await apply();
    expect(onsubmit).not.toHaveBeenCalled();
    expect(screen.getByText('No has cambiado nada.')).toBeTruthy();
  });

  it('says that applying reopens a finished bout, and only then', async () => {
    mount({ finished: true });
    expect(screen.queryByText(/lo reabre/)).toBeNull();
    await click('Marcador a 0-0');
    expect(screen.getByText('El combate ya terminó: aplicar estos cambios lo reabre.')).toBeTruthy();
    cleanup();

    mount();
    await click('Marcador a 0-0');
    expect(screen.queryByText(/lo reabre/)).toBeNull();
  });

  it('closes on the close button without dispatching', async () => {
    const { onclose, onsubmit } = mount();
    await click('Cerrar corrección');
    expect(onclose).toHaveBeenCalledTimes(1);
    expect(onsubmit).not.toHaveBeenCalled();
  });

  it('shows a specific alert for a refused correction and keeps the sheet open', async () => {
    const onsubmit = vi.fn(() => false);
    const { onclose } = mount({ onsubmit, error: 'state-set-invalid-remaining', errorParams: { maxMs: 180_000 } });
    expect(screen.queryByRole('alert')).toBeNull();

    await type('Minutos', '9');
    await apply();
    expect(screen.getByRole('alert').textContent?.trim()).toBe('El tiempo debe estar entre 0:00 y 3:00.');
    expect(onclose).not.toHaveBeenCalled();
    expect(value('Minutos')).toBe('9');
  });

  it.each([
    ['Minutos', '', 'El tiempo debe estar entre 0:00 y 3:00.'],
    ['Segundos', '', 'El tiempo debe estar entre 0:00 y 3:00.'],
    [/^Periodo/, '', 'El periodo debe estar entre 1 y 3.'],
    ['Tocados de Ana', 'x', 'Los tocados deben ser números enteros, de 0 en adelante.'],
  ])('blocks applying while %s is blank or not a number', async (label, input, text) => {
    const { onsubmit, onclose } = mount();
    await type(label, input);
    await apply();
    expect(screen.getByRole('alert').textContent?.trim()).toBe(text);
    expect(onsubmit).not.toHaveBeenCalled();
    expect(onclose).not.toHaveBeenCalled();
  });

  it('drops the blocked message once the field is valid again', async () => {
    const { onsubmit } = mount();
    await type('Minutos', '');
    await apply();
    expect(screen.getByRole('alert')).toBeTruthy();
    await type('Minutos', '2');
    await apply();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onsubmit).toHaveBeenCalledWith({ remainingMs: 155_000 });
  });

  it.each([
    ['state-set-invalid-score', {}, 'Los tocados deben ser números enteros, de 0 en adelante.'],
    ['state-set-invalid-period', { periods: 3 }, 'El periodo debe estar entre 1 y 3.'],
    ['state-set-needs-time', {}, 'Indica el tiempo que queda para reabrir el combate.'],
  ])('explains %s', async (error, errorParams, text) => {
    mount({ onsubmit: () => false, error, errorParams });
    await type('Tocados de Ana', '4');
    await apply();
    expect(screen.getByRole('alert').textContent?.trim()).toBe(text);
  });
});
