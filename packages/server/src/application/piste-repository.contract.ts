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

const setup = { weapon: 'foil', left: 'Ana', right: 'Bea' } as const;
const event = (id: string, at: number) => ({ id, event: { type: 'clock-started', at } }) as const;

/** Bout persistence part of the contract. Requires a repository seeded with piste "1". */
export function describeBoutRepositoryContract(
  name: string,
  create: () => PisteRepository | Promise<PisteRepository>,
): void {
  describe(`PisteRepository bout contract: ${name}`, () => {
    let repo: PisteRepository;

    beforeEach(async () => {
      repo = await create();
      await repo.replacePistes([
        { id: '1', pin: '1111' },
        { id: '2', pin: '2222' },
      ]);
    });

    it('has no bout until one is started', async () => {
      expect(await repo.findBout('1')).toBeNull();
    });

    it('stores the setup of a started bout with no events', async () => {
      await repo.startBout('1', { ...setup, options: { touchLimit: 5 } });
      expect(await repo.findBout('1')).toEqual({
        setup: { ...setup, options: { touchLimit: 5 } },
        events: [],
      });
      expect(await repo.findBout('2')).toBeNull();
    });

    it('appends events keeping their order and ids', async () => {
      await repo.startBout('1', setup);
      await repo.appendEvents('1', [event('a', 1), event('b', 2)]);
      await repo.appendEvents('1', [event('c', 3)]);
      const bout = await repo.findBout('1');
      expect(bout?.events.map((e) => e.id)).toEqual(['a', 'b', 'c']);
      expect(bout?.events[0]).toEqual(event('a', 1));
    });

    it('rejects a batch containing an already stored id and persists nothing from it', async () => {
      await repo.startBout('1', setup);
      await repo.appendEvents('1', [event('a', 1)]);
      await expect(repo.appendEvents('1', [event('b', 2), event('a', 3)])).rejects.toThrow();
      expect((await repo.findBout('1'))?.events.map((e) => e.id)).toEqual(['a']);
    });

    it('rejects appending when there is no bout', async () => {
      await expect(repo.appendEvents('1', [event('a', 1)])).rejects.toThrow();
    });

    it('archives the previous bout when a new one starts', async () => {
      await repo.startBout('1', setup);
      await repo.appendEvents('1', [event('a', 1)]);
      await repo.startBout('1', { ...setup, left: 'Cris' });
      expect(await repo.findBout('1')).toEqual({ setup: { ...setup, left: 'Cris' }, events: [] });
      const archived = await repo.listArchivedBouts('1');
      expect(archived).toHaveLength(1);
      expect(archived[0]?.setup.left).toBe('Ana');
      expect(archived[0]?.events.map((e) => e.id)).toEqual(['a']);
    });

    it('allows reusing an event id in a new bout', async () => {
      await repo.startBout('1', setup);
      await repo.appendEvents('1', [event('a', 1)]);
      await repo.startBout('1', setup);
      await repo.appendEvents('1', [event('a', 1)]);
      expect((await repo.findBout('1'))?.events).toHaveLength(1);
    });

    it('discards bouts and archives when pistes are replaced', async () => {
      await repo.startBout('1', setup);
      await repo.startBout('1', setup);
      await repo.replacePistes([{ id: '1', pin: '3333' }]);
      expect(await repo.findBout('1')).toBeNull();
      expect(await repo.listArchivedBouts('1')).toEqual([]);
    });
  });
}

/** Piste-level facing-audience flag part of the contract. */
export function describeFacingAudienceContract(
  name: string,
  create: () => PisteRepository | Promise<PisteRepository>,
): void {
  describe(`PisteRepository facing-audience contract: ${name}`, () => {
    let repo: PisteRepository;

    beforeEach(async () => {
      repo = await create();
      await repo.replacePistes([
        { id: '1', pin: '1111' },
        { id: '2', pin: '2222' },
      ]);
    });

    it('is off by default and leaves the piste shape untouched', async () => {
      expect(await repo.getFacingAudience('1')).toBe(false);
      expect(await repo.findPiste('1')).toEqual({ id: '1', pin: '1111' });
    });

    it('stores the flag per piste and can turn it off again', async () => {
      await repo.setFacingAudience('1', true);
      expect(await repo.getFacingAudience('1')).toBe(true);
      expect(await repo.getFacingAudience('2')).toBe(false);
      await repo.setFacingAudience('1', false);
      expect(await repo.getFacingAudience('1')).toBe(false);
    });

    it('survives new bouts: it belongs to the piste, not to the bout', async () => {
      await repo.setFacingAudience('1', true);
      await repo.startBout('1', { weapon: 'foil', left: 'Ana', right: 'Bea' });
      await repo.startBout('1', { weapon: 'foil', left: 'Cris', right: 'Dani' });
      expect(await repo.getFacingAudience('1')).toBe(true);
    });

    it('is reset when the pistes are replaced', async () => {
      await repo.setFacingAudience('1', true);
      await repo.replacePistes([{ id: '1', pin: '3333' }]);
      expect(await repo.getFacingAudience('1')).toBe(false);
    });

    it('rejects setting the flag of an unknown piste and reads it as off', async () => {
      await expect(repo.setFacingAudience('9', true)).rejects.toThrow();
      expect(await repo.getFacingAudience('9')).toBe(false);
    });
  });
}

