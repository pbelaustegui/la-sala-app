import { beforeEach, describe, expect, it } from 'vitest';
import type { PisteRepository } from './ports';

/**
 * Behavioural contract every PisteRepository adapter must satisfy.
 * Each adapter test file calls this with a factory returning a fresh, empty repository.
 */
export function describePisteRepositoryContract(
  name: string,
  create: () => PisteRepository | Promise<PisteRepository>,
): void {
  describe(`PisteRepository contract: ${name}`, () => {
    let repo: PisteRepository;

    beforeEach(async () => {
      repo = await create();
    });

    it('starts empty', async () => {
      expect(await repo.listPistes()).toEqual([]);
      expect(await repo.findPiste('1')).toBeNull();
    });

    it('stores pistes in order and finds them by id', async () => {
      await repo.replacePistes([
        { id: '1', pin: '1111' },
        { id: '2', pin: '2222' },
      ]);
      expect(await repo.listPistes()).toEqual([
        { id: '1', pin: '1111' },
        { id: '2', pin: '2222' },
      ]);
      expect(await repo.findPiste('2')).toEqual({ id: '2', pin: '2222' });
      expect(await repo.findPiste('3')).toBeNull();
    });

    it('replacePistes discards the previous pistes', async () => {
      await repo.replacePistes([
        { id: '1', pin: '1111' },
        { id: '2', pin: '2222' },
      ]);
      await repo.replacePistes([{ id: '1', pin: '9999' }]);
      expect(await repo.listPistes()).toEqual([{ id: '1', pin: '9999' }]);
      expect(await repo.findPiste('2')).toBeNull();
    });
  });
}
