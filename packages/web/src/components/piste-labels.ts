import type { Card, Side } from '@la-sala/domain';
import { formatClock } from '../core/scoreboard-view';
import type { PisteView } from '../core/piste-view';
import { t } from '../i18n/t';

const CARDS: readonly Card[] = ['yellow', 'red', 'black'];

/** Status of the piste in words. A fencing clock that is not ticking reads "Detenido". */
export function phaseLabel(view: PisteView): string {
  if (view.phase === 'fencing') return t(view.running ? 'spectator.phase.running' : 'spectator.phase.stopped');
  return t(`spectator.phase.${view.phase}`);
}

/** The clock to show: the fencing clock, or the countdown of a break. Null when none applies. */
export function clockText(view: PisteView): string | null {
  const ms = view.remainingMs ?? view.breakRemainingMs;
  return ms === null ? null : formatClock(ms);
}

export function periodText(view: PisteView): string | null {
  return view.period === null ? null : t('spectator.period', { period: view.period, periods: view.periods });
}

/** "Ganador: Ana por límite de tocados", or null while the bout is not finished. */
export function winnerText(view: PisteView): string | null {
  if (view.winner === null || view.reason === null || view.fencers === null) return null;
  return `${t('board.result', { name: view.fencers[view.winner] })} ${t(`board.reason.${view.reason}`)}`;
}

/** One label per card type the fencer has received ("Amarilla ×2"); empty when none. */
export function cardLabels(view: PisteView, side: Side): string[] {
  return CARDS.filter((card) => view.cards[side][card] > 0).map((card) =>
    t(`spectator.card.${card}`, { count: view.cards[side][card] }),
  );
}
