import { describe, expect, it } from 'vitest';
import { startProject } from '../src/sim/projects.ts';
import { dailyEconomy } from '../src/sim/economy.ts';
import { migrateWorld, serializeWorld } from '../src/sim/migrate.ts';
import { STATUS_LABELS } from '../src/archive/archive.ts';
import { freshWorld, simulateDays } from './helpers.ts';

describe('ключевые моменты', () => {
  it('начало проекта — ключевой момент владельца', () => {
    const w = freshWorld();
    const c = w.characters.kirill;
    startProject(w, c, { name: 'Тест', description: 'тест', kind: 'app', skill: 'programming', reason: 'проверка', alternatives: [] });
    const ev = w.events.filter((e) => e.type === 'project_started').at(-1)!;
    expect(ev.key?.tone).toBe('turn');
    expect(c.keyMoments.at(-1)?.eventId).toBe(ev.id);
  });

  it('уход в долги отмечается один раз, выход из долгов — тоже', () => {
    const w = freshWorld();
    const c = w.characters.gleb;
    c.money = 0;
    c.debt = 0;
    w.time = 24 * 3;
    dailyEconomy(w);
    w.time += 24;
    dailyEconomy(w);
    const debtKeys = w.events.filter((e) => e.key?.label === 'Залез(ла) в долги' && e.participants.includes(c.id));
    expect(debtKeys).toHaveLength(1);
    expect(debtKeys[0].key?.tone).toBe('down');
    c.money = 10_000_000;
    w.time += 24;
    dailyEconomy(w);
    expect(c.debt).toBe(0);
    expect(c.keyMoments.at(-1)?.tone).toBe('up');
  });

  it('за долгую жизнь появляются ключевые моменты, и только у реальных участников', () => {
    const w = simulateDays(freshWorld(77), 60);
    const keyEvents = w.events.filter((e) => e.key);
    expect(keyEvents.length).toBeGreaterThan(0);
    for (const id of w.order) {
      for (const k of w.characters[id].keyMoments) {
        const ev = w.events.find((e) => e.id === k.eventId);
        if (ev) expect(ev.participants).toContain(id);
      }
    }
  });

  it('старое сохранение (версия 1) мигрирует без потерь', () => {
    const w = simulateDays(freshWorld(5), 2);
    const old = JSON.parse(serializeWorld(w));
    old.version = 1;
    delete old.deletedIdeaSignatures;
    for (const c of Object.values(old.characters) as Record<string, unknown>[]) delete c.keyMoments;
    const m = migrateWorld(old);
    expect(m.version).toBe(2);
    expect(m.deletedIdeaSignatures).toEqual([]);
    expect(m.characters.player_avatar.keyMoments).toEqual([]);
    expect(m.time).toBe(w.time);
  });

  it('у идей есть статус «Просмотрена»', () => {
    expect(STATUS_LABELS.viewed).toBe('Просмотрена');
  });
});
