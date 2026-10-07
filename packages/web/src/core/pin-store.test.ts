import { describe, expect, it } from 'vitest';
import { PinStore } from './pin-store';
import { MemoryStorage } from './storage';

describe('PinStore', () => {
  it('remembers a PIN per piste', () => {
    const pins = new PinStore(new MemoryStorage());
    pins.set('p1', '1234');
    pins.set('p2', '5678');
    expect(pins.get('p1')).toBe('1234');
    expect(pins.get('p2')).toBe('5678');
    expect(pins.get('p3')).toBeNull();
  });

  it('forgets a PIN', () => {
    const pins = new PinStore(new MemoryStorage());
    pins.set('p1', '1234');
    pins.forget('p1');
    expect(pins.get('p1')).toBeNull();
  });

  it('does not collide on separators in piste ids', () => {
    const pins = new PinStore(new MemoryStorage());
    pins.set('a:b', '1111');
    expect(pins.get('a')).toBeNull();
  });
});
