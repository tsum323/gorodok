import { describe, expect, it } from 'vitest';
import { chooseAction, candidates, updateGoals } from '../src/sim/planner.ts';
import { tick } from '../src/sim/engine.ts';
import { freshWorld, simulateDays } from './helpers.ts';
import type { World } from '../src/sim/types.ts';

function setHour(w: World, day: number, hour: number) {
  w.time = day * 24 + hour;
}

describe('принятие решений', () => {
  it('голодный персонаж выбирает еду', () => {
    const w = freshWorld();
    setHour(w, 5, 13); // суббота
    const c = w.characters.max;
    c.needs.satiety = 2;
    c.needs.energy = 90;
    let ate = 0;
    for (let i = 0; i < 10; i++) if (chooseAction(w, c).state === 'eat') ate++;
    expect(ate).toBeGreaterThanOrEqual(8);
  });

  it('уставший ночью ложится спать', () => {
    const w = freshWorld();
    setHour(w, 2, 1);
    const c = w.characters.lena;
    c.needs.energy = 10;
    c.needs.satiety = 80;
    expect(chooseAction(w, c).actionId).toBe('sleep');
  });

  it('в рабочее время сотрудник обычно работает', () => {
    const w = freshWorld();
    setHour(w, 1, 10); // вторник
    const c = w.characters.olga;
    c.needs = { energy: 90, satiety: 80, social: 70, fun: 70 };
    let work = 0;
    for (let i = 0; i < 20; i++) if (chooseAction(w, c).actionId === 'work') work++;
    expect(work).toBeGreaterThanOrEqual(15);
  });

  it('характер влияет на выбор: ценящая отдых Лена не задерживается, амбициозный Тимур — чаще', () => {
    const w = freshWorld();
    setHour(w, 1, 17);
    const lena = w.characters.lena;
    const timur = w.characters.timur;
    for (const c of [lena, timur]) {
      c.locationId = 'office';
      c.needs = { energy: 70, satiety: 70, social: 60, fun: 60 };
    }
    const score = (id: string) => candidates(w, w.characters[id]).find((x) => x.def.id === 'overtime')?.score ?? -99;
    expect(score('timur')).toBeGreaterThan(score('lena'));
  });

  it('без работы и денег появляется цель найти работу', () => {
    const w = freshWorld();
    const c = w.characters.yulia;
    c.goals = [];
    c.money = 1000;
    updateGoals(w, c);
    expect(c.goals.some((g) => g.type === 'get_job' && g.status === 'active')).toBe(true);
  });

  it('у главного персонажа подробный журнал решений с альтернативами', () => {
    const w = simulateDays(freshWorld(41), 10);
    const av = w.characters.player_avatar;
    expect(av.decisions.length).toBeGreaterThan(5);
    for (const d of av.decisions) {
      expect(d.reason.length).toBeGreaterThan(0);
      expect(d.expected.length).toBeGreaterThan(0);
    }
    expect(av.decisions.some((d) => d.alternatives.length >= 2)).toBe(true);
  });

  it('главный персонаж живёт по тем же правилам и меняет состояние без команд', () => {
    const w = freshWorld(42);
    const av = w.characters.player_avatar;
    const before = JSON.stringify({ n: av.needs, s: av.skills, m: av.money });
    const actions = new Set<string>();
    for (let i = 0; i < 24 * 7; i++) {
      tick(w);
      actions.add(av.activity.actionId);
    }
    expect(JSON.stringify({ n: av.needs, s: av.skills, m: av.money })).not.toBe(before);
    expect(actions.has('work')).toBe(true);
    expect(actions.has('sleep')).toBe(true);
    expect(actions.size).toBeGreaterThan(4);
  });
});
