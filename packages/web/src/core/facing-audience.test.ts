import { describe, expect, it } from 'vitest';
import { FacingAudiencePreference } from './facing-audience';
import { MemoryStorage, type KeyValueStorage } from './storage';

describe('FacingAudiencePreference', () => {
  it('defaults to off', () => {
    expect(new FacingAudiencePreference(new MemoryStorage()).get()).toBe(false);
  });

  it('remembers the choice on the device', () => {
    const storage = new MemoryStorage();
    new FacingAudiencePreference(storage).set(true);
    expect(new FacingAudiencePreference(storage).get()).toBe(true);
    new FacingAudiencePreference(storage).set(false);
    expect(new FacingAudiencePreference(storage).get()).toBe(false);
  });

  it('treats an unknown stored value as off', () => {
    const storage = new MemoryStorage();
    storage.set('la-sala:v1:facing-audience', 'maybe');
    expect(new FacingAudiencePreference(storage).get()).toBe(false);
  });

  it('survives a storage that cannot persist', () => {
    const broken: KeyValueStorage = { get: () => null, set: () => false, remove: () => undefined };
    const pref = new FacingAudiencePreference(broken);
    expect(() => pref.set(true)).not.toThrow();
    expect(pref.get()).toBe(false);
  });
});
