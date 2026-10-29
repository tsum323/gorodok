import { describe, expect, it } from 'vitest';
import { serializeWorld } from '../src/sim/migrate.ts';
import { freshWorld, simulateDays } from './helpers.ts';

describe('воспроизводимость', () => {
  it('одинаковый seed даёт одинаковый мир', () => {
    const a = simulateDays(freshWorld(7), 20);
    const b = simulateDays(freshWorld(7), 20);
    expect(serializeWorld(a)).toBe(serializeWorld(b));
    expect(Object.values(a.ideas).map((i) => i.signature)).toEqual(Object.values(b.ideas).map((i) => i.signature));
  });

  it('разные seed дают разное развитие', () => {
    const a = simulateDays(freshWorld(1), 10);
    const b = simulateDays(freshWorld(2), 10);
    expect(serializeWorld(a)).not.toBe(serializeWorld(b));
  });

  it('состояние генератора случайных чисел сохраняется в мире', () => {
    const w = freshWorld(5);
    const before = w.rngState;
    simulateDays(w, 1);
    expect(w.rngState).not.toBe(before);
    expect(w.seed).toBe(5);
  });
});
