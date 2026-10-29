import { describe, expect, it } from 'vitest';
import { totalMoney, transfer, payExternal, ch, org, receiveExternal } from '../src/sim/economy.ts';
import { freshWorld, simulateDays } from './helpers.ts';

describe('экономика', () => {
  it('деньги не возникают из ничего: изменение суммы = внешние потоки', () => {
    const w = freshWorld(11);
    const start = totalMoney(w);
    simulateDays(w, 60);
    const delta = totalMoney(w) - start;
    expect(delta).toBe(w.stats.externalIn - w.stats.externalOut);
  });

  it('балансы персонажей и организаций никогда не отрицательны', () => {
    const w = freshWorld(12);
    for (let d = 0; d < 90; d++) {
      simulateDays(w, 1);
      for (const id of w.order) {
        expect(w.characters[id].money).toBeGreaterThanOrEqual(0);
        expect(w.characters[id].debt).toBeGreaterThanOrEqual(0);
      }
      for (const o of Object.values(w.orgs)) expect(o.balance).toBeGreaterThanOrEqual(0);
    }
  });

  it('перевод не уходит в минус и сохраняет сумму', () => {
    const w = freshWorld();
    const a = w.characters.gleb;
    const b = w.characters.max;
    a.money = 100;
    const sum = a.money + b.money;
    const paid = transfer(w, ch(a), ch(b), 1000);
    expect(paid).toBe(100);
    expect(a.money).toBe(0);
    expect(a.money + b.money).toBe(sum);
  });

  it('нехватка денег превращается в долг, а не в отрицательный баланс', () => {
    const w = freshWorld();
    const c = w.characters.anya;
    c.money = 50;
    c.debt = 0;
    const { paid, shortfall } = payExternal(w, ch(c), 500);
    expect(paid).toBe(50);
    expect(shortfall).toBe(450);
    expect(c.money).toBe(0);
    expect(c.debt).toBe(450);
  });

  it('внешний доход учитывается', () => {
    const w = freshWorld();
    const before = w.stats.externalIn;
    receiveExternal(w, org(w.orgs.org_cafe), 1234);
    expect(w.stats.externalIn - before).toBe(1234);
  });

  it('ежедневный расчёт выполняется ровно один раз в сутки', () => {
    const w = freshWorld();
    // Перематываем к 23:00 и считаем внешние расходы за полночь.
    while (w.time % 24 !== 23) simulateTick(w);
    const outBefore = w.stats.externalOut;
    simulateTick(w); // 00:00 — расчёт
    const dailyOut = w.stats.externalOut - outBefore;
    expect(dailyOut).toBeGreaterThan(0);
    const outAfter = w.stats.externalOut;
    simulateTick(w); // 01:00 — расчёта быть не должно (кроме покупок в течение часа)
    expect(w.stats.externalOut - outAfter).toBeLessThan(dailyOut / 4);
  });
});

import { tick } from '../src/sim/engine.ts';
function simulateTick(w: Parameters<typeof tick>[0]) {
  tick(w);
}
