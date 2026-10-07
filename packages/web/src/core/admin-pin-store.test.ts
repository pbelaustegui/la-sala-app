import { describe, expect, it } from 'vitest';
import { AdminPinStore } from './admin-pin-store';
import { PinStore } from './pin-store';
import { MemoryStorage } from './storage';

describe('AdminPinStore', () => {
  it('remembers and forgets the admin PIN', () => {
    const store = new AdminPinStore(new MemoryStorage());
    expect(store.get()).toBeNull();
    store.set('9999');
    expect(store.get()).toBe('9999');
    store.forget();
    expect(store.get()).toBeNull();
  });

  it('does not collide with piste PINs', () => {
    const storage = new MemoryStorage();
    new AdminPinStore(storage).set('9999');
    expect(new PinStore(storage).get('admin-pin')).toBeNull();
    expect(new PinStore(storage).get('')).toBeNull();
  });
});
