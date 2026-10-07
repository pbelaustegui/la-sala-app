import { describe, expect, it } from 'vitest';
import { LocalStorageAdapter, MemoryStorage, boutKey } from './storage';

function fakeWebStorage(overrides: Partial<Storage> = {}): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
    ...overrides,
  };
}

describe('boutKey', () => {
  it('is namespaced by piste and bout', () => {
    expect(boutKey({ pisteId: 'p1', boutId: 'b1' })).not.toBe(boutKey({ pisteId: 'p1', boutId: 'b2' }));
    expect(boutKey({ pisteId: 'p1', boutId: 'b1' })).not.toBe(boutKey({ pisteId: 'p2', boutId: 'b1' }));
  });

  it('cannot collide through separators in ids', () => {
    expect(boutKey({ pisteId: 'a:b', boutId: 'c' })).not.toBe(boutKey({ pisteId: 'a', boutId: 'b:c' }));
  });
});

describe.each([
  ['MemoryStorage', () => new MemoryStorage()],
  ['LocalStorageAdapter', () => {
    const web = fakeWebStorage();
    return new LocalStorageAdapter(() => web);
  }],
])('%s', (_name, make) => {
  it('stores, reads and removes values', () => {
    const storage = make();
    expect(storage.get('k')).toBeNull();
    expect(storage.set('k', 'v')).toBe(true);
    expect(storage.get('k')).toBe('v');
    storage.remove('k');
    expect(storage.get('k')).toBeNull();
  });
});

describe('LocalStorageAdapter resilience', () => {
  it('survives every access throwing', () => {
    const boom = () => {
      throw new Error('denied');
    };
    const storage = new LocalStorageAdapter(() =>
      fakeWebStorage({ getItem: boom, setItem: boom, removeItem: boom }),
    );
    expect(storage.get('k')).toBeNull();
    expect(storage.set('k', 'v')).toBe(false);
    expect(() => storage.remove('k')).not.toThrow();
  });

  it('survives the storage being unavailable', () => {
    const throwing = new LocalStorageAdapter(() => {
      throw new Error('SecurityError');
    });
    expect(throwing.get('k')).toBeNull();
    expect(throwing.set('k', 'v')).toBe(false);

    const missing = new LocalStorageAdapter(() => undefined);
    expect(missing.get('k')).toBeNull();
    expect(missing.set('k', 'v')).toBe(false);
  });
});
