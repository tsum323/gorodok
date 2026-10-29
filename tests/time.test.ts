import { describe, expect, it } from 'vitest';
import { tick, runTicks, MAX_TICKS_PER_CALL } from '../src/sim/engine.ts';
import { hourOf, dayOf, weekdayOf, isWeekend, formatGameTime } from '../src/sim/time.ts';
import { freshWorld } from './helpers.ts';

describe('время', () => {
  it('один шаг = один игровой час', () => {
    const w = freshWorld();
    const t0 = w.time;
    tick(w);
    expect(w.time).toBe(t0 + 1);
    expect(w.stats.ticks).toBe(1);
  });

  it('мир начинается в понедельник в 07:00', () => {
    const w = freshWorld();
    expect(hourOf(w.time)).toBe(7);
    expect(weekdayOf(w.time)).toBe(0);
    expect(formatGameTime(w.startDate, w.time)).toMatch(/^Пн, 7 сен 2026, 07:00$/);
  });

  it('календарь: дни и выходные', () => {
    expect(dayOf(24 * 5 + 3)).toBe(5);
    expect(isWeekend(24 * 5)).toBe(true);
    expect(isWeekend(24 * 4 + 23)).toBe(false);
  });

  it('runTicks ограничивает количество шагов за вызов (нет бесконечного цикла)', () => {
    const w = freshWorld();
    const t0 = w.time;
    const done = runTicks(w, 1e9);
    expect(done).toBe(MAX_TICKS_PER_CALL);
    expect(w.time - t0).toBe(MAX_TICKS_PER_CALL);
    expect(runTicks(w, -5)).toBe(0);
    expect(runTicks(w, Number.NaN)).toBe(0);
  });

  it('у каждого персонажа ровно одно текущее действие с корректными границами', () => {
    const w = freshWorld();
    for (let i = 0; i < 24 * 7; i++) {
      tick(w);
      for (const id of w.order) {
        const a = w.characters[id].activity;
        expect(a.endsAt).toBeGreaterThan(a.startedAt);
        expect(a.endsAt).toBeGreaterThan(w.time - 1);
        if (a.arriveAt !== undefined) expect(a.arriveAt).toBeLessThanOrEqual(a.endsAt);
      }
    }
  });
});
