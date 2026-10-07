import { describe, expect, it } from 'vitest';
import { KeyedQueue } from './keyed-queue';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('KeyedQueue', () => {
  it('runs tasks of the same key one at a time, in order', async () => {
    const queue = new KeyedQueue();
    const log: string[] = [];
    const task = (name: string) => async () => {
      log.push(`${name}:start`);
      await tick();
      log.push(`${name}:end`);
    };
    await Promise.all([queue.run('k', task('a')), queue.run('k', task('b'))]);
    expect(log).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });

  it('runs tasks of different keys concurrently', async () => {
    const queue = new KeyedQueue();
    const log: string[] = [];
    const task = (name: string) => async () => {
      log.push(`${name}:start`);
      await tick();
      log.push(`${name}:end`);
    };
    await Promise.all([queue.run('x', task('a')), queue.run('y', task('b'))]);
    expect(log.slice(0, 2)).toEqual(['a:start', 'b:start']);
  });

  it('keeps going after a task fails and propagates its error', async () => {
    const queue = new KeyedQueue();
    const failing = queue.run('k', async () => {
      throw new Error('boom');
    });
    const next = queue.run('k', async () => 42);
    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe(42);
  });
});
