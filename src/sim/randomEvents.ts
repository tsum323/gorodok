import type { Character, World } from './types';
import { chance, pick } from './rng';
import { emit, remember } from './events';
import { ch, org, payExternal, receiveExternal, transfer } from './economy';
import { clamp, money } from './util';
import { TECHNOLOGIES, techById } from './ideas/catalog';
import { observe } from './ideas/observe';

// Случайные события ограничены условиями и вероятностями.
// Чтобы добавить новое — допишите объект в RANDOM_EVENTS.

export interface RandomEventDef {
  id: string;
  /** Вероятность в день для одного подходящего персонажа (или мира). */
  chance: number;
  scope: 'character' | 'world';
  condition(world: World, c?: Character): boolean;
  apply(world: World, c?: Character): void;
}

export const RANDOM_EVENTS: RandomEventDef[] = [
  {
    id: 'sick',
    chance: 0.08,
    scope: 'character',
    condition: (_w, c) => !!c && c.stress > 65 && c.needs.energy < 40,
    apply(world, c) {
      c = c!;
      c.needs.energy = clamp(c.needs.energy - 30, 0, 100);
      c.mood = clamp(c.mood - 10, 0, 100);
      if (c.job) c.job.performance = clamp(c.job.performance - 5, 0, 100);
      const cost = 3000;
      payExternal(world, ch(c), cost);
      emit(world, {
        type: 'random',
        participants: [c.id],
        summary: `${c.name} заболел(а) — сказались стресс и усталость`,
        cause: `Стресс ${Math.round(c.stress)}, бодрость ${Math.round(c.needs.energy)}`,
        changes: ['Бодрость резко упала', `Лекарства: −${money(cost)}`],
        importance: 0.45,
      });
      remember(world, c, 'failure', 'Заболел(а) от переутомления', 0.6);
    },
  },
  {
    id: 'bonus',
    chance: 0.03,
    scope: 'character',
    condition: (w, c) => !!c?.job && c.job.performance > 82 && c.job.salary > 0 && (w.orgs[c.job.orgId]?.balance ?? 0) > 500_000,
    apply(world, c) {
      c = c!;
      const o = world.orgs[c.job!.orgId];
      const paid = transfer(world, org(o), ch(c), c.job!.salary * 0.25);
      c.mood = clamp(c.mood + 12, 0, 100);
      emit(world, {
        type: 'financial',
        participants: [c.id, ...(o.ownerId ? [o.ownerId] : [])],
        summary: `${c.name} получил(а) премию ${money(paid)} в «${o.name}»`,
        cause: `Высокая эффективность (${Math.round(c.job!.performance)}/100)`,
        changes: [`+${money(paid)}`],
        importance: 0.45,
      });
    },
  },
  {
    id: 'unexpected_expense',
    chance: 0.012,
    scope: 'character',
    condition: () => true,
    apply(world, c) {
      c = c!;
      const what = pick(world, ['сломался ноутбук', 'срочный ремонт в квартире', 'визит к стоматологу', 'штраф за просроченный платёж']);
      const cost = 8000 + Math.round(c.housing.rent * 0.4);
      const { shortfall } = payExternal(world, ch(c), cost);
      c.stress = clamp(c.stress + 8, 0, 100);
      emit(world, {
        type: 'random',
        participants: [c.id],
        summary: `${c.name}: непредвиденные расходы — ${what}`,
        cause: 'Жизнь',
        changes: [`−${money(cost - shortfall)}`, shortfall > 0 ? `Долг +${money(shortfall)}` : 'Оплачено из сбережений'],
        importance: 0.4,
      });
    },
  },
  {
    id: 'viral',
    chance: 0.04,
    scope: 'character',
    condition: (w, c) => !!c && c.projectIds.some((id) => w.projects[id]?.status === 'launched' && w.projects[id].ownerId === c.id),
    apply(world, c) {
      c = c!;
      const p = c.projectIds.map((id) => world.projects[id]).find((x) => x?.status === 'launched' && x.ownerId === c!.id)!;
      const added = 10 + Math.round(p.quality / 4);
      p.users += added;
      c.reputation = clamp(c.reputation + 3, 0, 100);
      emit(world, {
        type: 'random',
        participants: p.memberIds,
        summary: `О проекте «${p.name}» написали в популярном канале`,
        cause: 'Кто-то из пользователей поделился проектом',
        changes: [`+${added} пользователей`],
        importance: 0.55,
        relatedIds: [p.id],
      });
    },
  },
  {
    id: 'org_good_month',
    chance: 0.02,
    scope: 'world',
    condition: () => true,
    apply(world) {
      const o = pick(world, Object.values(world.orgs).filter((x) => x.kind !== 'university'));
      const amount = o.baseRevenue * 5;
      receiveExternal(world, org(o), amount);
      o.reputation = clamp(o.reputation + 3, 0, 100);
      emit(world, {
        type: 'business',
        participants: o.ownerId ? [o.ownerId] : [],
        locationId: o.locationId,
        summary: `«${o.name}» получила крупный заказ`,
        cause: 'Рекомендация довольного клиента',
        changes: [`Выручка +${money(amount)}`, 'Репутация выросла'],
        importance: 0.4,
        relatedIds: [o.id],
      });
    },
  },
  {
    id: 'org_bad_month',
    chance: 0.015,
    scope: 'world',
    condition: () => true,
    apply(world) {
      const o = pick(world, Object.values(world.orgs).filter((x) => x.kind !== 'university'));
      const loss = o.baseCost * 6;
      const { paid } = payExternal(world, org(o), loss);
      o.reputation = clamp(o.reputation - 4, 0, 100);
      emit(world, {
        type: 'business',
        participants: o.ownerId ? [o.ownerId] : [],
        locationId: o.locationId,
        summary: `У «${o.name}» неудачная неделя: ушёл крупный клиент`,
        cause: 'Конкуренты предложили условия лучше',
        changes: [`Потери: ${money(paid)}`, 'Репутация снизилась'],
        importance: 0.4,
        relatedIds: [o.id],
      });
    },
  },
  {
    id: 'tech_news',
    chance: 0.06,
    scope: 'world',
    condition: (w) => TECHNOLOGIES.some((t) => !w.technologies.includes(t.id)) && (w.time / 24) > 3,
    apply(world) {
      const locked = TECHNOLOGIES.filter((t) => !world.technologies.includes(t.id));
      const t = pick(world, locked);
      world.technologies.push(t.id);
      const curious = world.order.map((id) => world.characters[id]).filter((c) => c.traits.curiosity >= 0.7);
      for (const c of curious) {
        c.counters.newsPending = 1;
        remember(world, c, 'observation', `Новость: стали доступны ${techById.get(t.id)!.name}`, 0.4);
      }
      emit(world, {
        type: 'random',
        participants: curious.map((c) => c.id),
        summary: `Новости технологий: стали доступны ${t.name}`,
        cause: 'Крупные компании выпустили новые инструменты',
        changes: ['Новая технология доступна для проектов и идей'],
        importance: 0.5,
        noHistory: true,
      });
    },
  },
  {
    id: 'cafe_rush',
    chance: 0.05,
    scope: 'world',
    condition: (w) => !!w.orgs.org_cafe,
    apply(world) {
      const o = world.orgs.org_cafe;
      const owner = o.ownerId ? world.characters[o.ownerId] : undefined;
      if (!owner) return;
      owner.stress = clamp(owner.stress + 6, 0, 100);
      emit(world, {
        type: 'business',
        participants: [owner.id],
        locationId: 'cafe',
        summary: `В «Зерне» обеденный аншлаг: очередь на улицу, а потом пусто до вечера`,
        cause: 'Рядом закончилась большая конференция',
        changes: ['Часть гостей ушла, не дождавшись'],
        importance: 0.3,
      });
      remember(world, owner, 'observation', 'Очередь в обед и пустой зал вечером', 0.4);
      observe(world, owner, 'cafe_queue', `${owner.name.split(' ')[0]}: в обед очередь, а потом пусто`);
    },
  },
];

export function dailyRandomEvents(world: World): void {
  for (const def of RANDOM_EVENTS) {
    if (def.scope === 'world') {
      if (def.condition(world) && chance(world, def.chance)) def.apply(world);
      continue;
    }
    for (const id of world.order) {
      const c = world.characters[id];
      if (def.condition(world, c) && chance(world, def.chance)) def.apply(world, c);
    }
  }
}

