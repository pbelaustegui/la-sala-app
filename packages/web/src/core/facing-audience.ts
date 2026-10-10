import type { KeyValueStorage } from './storage';

const KEY = 'la-sala:v1:facing-audience';

/**
 * Whether this judge stands facing the audience, so the scoreboard mirrors the two fencers.
 * A per-device display preference: it is never part of the bout log and never synced.
 */
export class FacingAudiencePreference {
  constructor(private readonly storage: KeyValueStorage) {}

  get(): boolean {
    return this.storage.get(KEY) === 'on';
  }

  set(facing: boolean): void {
    if (facing) this.storage.set(KEY, 'on');
    else this.storage.remove(KEY);
  }
}
