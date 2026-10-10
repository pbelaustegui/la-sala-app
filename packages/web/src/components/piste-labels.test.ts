import { describe, expect, it } from 'vitest';
import type { PisteView } from '../core/piste-view';
import { cardChips, cardLabels, clockText, periodText, phaseLabel, winnerText } from './piste-labels';

const base: PisteView = {
  pisteId: '1',
  phase: 'fencing',
  fencers: { left: 'Ana', right: 'Bea' },
  score: { left: 0, right: 0 },
  remainingMs: 125_000,
  running: true,
  facingAudience: false,
  period: 2,
  periods: 3,
  breakRemainingMs: null,
  priority: null,
  winner: null,
  reason: null,
  cards: { left: { yellow: 0, red: 0, black: 0 }, right: { yellow: 2, red: 0, black: 1 } },
  stale: false,
};

describe('piste labels', () => {
  it('names the phase and tells a stopped fencing clock apart from a running one', () => {
    expect(phaseLabel(base)).toBe('En juego');
    expect(phaseLabel({ ...base, running: false })).toBe('Detenido');
    expect(phaseLabel({ ...base, phase: 'idle' })).toBe('Sin combate');
    expect(phaseLabel({ ...base, phase: 'break' })).toBe('Descanso');
    expect(phaseLabel({ ...base, phase: 'priority-draw' })).toBe('Sorteo de prioridad');
    expect(phaseLabel({ ...base, phase: 'finished' })).toBe('Finalizado');
  });

  it('shows the fencing clock, a break countdown or nothing', () => {
    expect(clockText(base)).toBe('2:05');
    expect(clockText({ ...base, phase: 'break', remainingMs: null, breakRemainingMs: 30_000 })).toBe('0:30');
    expect(clockText({ ...base, phase: 'finished', remainingMs: null })).toBeNull();
  });

  it('words the period and the winner', () => {
    expect(periodText(base)).toBe('Período 2 de 3');
    expect(periodText({ ...base, period: null })).toBeNull();
    expect(winnerText(base)).toBeNull();
    expect(winnerText({ ...base, phase: 'finished', winner: 'right', reason: 'time' })).toBe('Ganador: Bea por tiempo');
  });

  it('lists only the cards a fencer has', () => {
    expect(cardLabels(base, 'left')).toEqual([]);
    expect(cardLabels(base, 'right')).toEqual(['Amarilla ×2', 'Negra ×1']);
  });
});

describe('cardChips', () => {
  it('labels only the card types with a count', () => {
    expect(cardChips({ yellow: 2, red: 0, black: 1 })).toEqual(['Amarilla ×2', 'Negra ×1']);
    expect(cardChips({ yellow: 0, red: 0, black: 0 })).toEqual([]);
  });
});
