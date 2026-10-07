import { describe, expect, it } from 'vitest';
import { CurrentBoutPointer } from './current-bout';
import { MemoryStorage } from './storage';

describe('CurrentBoutPointer', () => {
  it('stores the bout id this device is running on each piste', () => {
    const pointer = new CurrentBoutPointer(new MemoryStorage());
    expect(pointer.get('p1')).toBeNull();
    pointer.set('p1', 'bout-a');
    pointer.set('p2', 'bout-b');
    expect(pointer.get('p1')).toBe('bout-a');
    expect(pointer.get('p2')).toBe('bout-b');
  });

  it('clears the pointer', () => {
    const pointer = new CurrentBoutPointer(new MemoryStorage());
    pointer.set('p1', 'bout-a');
    pointer.clear('p1');
    expect(pointer.get('p1')).toBeNull();
  });
});
