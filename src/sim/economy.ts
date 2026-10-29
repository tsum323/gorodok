import type { Character, Org, World } from './types';
import { dayOf, weekdayOf } from './time';
import { emit, remember } from './events';
import { clamp, money } from './util';
import { randRange } from './rng';

// Упрощённая, но замкнутая экономика.
// Деньги меняются только через функции этого модуля:
//  - transfer: между персонажами и организациями (сумма сохраняется);
//  - receiveExternal / payExternal: обмен с «внешним рынком» (клиенты, аренда, еда).
// Все внешние потоки учитываются в world.stats.externalIn/externalOut, поэтому
// всегда выполняется: Σденег(t) − Σденег(0) = externalIn − externalOut.

export type Wallet = { kind: 'char'; c: Character } | { kind: 'org'; o: Org };

function bal(w: Wallet): number {
  return w.kind === 'char' ? w.c.money : w.o.balance;
}

function add(w: Wallet, v: number): void {
  if (w.kind === 'char') w.c.money += v;
  else w.o.balance += v;
}

export const ch = (c: Character): Wallet => ({ kind: 'char', c });
export const org = (o: Org): Wallet => ({ kind: 'org', o });

/** Перевод; нельзя уйти в минус — переводится не больше остатка. Возвращает фактическую сумму. */
export function transfer(_world: World, from: Wallet, to: Wallet, amount: number): number {
  const v = Math.max(0, Math.min(Math.round(amount), Math.floor(bal(from))));
  if (v <= 0) return 0;
  add(from, -v);
  add(to, v);
  if (from.kind === 'char') from.c.counters.expenseMonth = (from.c.counters.expenseMonth ?? 0) + v;
  if (to.kind === 'char') to.c.counters.incomeMonth = (to.c.counters.incomeMonth ?? 0) + v;
  return v;
}

export function receiveExternal(world: World, to: Wallet, amount: number): number {
  const v = Math.max(0, Math.round(amount));
  if (v <= 0) return 0;
  add(to, v);
  world.stats.externalIn += v;
  if (to.kind === 'char') to.c.counters.incomeMonth = (to.c.counters.incomeMonth ?? 0) + v;
  return v;
}

/**
 * Оплата внешнему миру. Если денег не хватает, недостающее становится долгом
 * персонажа (у организаций — просто не оплачивается). Баланс не уходит в минус.
 */
export function payExternal(world: World, from: Wallet, amount: number): { paid: number; shortfall: number } {
  const need = Math.max(0, Math.round(amount));
  const paid = Math.min(need, Math.floor(bal(from)));
  add(from, -paid);
  world.stats.externalOut += paid;
  const shortfall = need - paid;
  if (from.kind === 'char') {
    from.c.counters.expenseMonth = (from.c.counters.expenseMonth ?? 0) + paid;
    if (shortfall > 0) from.c.debt += shortfall;
  }
  return { paid, shortfall };
}

export function totalMoney(world: World): number {
  let s = 0;
  for (const id of world.order) s += world.characters[id].money;
  for (const o of Object.values(world.orgs)) s += o.balance;
  return s;
}

export function monthlyExpenses(c: Character): number {
  return c.housing.rent + c.livingCost;
}

/** Сколько месяцев персонаж проживёт на сбережения без дохода. */
export function runwayMonths(c: Character): number {
  const exp = monthlyExpenses(c);
  return exp <= 0 ? 99 : c.money / exp;
}

export function dailyWage(c: Character): number {
  return c.job ? c.job.salary / 22 : 0;
}

/** Ежедневный экономический расчёт (вызывается в полночь, ровно один раз за день). */
export function dailyEconomy(world: World): void {
  const yesterday = dayOf(world.time) - 1;
  const workday = weekdayOf(yesterday * 24) < 5;

  // 1. Зарплаты за вчерашний день и выручка организаций.
  const workedHours: Record<string, number> = {};
  const expectedHours: Record<string, number> = {};
  for (const id of world.order) {
    const c = world.characters[id];
    const j = c.job;
    if (!j) continue;
    const o = world.orgs[j.orgId];
    if (!o) continue;
    const required = j.weekends || workday ? j.endHour - j.startHour : 0;
    expectedHours[o.id] = (expectedHours[o.id] ?? 0) + required;
    workedHours[o.id] = (workedHours[o.id] ?? 0) + Math.min(j.hoursToday, required + 3) * (0.5 + j.performance / 100);
    if (j.salary > 0 && j.hoursToday >= 3) {
      const wage = dailyWage(c) * Math.min(1, j.hoursToday / Math.max(1, required || 8));
      const paid = transfer(world, org(o), ch(c), wage);
      if (paid < wage * 0.5 && wage > 0) {
        c.stress = clamp(c.stress + 10, 0, 100);
        remember(world, c, 'failure', `${o.name} задержала зарплату`, 0.6, [o.id]);
      }
    }
  }

  for (const o of Object.values(world.orgs)) {
    const exp = expectedHours[o.id] ?? 0;
    const staffFactor = exp > 0 ? clamp((workedHours[o.id] ?? 0) / exp, 0, 1.6) : o.kind === 'university' ? 1 : 0.2;
    const open = o.weekends || workday;
    const repFactor = 0.7 + o.reputation / 170;
    if (open) {
      const revenue = o.baseRevenue * staffFactor * repFactor * randRange(world, 0.8, 1.2);
      receiveExternal(world, org(o), revenue);
    }
    payExternal(world, org(o), o.baseCost);
    o.reputation = clamp(o.reputation + (staffFactor > 0.9 ? 0.05 : staffFactor < 0.5 ? -0.2 : 0), 5, 95);
  }

  // 2. Расходы жителей и долги.
  for (const id of world.order) {
    const c = world.characters[id];
    const { shortfall } = payExternal(world, ch(c), monthlyExpenses(c) / 30);
    if (c.debt > 0 && !c.counters.inDebt) {
      // Переломный момент: денег не хватило впервые (из-за жизни, покупок или проекта).
      c.counters.inDebt = 1;
      c.counters.lastDebtNoticeDay = dayOf(world.time);
      emit(world, {
        type: 'financial',
        participants: [c.id],
        summary: `${c.name} залез(ла) в долги (${money(c.debt)})`,
        cause: 'Сбережения закончились, а расходы продолжаются',
        changes: [`Долг: ${money(c.debt)}`, 'Растут проценты и стресс'],
        importance: 0.75,
        key: { tone: 'down', label: 'Залез(ла) в долги' },
      });
      remember(world, c, 'failure', 'Залез(ла) в долги', 0.8);
    }
    if (shortfall > 0) {
      c.stress = clamp(c.stress + 6, 0, 100);
      if ((c.counters.lastDebtNoticeDay ?? -99) < dayOf(world.time) - 7) {
        c.counters.lastDebtNoticeDay = dayOf(world.time);
        emit(world, {
          type: 'financial',
          participants: [c.id],
          summary: `${c.name}: не хватает денег на жизнь — долг растёт (${money(c.debt)})`,
          cause: 'Расходы на жильё и жизнь превысили остаток на счёте',
          changes: [`Долг увеличился на ${money(shortfall)}`],
          importance: 0.6,
        });
        remember(world, c, 'failure', 'Не хватило денег на жизнь, пришлось влезть в долг', 0.7);
      }
    }
    if (c.debt > 0) {
      c.debt = Math.round(c.debt * 1.0006); // проценты
      const reserve = monthlyExpenses(c) * 1.5;
      if (c.money > reserve) {
        const pay = Math.min(c.debt, (c.money - reserve) * 0.3);
        const { paid } = payExternal(world, ch(c), pay);
        c.debt = Math.max(0, c.debt - paid);
        if (c.debt === 0) {
          c.counters.inDebt = 0;
          emit(world, {
            type: 'financial',
            participants: [c.id],
            summary: `${c.name} полностью закрыл(а) долг`,
            cause: 'Регулярные выплаты из сбережений',
            changes: ['Долг погашен'],
            importance: 0.6,
            key: { tone: 'up', label: 'Выбрался(ась) из долгов' },
          });
          remember(world, c, 'success', 'Закрыл(а) долг', 0.6);
        }
      }
    }
  }

  // 3. Владельцы раз в неделю забирают часть прибыли.
  if (weekdayOf(world.time) === 0) {
    for (const o of Object.values(world.orgs)) {
      if (!o.ownerId) continue;
      const owner = world.characters[o.ownerId];
      if (!owner || owner.job?.orgId !== o.id) continue;
      const reserve = (o.baseCost + payroll(world, o) / 22) * 60;
      if (o.balance > reserve) {
        const draw = (o.balance - reserve) * 0.08;
        transfer(world, org(o), ch(owner), draw);
      }
    }
  }

  // 4. Месячная сводка.
  if (dayOf(world.time) % 30 === 0) {
    for (const id of world.order) {
      const c = world.characters[id];
      c.incomeLastMonth = c.counters.incomeMonth ?? 0;
      c.expensesLastMonth = c.counters.expenseMonth ?? 0;
      c.counters.incomeMonth = 0;
      c.counters.expenseMonth = 0;
    }
  }
}

export function payroll(world: World, o: Org): number {
  let s = 0;
  for (const id of world.order) {
    const j = world.characters[id].job;
    if (j?.orgId === o.id) s += j.salary;
  }
  return s;
}

export function employees(world: World, orgId: string): Character[] {
  return world.order.map((id) => world.characters[id]).filter((c) => c.job?.orgId === orgId);
}
