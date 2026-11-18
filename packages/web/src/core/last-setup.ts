import type { Weapon } from '@la-sala/domain';
import type { BoutSetup } from './local-bout';
import { EMPTY_SETUP_FORM, type SetupForm } from './setup-form';
import type { KeyValueStorage } from './storage';

const PREFIX = 'la-sala:v1:last-setup:';
const WEAPONS: readonly Weapon[] = ['foil', 'epee', 'sabre'];
const PERIODS = [1, 2, 3] as const;

interface Remembered {
  readonly weapon: Weapon;
  readonly periods: 1 | 2 | 3;
  readonly touchLimit: number;
}

/**
 * Remembers, per piste and on this device, the format of the last bout started there, so the
 * next setup form opens with the same weapon, periods and touch limit. Names are never kept.
 */
export class LastSetupStore {
  constructor(private readonly storage: KeyValueStorage) {}

  /** The form to start from: the remembered format, or the empty form when nothing valid is stored. */
  defaults(pisteId: string): SetupForm {
    const remembered = parse(this.storage.get(PREFIX + encodeURIComponent(pisteId)));
    if (remembered === null) return EMPTY_SETUP_FORM;
    return { ...EMPTY_SETUP_FORM, weapon: remembered.weapon, periods: remembered.periods, touchLimit: String(remembered.touchLimit) };
  }

  remember(pisteId: string, setup: BoutSetup): void {
    const { periods, touchLimit } = setup.options ?? {};
    if (touchLimit === undefined || !isPeriods(periods)) return;
    const value: Remembered = { weapon: setup.weapon, periods, touchLimit };
    this.storage.set(PREFIX + encodeURIComponent(pisteId), JSON.stringify(value));
  }
}

function isPeriods(value: unknown): value is 1 | 2 | 3 {
  return PERIODS.some((option) => option === value);
}

function parse(raw: string | null): Remembered | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { weapon, periods, touchLimit } = value as Record<string, unknown>;
    if (!WEAPONS.some((option) => option === weapon) || !isPeriods(periods)) return null;
    if (typeof touchLimit !== 'number' || !Number.isSafeInteger(touchLimit) || touchLimit <= 0) return null;
    return { weapon: weapon as Weapon, periods, touchLimit };
  } catch {
    return null;
  }
}
