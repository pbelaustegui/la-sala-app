import type { RulesOptions, Weapon } from '@la-sala/domain';
import type { CopyKey } from '../i18n/t';
import type { BoutSetup } from './local-bout';

/** Raw form values as typed by the judge. */
export interface SetupForm {
  readonly weapon: Weapon;
  readonly periods: 1 | 2 | 3;
  /** Blank means "use the default for the weapon". */
  readonly touchLimit: string;
  readonly left: string;
  readonly right: string;
}

export const EMPTY_SETUP_FORM: SetupForm = { weapon: 'foil', periods: 3, touchLimit: '', left: '', right: '' };

/** Same bounds as the server's `startBoutBody` (names trimmed, 1..100 characters). */
export const MAX_NAME_LENGTH = 100;

export type SetupErrors = Partial<Record<'left' | 'right' | 'touchLimit', CopyKey>>;

export type SetupValidation =
  | { readonly ok: true; readonly setup: BoutSetup }
  | { readonly ok: false; readonly errors: SetupErrors };

function nameError(raw: string): CopyKey | null {
  const name = raw.trim();
  if (name.length === 0) return 'setup.error.nameRequired';
  if (name.length > MAX_NAME_LENGTH) return 'setup.error.nameTooLong';
  return null;
}

/** Validates the form with the same rules as the server, so a 400 is never the first feedback. */
export function validateSetupForm(form: SetupForm): SetupValidation {
  const errors: { -readonly [K in keyof SetupErrors]: SetupErrors[K] } = {};
  const left = nameError(form.left);
  const right = nameError(form.right);
  if (left) errors.left = left;
  if (right) errors.right = right;

  const options: { -readonly [K in keyof RulesOptions]: RulesOptions[K] } = { periods: form.periods };
  const rawLimit = form.touchLimit.trim();
  if (rawLimit !== '') {
    // Digits only: rejects signs, decimals and exponents that Number() would accept.
    const limit = /^\d+$/.test(rawLimit) ? Number(rawLimit) : 0;
    if (Number.isSafeInteger(limit) && limit > 0) options.touchLimit = limit;
    else errors.touchLimit = 'setup.error.touchLimit';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    setup: { weapon: form.weapon, options, left: form.left.trim(), right: form.right.trim() },
  };
}
