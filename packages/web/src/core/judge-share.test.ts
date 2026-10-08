import { describe, expect, it } from 'vitest';
import { judgeShareMessage } from './judge-share';

describe('judgeShareMessage', () => {
  it('lists the judge link followed by each piste and its PIN', () => {
    const message = judgeShareMessage('https://sala.example/', [
      { id: 'p1', pin: '1111' },
      { id: 'p2', pin: '2222' },
    ]);
    expect(message).toBe(
      ['Enlace para jueces: https://sala.example/#/judge', 'Pista p1: PIN 1111', 'Pista p2: PIN 2222'].join('\n'),
    );
  });

  it('is just the link when there are no pistes', () => {
    expect(judgeShareMessage('http://192.168.1.5:3000', [])).toBe('Enlace para jueces: http://192.168.1.5:3000/#/judge');
  });
});
