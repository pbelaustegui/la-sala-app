import { describe, expect, it } from 'vitest';
import { LastSetupStore } from './last-setup';
import { EMPTY_SETUP_FORM } from './setup-form';
import { MemoryStorage } from './storage';

describe('LastSetupStore', () => {
  it.each(['not json', '{"weapon":"axe","periods":1,"touchLimit":5}', '{"weapon":"foil","periods":4,"touchLimit":5}', '{"weapon":"foil","periods":1,"touchLimit":0}'])(
    'falls back to the empty form on a corrupt value %j',
    (raw) => {
      const storage = new MemoryStorage();
      storage.set('la-sala:v1:last-setup:p1', raw);
      expect(new LastSetupStore(storage).defaults('p1')).toEqual(EMPTY_SETUP_FORM);
    },
  );
});
