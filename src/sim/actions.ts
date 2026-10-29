import type { ActivityState, Character, Goal, LocationId, World } from './types';
import { clamp, money } from './util';
import { hourOf, isWeekend } from './time';
import { ch, org, receiveExternal, runwayMonths, transfer } from './economy';
import { allOpenings, applyForJob, openingFit } from './career';
import { activeOwnedProject, activeProjects, workOnProject } from './projects';
import { emit } from './events';
import { maybeNoticeProblem } from './ideas/observe';
import { tryGenerateIdea } from './ideas/generator';
import { randRange } from './rng';
import { skillName } from './social';
import { recordDecision } from './decisions';

// Каталог действий. Каждое действие сообщает:
//  - plan(): доступно ли оно сейчас, где и сколько длится;
//  - score(): полезность с учётом потребностей, целей, характера и ресурсов;
//  - onStart/onHour/onEnd: что оно меняет в мире.
// Новые действия добавляются в массив ACTIONS без изменения движка.

export interface ActionCtx {
  world: World;
  c: Character;
  hour: number;
  weekend: boolean;
}

export interface ActionPlan {
  locationId: LocationId;
  duration: number;
  label?: string;
  targetId?: string;
  projectId?: string;
  /** Плата заведению за посещение. */
  fee?: { orgId: string; amount: number };
}

export interface ActionDef {
  id: string;
  label: string;
  state: ActivityState;
  icon: string;
  /** Бытовое действие — не записывается в журнал решений. */
  routine: boolean;
  /** Во время действия персонаж открыт для разговоров (вероятность в час). */
  talkChance: number;
  plan(ctx: ActionCtx): ActionPlan | null;
  score(ctx: ActionCtx, plan: ActionPlan): number;
  /** Короткое объяснение мотива для журнала. */
  why(ctx: ActionCtx, plan: ActionPlan): string;
  onStart?(ctx: ActionCtx, plan: ActionPlan): void;
  onHour?(ctx: ActionCtx): void;
  onEnd?(ctx: ActionCtx): void;
}

const goal = (c: Character, type: Goal['type']): Goal | undefined => c.goals.find((g) => g.status === 'active' && g.type === type);
const gp = (c: Character, type: Goal['type']): number => goal(c, type)?.priority ?? 0;

function isOpen(world: World, orgId: string, hour: number, weekend: boolean): boolean {
  const o = world.orgs[orgId];
  if (!o) return false;
  if (weekend && !o.weekends) return false;
  return hour >= o.workHours[0] && hour < o.workHours[1] - 1;
}

/** Рабочее время по расписанию персонажа (с учётом часа на дорогу). */
export function inWorkWindow(c: Character, hour: number, weekend: boolean): boolean {
  const j = c.job;
  if (!j) return false;
  if (weekend && !j.weekends) return false;
  return hour >= j.startHour - 1 && hour < j.endHour - 1;
}

function canAfford(c: Character, amount: number): boolean {
  return c.money > amount * 4;
}

function pickWorkspot(ctx: ActionCtx): ActionPlan['locationId'] {
  const { world, c, hour, weekend } = ctx;
  const hiveOpen = isOpen(world, 'org_hive', hour, weekend);
  const cafeOpen = isOpen(world, 'org_cafe', hour, weekend);
  if (c.locationId === 'coworking' && hiveOpen) return 'coworking';
  if (c.locationId === 'cafe' && cafeOpen) return 'cafe';
  if (hiveOpen && canAfford(c, 350) && c.traits.sociability > 0.45) return 'coworking';
  if (cafeOpen && canAfford(c, 450) && c.traits.sociability > 0.7) return 'cafe';
  return c.homeId;
}

function feeFor(world: World, c: Character, loc: LocationId): ActionPlan['fee'] {
  const o = Object.values(world.orgs).find((x) => x.locationId === loc && x.visitPrice > 0 && (x.kind === 'cafe' || x.kind === 'coworking'));
  if (!o || o.ownerId === c.id || c.job?.orgId === o.id) return undefined;
  return { orgId: o.id, amount: o.visitPrice };
}

function workHour({ world, c }: ActionCtx): void {
  const j = c.job;
  if (!j || c.locationId !== world.orgs[j.orgId]?.locationId) return;
  j.hoursToday++;
  const skill = c.skills[j.skill];
  const delta = (skill / 100) * 0.9 + (c.needs.energy / 100) * 0.6 + (c.mood / 100) * 0.4 - 0.95;
  j.performance = clamp(j.performance + delta * 1.2, 0, 100);
  c.skills[j.skill] = clamp(c.skills[j.skill] + 0.025 * (0.6 + c.traits.curiosity), 0, 100);
  maybeNoticeProblem(world, c, c.isAvatar ? 0.04 : 0.015);
}

export const ACTIONS: ActionDef[] = [
  {
    id: 'sleep',
    label: 'Спит',
    state: 'sleep',
    icon: 'z',
    routine: true,
    talkChance: 0,
    plan({ c, hour }) {
      const night = hour >= 21 || hour < 6;
      if (!night && c.needs.energy > 30) return null;
      const wake = c.job ? Math.max(5, c.job.startHour - 2) : Math.round(7 + c.traits.leisure * 3);
      const duration = night ? clamp((wake - hour + 24) % 24, 3, 11) : 2;
      return { locationId: c.homeId, duration };
    },
    score({ c, hour }) {
      const night = hour >= 22 || hour < 6;
      return (night ? 6 : -1) + (100 - c.needs.energy) / 12 + (hour >= 0 && hour < 5 ? 4 : 0);
    },
    why: ({ c }) => `Бодрость ${Math.round(c.needs.energy)}/100 — пора спать`,
  },
  {
    id: 'eat_home',
    label: 'Ест дома',
    state: 'eat',
    icon: '🍲',
    routine: true,
    talkChance: 0,
    plan({ c }) {
      if ((c.counters.groceries ?? 0) <= 0) return null;
      return { locationId: c.homeId, duration: 1 };
    },
    score: ({ c }) => (100 - c.needs.satiety) / 11 - 1.5 + (c.locationId === c.homeId ? 1 : 0),
    why: ({ c }) => `Проголодался(ась) (сытость ${Math.round(c.needs.satiety)})`,
    onStart({ c }) {
      c.counters.groceries = Math.max(0, (c.counters.groceries ?? 0) - 1);
    },
  },
  {
    id: 'eat_cafe',
    label: 'Обедает в кафе',
    state: 'eat',
    icon: '☕',
    routine: true,
    talkChance: 0.35,
    plan({ world, c, hour, weekend }) {
      if (!isOpen(world, 'org_cafe', hour, weekend)) return null;
      const price = world.orgs.org_cafe.visitPrice;
      if (!canAfford(c, price)) return null;
      return { locationId: 'cafe', duration: 1, fee: feeFor(world, c, 'cafe') };
    },
    score: ({ c }) => (100 - c.needs.satiety) / 11 - 2.5 + c.traits.sociability * 1.5 - c.traits.greed + (c.locationId === 'cafe' ? 1.5 : 0) + (100 - c.needs.social) / 50,
    why: () => 'Голоден(а) и хочется побыть среди людей',
  },
  {
    id: 'shop',
    label: 'Покупает продукты',
    state: 'walk',
    icon: '🛒',
    routine: true,
    talkChance: 0.15,
    plan({ world, c, hour, weekend }) {
      if ((c.counters.groceries ?? 0) > 1) return null;
      if (!isOpen(world, 'org_shop', hour, weekend)) return null;
      return { locationId: 'shop', duration: 1 };
    },
    score: ({ c }) => 2.5 + ((c.counters.groceries ?? 0) === 0 ? 2.5 : 0) + (100 - c.needs.satiety) / 40,
    why: () => 'Дома закончились продукты',
    onStart({ world, c }) {
      const o = world.orgs.org_shop;
      const paid = c.id === o.ownerId ? o.visitPrice : transfer(world, ch(c), org(o), o.visitPrice);
      if (paid > 0) c.counters.groceries = (c.counters.groceries ?? 0) + 4;
    },
  },
  {
    id: 'work',
    label: 'Работает',
    state: 'work',
    icon: '💻',
    routine: true,
    talkChance: 0.08,
    plan({ world, c, hour, weekend }) {
      if (!inWorkWindow(c, hour, weekend)) return null;
      const o = world.orgs[c.job!.orgId];
      const until = c.job!.endHour;
      const start = Math.max(hour, c.job!.startHour);
      return { locationId: o.locationId, duration: clamp(until - start, 1, 4), label: `Работает: ${c.job!.title}` };
    },
    score({ c }) {
      const owner = c.job!.rank === 'owner' || c.job!.rank === 'entrepreneur';
      const base = owner ? 5 + c.traits.ambition * 3 : 5 + c.traits.discipline * 4;
      const tired = c.needs.energy < 15 ? 4 : 0;
      const burnout = c.stress > 80 ? 2 * c.traits.impulsivity : 0;
      return base - tired - burnout + c.job!.warnings * 1.5;
    },
    why: ({ c }) => `Рабочее время (${c.job!.startHour}:00–${c.job!.endHour}:00)`,
    onHour: workHour,
  },
  {
    id: 'overtime',
    label: 'Задерживается на работе',
    state: 'work',
    icon: '🌙',
    routine: false,
    talkChance: 0.05,
    plan({ world, c, hour, weekend }) {
      const j = c.job;
      if (!j || weekend || hour < j.endHour - 1 || hour > j.endHour + 1) return null;
      if (c.locationId !== world.orgs[j.orgId]?.locationId) return null;
      return { locationId: c.locationId, duration: 2 };
    },
    score: ({ c }) => -1 + c.traits.ambition * 3 + gp(c, 'promotion') * 2 - c.traits.leisure * 4 - (100 - c.needs.energy) / 30,
    why: ({ c }) => `Хочет быстрее вырасти (амбициозность ${Math.round(c.traits.ambition * 100)}%)`,
    onHour(ctx) {
      workHour(ctx);
      ctx.c.stress = clamp(ctx.c.stress + 1, 0, 100);
    },
  },
  {
    id: 'lecture',
    label: 'На лекции',
    state: 'study',
    icon: '🎓',
    routine: true,
    talkChance: 0.1,
    plan({ c, hour, weekend }) {
      if (!c.student || weekend || hour < 8 || hour >= 15) return null;
      return { locationId: 'university', duration: clamp(15 - Math.max(hour, 9), 1, 3) };
    },
    score: ({ c }) => 3.5 + c.traits.discipline * 3 + c.traits.curiosity - c.traits.leisure * 1.5,
    why: () => 'Учебный день',
    onHour({ world, c }) {
      if (c.locationId !== 'university') return;
      const target = (goal(c, 'learn_skill')?.target ?? 'analytics') as keyof Character['skills'];
      c.skills[target] = clamp(c.skills[target] + 0.12, 0, 100);
      maybeNoticeProblem(world, c, 0.02);
    },
  },
  {
    id: 'self_study',
    label: 'Учится',
    state: 'study',
    icon: '📚',
    routine: false,
    talkChance: 0.05,
    plan(ctx) {
      const g = goal(ctx.c, 'learn_skill') ?? goal(ctx.c, 'change_career');
      if (!g?.target) return null;
      if (ctx.hour < 7 || ctx.hour > 22) return null;
      const loc = ctx.c.locationId === 'university' ? 'university' : pickWorkspot(ctx);
      return { locationId: loc, duration: 2, label: `Изучает: ${skillName(g.target)}`, fee: feeFor(ctx.world, ctx.c, loc) };
    },
    score({ c }) {
      const g = goal(c, 'learn_skill') ?? goal(c, 'change_career')!;
      return 1 + g.priority * 3 + c.traits.curiosity * 1.5 + c.traits.discipline - (100 - c.needs.energy) / 35;
    },
    why({ c }) {
      const g = goal(c, 'learn_skill') ?? goal(c, 'change_career')!;
      return `Цель: ${g.label.toLowerCase()}`;
    },
    onHour({ c }) {
      const g = goal(c, 'learn_skill') ?? goal(c, 'change_career');
      if (!g?.target) return;
      const k = g.target as keyof Character['skills'];
      const before = Math.floor(c.skills[k] / 10);
      c.skills[k] = clamp(c.skills[k] + 0.18 * (0.5 + c.traits.curiosity) * (0.5 + c.needs.energy / 100), 0, 100);
      g.progress = clamp(g.progress + 0.6, 0, 100);
      if (Math.floor(c.skills[k] / 10) > before) {
        c.counters.skillUps = (c.counters.skillUps ?? 0) + 1;
      }
      if (g.type === 'learn_skill' && g.progress >= 100) g.status = 'done';
    },
  },
  {
    id: 'job_search',
    label: 'Ищет работу',
    state: 'think',
    icon: '🔎',
    routine: false,
    talkChance: 0.05,
    plan(ctx) {
      const { world, c, hour } = ctx;
      if (c.job && !c.counters.searchingWhileEmployed) return null;
      if (c.job?.rank === 'owner' || c.job?.rank === 'entrepreneur') return null;
      if (hour < 8 || hour > 21) return null;
      if ((c.counters.lastJobSearch ?? -999) > world.time - 20) return null;
      if (allOpenings(world).length === 0) return null;
      // Владелец работающего проекта с запасом денег работу не ищет.
      const own = activeOwnedProject(world, c);
      if (!c.job && own && own.status === 'launched' && own.users >= 15 && runwayMonths(c) > 2) return null;
      const loc = pickWorkspot(ctx);
      return { locationId: loc, duration: 2, fee: feeFor(world, c, loc) };
    },
    score({ c }) {
      if (c.job) return 1.5 + c.traits.ambition;
      const urgency = runwayMonths(c) < 2 ? 3 : 0;
      return 3 + gp(c, 'get_job') * 3 + urgency + c.traits.discipline - (c.student ? 2 : 0);
    },
    why: ({ c }) => (c.job ? 'Недоволен(льна) текущей работой' : `Нет работы, сбережений на ${runwayMonths(c).toFixed(1)} мес.`),
    onEnd({ world, c }) {
      c.counters.lastJobSearch = world.time;
      const options = allOpenings(world)
        .filter(({ opening }) => !c.jobApplications.some((a) => a.openingId === opening.id) && c.job?.orgId !== opening.id)
        .map((o) => ({ ...o, fit: openingFit(c, o.opening) }))
        .filter((o) => o.fit > 0)
        .sort((a, b) => b.fit - a.fit);
      if (options.length === 0) {
        maybeNoticeProblem(world, c, 0.6, ['event:job_reject']);
        return;
      }
      const best = options[0];
      applyForJob(world, c, best.org.id, best.opening);
      if (c.isAvatar || best.fit > 1.5) {
        recordDecision(world, c, {
          choice: `Откликнуться: ${best.opening.title} в «${best.org.name}»`,
          reason: `Лучшее совпадение по навыкам и зарплате (${money(best.opening.salary)}/мес.)`,
          alternatives: options.slice(0, 3).map((o) => ({ label: `${o.opening.title} — ${o.org.name}`, score: o.fit })),
          expected: 'Ответ работодателя в течение 1–3 дней',
        });
      }
      emit(world, {
        type: 'job_search',
        participants: [c.id],
        summary: `${c.name} откликнулся(ась) на вакансию «${best.opening.title}» в «${best.org.name}»`,
        cause: c.job ? 'Ищет место получше' : 'Нужна работа',
        changes: ['Отклик отправлен'],
        importance: c.isAvatar ? 0.45 : 0.25,
        relatedIds: [best.org.id],
      });
    },
  },
  {
    id: 'freelance',
    label: 'Фриланс-заказ',
    state: 'work',
    icon: '🖌',
    routine: false,
    talkChance: 0.08,
    plan(ctx) {
      const { c, hour } = ctx;
      const capable = c.freelancer || (!c.job && Math.max(c.skills.design, c.skills.programming, c.skills.sales) >= 45);
      if (!capable || hour < 9 || hour > 20) return null;
      const loc = pickWorkspot(ctx);
      return { locationId: loc, duration: 3, fee: feeFor(ctx.world, c, loc) };
    },
    score: ({ c }) => 3 + c.traits.greed * 2 + (runwayMonths(c) < 3 ? 2 : 0) - c.traits.leisure + (c.freelancer ? 1.5 : 0) - (100 - c.needs.energy) / 30,
    why: ({ c }) => `Нужен доход (запас на ${runwayMonths(c).toFixed(1)} мес.)`,
    onHour({ world, c }) {
      const skill = Math.max(c.skills.design, c.skills.programming, c.skills.sales, c.skills.communication * 0.7);
      c.counters.freelanceProgress = (c.counters.freelanceProgress ?? 0) + (skill / 100) * (0.5 + c.needs.energy / 200);
      if (c.counters.freelanceProgress >= 7) {
        c.counters.freelanceProgress = 0;
        const fee = (5000 + skill * 110) * (0.6 + c.reputation / 100) * randRange(world, 0.7, 1.3);
        const paid = receiveExternal(world, ch(c), fee);
        c.reputation = clamp(c.reputation + 0.7, 0, 100);
        emit(world, {
          type: 'financial',
          participants: [c.id],
          summary: `${c.name} сдал(а) фриланс-заказ и получил(а) ${money(paid)}`,
          cause: 'Закончена работа для клиента',
          changes: [`+${money(paid)}`, 'Репутация немного выросла'],
          importance: 0.25,
          noHistory: !c.isAvatar,
        });
        maybeNoticeProblem(world, c, 0.3, ['freelancer']);
      }
    },
  },
  {
    id: 'project',
    label: 'Работает над проектом',
    state: 'work',
    icon: '🚀',
    routine: false,
    talkChance: 0.1,
    plan(ctx) {
      const { world, c, hour } = ctx;
      const projects = activeProjects(world, c).filter((p) => p.status === 'active' || p.status === 'launched');
      if (projects.length === 0 || hour < 7 || hour > 23) return null;
      const p = projects.sort((a, b) => (a.ownerId === c.id ? -1 : 0) - (b.ownerId === c.id ? -1 : 0))[0];
      const loc = pickWorkspot(ctx);
      return { locationId: loc, duration: c.job ? 2 : 3, projectId: p.id, label: `Проект «${p.name}»`, fee: feeFor(world, c, loc) };
    },
    score({ world, c }, plan) {
      const p = world.projects[plan.projectId!];
      const owner = p.ownerId === c.id;
      const goals = Math.max(gp(c, 'start_project'), gp(c, 'grow_project'), gp(c, 'explore_ideas'));
      const promise = owner ? 0 : 1; // участник старается держать слово
      const stale = (world.time - (c.counters[`lastWork_${p.id}`] ?? p.createdAt)) / 24 > 5 ? 1.5 : 0;
      return 2 + c.traits.ambition * 2 + (owner ? 1.5 : 0.5) + goals * 1.5 + promise * c.traits.discipline + stale - c.traits.leisure * 1.5 - (100 - c.needs.energy) / 30 + (c.job ? 0 : 2);
    },
    why: ({ world }, plan) => `Хочет продвинуть «${world.projects[plan.projectId!].name}»`,
    onHour({ world, c }) {
      const pid = c.activity.projectId;
      const p = pid ? world.projects[pid] : undefined;
      if (p) workOnProject(world, c, p);
    },
  },
  {
    id: 'socialize',
    label: 'Общается',
    state: 'talk',
    icon: '💬',
    routine: true,
    talkChance: 0.8,
    plan({ world, c, hour, weekend }) {
      if (hour < 9 || hour > 22) return null;
      const cafe = isOpen(world, 'org_cafe', hour, weekend) && canAfford(c, 450);
      const loc = cafe && (c.traits.sociability > 0.5 || c.locationId === 'cafe') ? 'cafe' : 'park';
      return { locationId: loc, duration: 2, fee: feeFor(world, c, loc) };
    },
    score: ({ c, hour, weekend }) =>
      (100 - c.needs.social) / 14 + c.traits.sociability * 2.5 + gp(c, 'make_friends') * 2 - (!weekend && c.job && hour >= c.job.startHour && hour < c.job.endHour ? 4 : 0) - 1,
    why: ({ c }) => `Не хватает общения (${Math.round(c.needs.social)}/100)`,
  },
  {
    id: 'relax',
    label: 'Отдыхает',
    state: 'rest',
    icon: '🎧',
    routine: true,
    talkChance: 0.15,
    plan({ c, hour }) {
      const loc = hour >= 9 && hour <= 20 && c.traits.sociability > 0.6 ? 'park' : c.homeId;
      return { locationId: loc, duration: 2 };
    },
    score: ({ c }) => (100 - c.needs.fun) / 14 + c.traits.leisure * 2.5 + c.stress / 40 + gp(c, 'free_time') * 1.5 - 1,
    why: ({ c }) => `Нужно перезагрузиться (отдых ${Math.round(c.needs.fun)}/100, стресс ${Math.round(c.stress)})`,
  },
  {
    id: 'reflect',
    label: 'Размышляет',
    state: 'think',
    icon: '💭',
    routine: false,
    talkChance: 0,
    plan({ c, hour }) {
      if (hour < 7 || hour > 23) return null;
      const loc = c.locationId === 'cafe' || c.locationId === 'park' ? c.locationId : hour < 20 ? 'park' : c.homeId;
      return { locationId: loc, duration: 1 };
    },
    score({ world, c }) {
      const unused = world.observations.some((o) => o.observerId === c.id && !o.used) ? 1 : 0;
      const avatar = c.isAvatar ? 1.2 + unused * 1.5 + (c.counters.inspiration ?? 0) * 0.6 : 0;
      return 0.3 + c.traits.curiosity * 1.5 + avatar + gp(c, 'explore_ideas') * 1.5 - (100 - c.needs.energy) / 40;
    },
    why: ({ c }) => (c.isAvatar ? 'Хочет связать накопившиеся наблюдения в идею' : 'Нужно подумать о своих планах'),
    onEnd({ world, c }) {
      if (c.isAvatar) {
        const trigger = c.counters.newsPending ? 'news' : (c.counters.inspiration ?? 0) > 0 ? 'conversation' : 'reflection';
        const idea = tryGenerateIdea(world, c, trigger);
        if (idea) c.counters.newsPending = 0;
      } else {
        c.stress = clamp(c.stress - 3, 0, 100);
      }
    },
  },
  {
    id: 'explore',
    label: 'Изучает новые возможности',
    state: 'think',
    icon: '🧪',
    routine: false,
    talkChance: 0.1,
    plan(ctx) {
      const { c, hour } = ctx;
      if (hour < 8 || hour > 23) return null;
      if (c.traits.curiosity < 0.55 && !goal(c, 'explore_ideas')) return null;
      const loc = pickWorkspot(ctx);
      return { locationId: loc, duration: 2, fee: feeFor(ctx.world, c, loc) };
    },
    score: ({ c }) => 0.5 + c.traits.curiosity * 2.5 + (c.isAvatar ? 1 : 0) + gp(c, 'explore_ideas') * 2 - (100 - c.needs.energy) / 35,
    why: () => 'Интересно, что нового появилось в технологиях и где есть возможности',
    onHour({ c }) {
      c.skills.ai = clamp(c.skills.ai + 0.06 * (0.5 + c.traits.curiosity), 0, 100);
    },
    onEnd({ world, c }) {
      maybeNoticeProblem(world, c, c.isAvatar ? 0.7 : 0.4, ['explore']);
      if (c.isAvatar && world.observations.filter((o) => o.observerId === c.id && !o.used).length >= 3) {
        tryGenerateIdea(world, c, 'exploration');
      }
    },
  },
  {
    id: 'network',
    label: 'Ищет партнёров',
    state: 'talk',
    icon: '🤝',
    routine: false,
    talkChance: 0.9,
    plan({ world, c, hour, weekend }) {
      if (hour < 10 || hour > 21) return null;
      const need = activeOwnedProject(world, c) || goal(c, 'find_partner') || c.job?.rank === 'owner' || c.job?.rank === 'entrepreneur';
      if (!need) return null;
      const hive = isOpen(world, 'org_hive', hour, weekend);
      const loc = hive ? 'coworking' : 'cafe';
      if (!isOpen(world, loc === 'coworking' ? 'org_hive' : 'org_cafe', hour, weekend)) return null;
      return { locationId: loc, duration: 2, fee: feeFor(world, c, loc) };
    },
    score({ world, c }) {
      const p = activeOwnedProject(world, c);
      const needsPeople = p && p.memberIds.length < 2 ? 2 : 0;
      return 0.5 + c.traits.sociability * 2 + needsPeople + gp(c, 'find_partner') * 2 + c.traits.ambition - (100 - c.needs.energy) / 40;
    },
    why: ({ world, c }) => (activeOwnedProject(world, c) ? 'Проекту нужны люди' : 'Ищет полезные знакомства'),
  },
  {
    id: 'wander',
    label: 'Гуляет',
    state: 'walk',
    icon: '🚶',
    routine: true,
    talkChance: 0.2,
    plan: ({ hour }) => (hour >= 7 && hour <= 22 ? { locationId: 'park', duration: 1 } : null),
    score: ({ c }) => 0.5 + c.traits.leisure * 0.5,
    why: () => 'Просто прогуляться',
  },
];

export const ACTION_BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));

export function actionCtx(world: World, c: Character): ActionCtx {
  return { world, c, hour: hourOf(world.time), weekend: isWeekend(world.time) };
}

/** Для тестов и интерфейса: напоминание о последнем крупном событии. */
export function describeActivity(c: Character): string {
  if (c.activity.arriveAt !== undefined) return `Идёт: ${c.activity.label.toLowerCase()}`;
  return c.activity.label;
}

