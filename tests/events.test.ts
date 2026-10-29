import { describe, expect, it } from 'vitest';
import { emit, eventsAfter, EVENT_TYPES, RECENT_EVENTS_CAP } from '../src/sim/events.ts';
import { freshWorld, simulateDays } from './helpers.ts';

describe('события', () => {
  it('у событий уникальные ID и строго растущие номера', () => {
    const w = simulateDays(freshWorld(31), 30);
    const ids = new Set(w.events.map((e) => e.id));
    expect(ids.size).toBe(w.events.length);
    for (let i = 1; i < w.events.length; i++) expect(w.events[i].seq).toBeGreaterThan(w.events[i - 1].seq);
    expect(w.events.length).toBeLessThanOrEqual(RECENT_EVENTS_CAP);
  });

  it('каждое событие имеет тип, причину, описание и известных участников', () => {
    const w = simulateDays(freshWorld(32), 20);
    for (const e of w.events) {
      expect(EVENT_TYPES[e.type]).toBeDefined();
      expect(e.summary.length).toBeGreaterThan(5);
      expect(e.cause.length).toBeGreaterThan(0);
      for (const p of e.participants) expect(w.characters[p]).toBeDefined();
    }
  });

  it('события создаются движком без участия пользователя', () => {
    const w = simulateDays(freshWorld(33), 14);
    const types = new Set(w.events.map((e) => e.type));
    expect(w.stats.eventsTotal).toBeGreaterThan(50);
    expect(types.size).toBeGreaterThan(4);
  });

  it('emit записывает событие в историю участников; eventsAfter отдаёт только новые', () => {
    const w = freshWorld();
    const seq = w.counters.ev ?? 0;
    const ev = emit(w, { type: 'random', participants: ['max'], summary: 'Тестовое событие', cause: 'тест' });
    expect(w.characters.max.history.at(-1)?.eventId).toBe(ev.id);
    expect(eventsAfter(w, seq).map((e) => e.id)).toEqual([ev.id]);
    expect(eventsAfter(w, ev.seq)).toEqual([]);
  });

  it('повышение требует условий, а не случая', () => {
    const w = simulateDays(freshWorld(34), 60);
    for (const e of w.events.filter((x) => x.type === 'promoted')) {
      expect(e.cause).toMatch(/эффективность/i);
    }
  });
});
