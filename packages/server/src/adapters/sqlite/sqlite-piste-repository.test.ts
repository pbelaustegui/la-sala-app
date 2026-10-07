import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  describeBoutRepositoryContract,
  describePisteRepositoryContract,
} from '../../application/piste-repository.contract';
import { SqlitePisteRepository } from './sqlite-piste-repository';

const opened: SqlitePisteRepository[] = [];
const memory = () => {
  const repo = SqlitePisteRepository.open(':memory:');
  opened.push(repo);
  return repo;
};

afterEach(() => {
  while (opened.length > 0) opened.pop()?.close();
});

describePisteRepositoryContract('sqlite', memory);
describeBoutRepositoryContract('sqlite', memory);

describe('SqlitePisteRepository persistence', () => {
  const dir = mkdtempSync(join(tmpdir(), 'la-sala-sqlite-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('keeps pistes, bouts and events across reopen', async () => {
    const path = join(dir, 'reopen.sqlite');
    const first = SqlitePisteRepository.open(path);
    await first.replacePistes([{ id: '1', pin: '4321' }]);
    await first.startBout('1', { weapon: 'epee', options: { periods: 1 }, left: 'Ana', right: 'Bea' });
    await first.appendEvents('1', [{ id: 'a', event: { type: 'clock-started', at: 5 } }]);
    first.close();

    const second = SqlitePisteRepository.open(path);
    expect(await second.findPiste('1')).toEqual({ id: '1', pin: '4321' });
    expect(await second.findBout('1')).toEqual({
      setup: { weapon: 'epee', options: { periods: 1 }, left: 'Ana', right: 'Bea' },
      events: [{ id: 'a', event: { type: 'clock-started', at: 5 } }],
    });
    second.close();
  });

  it('rejects starting a bout on an unknown piste', async () => {
    const repo = SqlitePisteRepository.open(':memory:');
    await expect(repo.startBout('9', { weapon: 'foil', left: 'A', right: 'B' })).rejects.toThrow();
    repo.close();
  });
});
