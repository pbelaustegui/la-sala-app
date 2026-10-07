import type { EntryError } from '../controllers/entry-flow';
import { t } from '../i18n/t';

function seconds(retryAfterMs: number): number {
  return Math.max(1, Math.ceil(retryAfterMs / 1000));
}

/** Spanish message for a failed PIN check. */
export function pinErrorMessage(error: EntryError): string {
  if (error.kind === 'locked') return t('pin.error.locked', { seconds: seconds(error.retryAfterMs) });
  return t(`pin.error.${error.kind}`);
}

/** Spanish message for a failed bout creation. */
export function setupFailureMessage(error: EntryError): string {
  if (error.kind === 'locked') return t('setup.failure.locked', { seconds: seconds(error.retryAfterMs) });
  return t(`setup.failure.${error.kind}`);
}
