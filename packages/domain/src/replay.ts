import { apply, type BoutEvent, type DomainError, type Result } from './apply';
import type { BoutState } from './bout';

export interface ReplayError {
  /** Position of the failing event in the replayed list. */
  readonly index: number;
  readonly error: DomainError;
}

/**
 * Folds events over an initial state. `undo` pops back to the state before the previous
 * applied event (no redo). Stops at the first failing event.
 */
export function replay(
  initial: BoutState,
  events: readonly BoutEvent[],
): Result<BoutState, ReplayError> {
  const history: BoutState[] = [initial];
  const top = (): BoutState => history[history.length - 1] ?? initial;

  for (const [index, event] of events.entries()) {
    const current = top();
    if (event.type === 'undo') {
      if (current.lastAt !== null && event.at < current.lastAt) {
        return {
          ok: false,
          error: { index, error: { type: 'time-went-backwards', lastAt: current.lastAt, at: event.at } },
        };
      }
      if (history.length === 1) {
        return { ok: false, error: { index, error: { type: 'nothing-to-undo' } } };
      }
      history.pop();
      continue;
    }
    const result = apply(current, event);
    if (!result.ok) return { ok: false, error: { index, error: result.error } };
    history.push(result.state);
  }
  return { ok: true, state: top() };
}
