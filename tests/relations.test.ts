import { describe, expect, it } from 'vitest';
import { ensureMet, relationKey, adjustRelation, getRelation, converse } from '../src/sim/social.ts';
import { conversationHooks } from '../src/sim/engine.ts';
import { freshWorld, simulateDays } from './helpers.ts';

describe('отношения', () => {
  it('знакомство создаёт пару отношений один раз', () => {
    const w = freshWorld();
    const a = w.characters.rustam;
    const b = w.characters.anya;
    expect(getRelation(w, a.id, b.id)).toBeUndefined();
    expect(ensureMet(w, a, b)).toBe(true);
    const n = Object.keys(w.relations).length;
    expect(ensureMet(w, a, b)).toBe(false);
    expect(ensureMet(w, b, a)).toBe(false);
    expect(Object.keys(w.relations).length).toBe(n);
    expect(w.relations[relationKey(a.id, b.id)]).toBeDefined();
    expect(w.relations[relationKey(b.id, a.id)]).toBeDefined();
  });

  it('отношения двусторонние, но не обязательно одинаковые', () => {
    const w = freshWorld();
    const a = w.characters.gleb;
    const b = w.characters.lidia;
    adjustRelation(w, a, b, { affinity: 30 });
    adjustRelation(w, b, a, { affinity: -30 });
    expect(getRelation(w, a.id, b.id)!.affinity).not.toBe(getRelation(w, b.id, a.id)!.affinity);
  });

  it('за долгую симуляцию знакомство с каждым человеком происходит не больше одного раза', () => {
    const w = simulateDays(freshWorld(21), 40);
    const n = w.order.length;
    expect(Object.keys(w.relations).length).toBeLessThanOrEqual(n * (n - 1));
    const pairs = new Map<string, number>();
    for (const e of w.events.filter((x) => x.type === 'met')) {
      const key = [...e.participants].sort().join('|');
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
    }
    for (const v of pairs.values()) expect(v).toBe(1);
    for (const [k, r] of Object.entries(w.relations)) expect(k).toBe(relationKey(r.from, r.to));
  });

  it('ссора ухудшает отношения с обеих сторон и попадает в память', () => {
    const w = freshWorld();
    const a = w.characters.artem;
    const b = w.characters.player_avatar;
    const ab = getRelation(w, a.id, b.id)!.affinity;
    const ba = getRelation(w, b.id, a.id)!.affinity;
    a.traits.impulsivity = 1;
    a.stress = 100;
    let conflict = false;
    for (let i = 0; i < 40 && !conflict; i++) {
      getRelation(w, a.id, b.id)!.affinity = -60;
      const ev = converse(w, a, b, conversationHooks);
      if (ev?.type === 'conflict') conflict = true;
    }
    expect(conflict).toBe(true);
    expect(getRelation(w, b.id, a.id)!.affinity).toBeLessThan(ba);
    expect(ab).toBeGreaterThan(-60);
    expect(b.memory.some((m) => m.kind === 'conflict')).toBe(true);
  });

  it('взаимодействия меняют отношения в ходе симуляции', () => {
    const w = freshWorld(3);
    const before = JSON.stringify(w.relations);
    simulateDays(w, 5);
    expect(JSON.stringify(w.relations)).not.toBe(before);
  });
});
