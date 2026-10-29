import type { Activity, Character, Goal, GoalType, World } from './types';
import { ACTIONS, ACTION_BY_ID, actionCtx, inWorkWindow, type ActionDef, type ActionPlan } from './actions';
import { nextRandom } from './rng';
import { travelHours } from './locations';
import { ch, org, runwayMonths, transfer } from './economy';
import { recordDecision } from './decisions';
import { considerQuitting } from './career';
import { considerNpcProject, considerProjectFromIdea, activeOwnedProject, activeProjects } from './projects';
import { updateSatisfaction } from './needs';
import { emit } from './events';
import { clamp, money, nextId } from './util';
import { dayOf, hourOf } from './time';
import { relationsOf } from './social';

// Планировщик: выбор следующего действия (каждый раз, когда текущее закончилось)
// и ежедневный пересмотр целей (один раз в день, в свой час у каждого персонажа).

interface Candidate {
  def: ActionDef;
  plan: ActionPlan;
  score: number;
}

export function candidates(world: World, c: Character): Candidate[] {
  const ctx = actionCtx(world, c);
  const out: Candidate[] = [];
  for (const def of ACTIONS) {
    let plan: ActionPlan | null = null;
    try {
      plan = def.plan(ctx);
    } catch {
      plan = null;
    }
    if (!plan) continue;
    let score = def.score(ctx, plan);
    // В рабочее время посторонние дела «стоят» дороже — сказывается дисциплина.
    if (inWorkWindow(c, ctx.hour, ctx.weekend) && def.id !== 'work' && def.state !== 'eat' && def.state !== 'sleep') {
      score -= 1.5 + c.traits.discipline * 3;
    }
    // Дорога — тоже затрата: ленивые и уставшие не любят лишних перемещений.
    if (plan.locationId !== c.locationId) score -= 0.4 + (100 - c.needs.energy) / 200;
    out.push({ def, plan, score });
  }
  return out;
}

/** Срочные потребности перебивают текущее действие. */
export function needsInterrupt(c: Character): string | null {
  if (c.activity.state !== 'sleep' && c.needs.energy < 6) return 'sleep';
  if (c.activity.state !== 'eat' && c.needs.satiety < 6) return 'eat';
  return null;
}

export function chooseAction(world: World, c: Character): Activity {
  const list = candidates(world, c);
  // Шум делает поведение живым; импульсивные персонажи менее предсказуемы.
  const noise = 0.4 + c.traits.impulsivity * 1.4;
  for (const cand of list) cand.score += (nextRandom(world) - 0.5) * noise;
  list.sort((a, b) => b.score - a.score);
  const best = list[0] ?? { def: ACTION_BY_ID.get('wander')!, plan: { locationId: 'park', duration: 1 }, score: 0 };
  const ctx = actionCtx(world, c);
  const travel = travelHours(c.locationId, best.plan.locationId);
  const activity: Activity = {
    actionId: best.def.id,
    label: best.plan.label ?? best.def.label,
    state: best.def.state,
    locationId: best.plan.locationId,
    startedAt: world.time,
    endsAt: world.time + travel + Math.max(1, best.plan.duration),
    targetId: best.plan.targetId,
    projectId: best.plan.projectId,
    icon: best.def.icon,
    why: best.def.why(ctx, best.plan),
  };
  if (travel > 0) {
    activity.arriveAt = world.time + travel;
    c.locationId = 'park'; // в дороге персонаж на улице
  }
  if (best.plan.fee) {
    const o = world.orgs[best.plan.fee.orgId];
    if (o) transfer(world, ch(c), org(o), best.plan.fee.amount);
  }
  best.def.onStart?.(ctx, best.plan);
  // У главного персонажа подробный журнал: каждый небытовой выбор с альтернативами.
  if (c.isAvatar && !best.def.routine) {
    recordDecision(world, c, {
      choice: activity.label,
      reason: activity.why ?? '',
      alternatives: list.slice(0, 4).map((x) => ({ label: x.plan.label ?? x.def.label, score: x.score })),
      expected: expectedOf(best.def.id),
    });
  }
  return activity;
}

function expectedOf(actionId: string): string {
  switch (actionId) {
    case 'reflect':
      return 'Связать наблюдения в идею';
    case 'explore':
      return 'Узнать о новых инструментах и проблемах';
    case 'project':
      return 'Продвинуть проект';
    case 'job_search':
      return 'Найти подходящую вакансию';
    case 'network':
      return 'Найти партнёров';
    case 'self_study':
      return 'Прокачать навык';
    case 'freelance':
      return 'Заработать на заказе';
    case 'overtime':
      return 'Показать результат и приблизить повышение';
    default:
      return 'Улучшить состояние';
  }
}

// --- Ежедневный пересмотр целей -------------------------------------------------

function hasGoal(c: Character, type: GoalType): Goal | undefined {
  return c.goals.find((g) => g.status === 'active' && g.type === type);
}

function addGoal(world: World, c: Character, type: GoalType, label: string, priority: number, cause: string, target?: string): Goal {
  const g: Goal = { id: nextId(world, 'goal'), type, label, priority, progress: 0, createdAt: world.time, status: 'active', horizon: 'short', target };
  c.goals.push(g);
  emit(world, {
    type: 'goal_changed',
    participants: [c.id],
    summary: `${c.name}: новая цель — ${label.toLowerCase()}`,
    cause,
    changes: [`Цель добавлена (приоритет ${Math.round(priority * 100)}%)`],
    importance: c.isAvatar ? 0.5 : 0.35,
  });
  return g;
}

export function updateGoals(world: World, c: Character): void {
  const runway = runwayMonths(c);
  // Прогресс денежных целей.
  for (const g of c.goals) {
    if (g.status !== 'active') continue;
    if (g.type === 'save_money' && g.targetValue) {
      g.progress = clamp((c.money / g.targetValue) * 100, 0, 100);
      if (g.progress >= 100) {
        g.status = 'done';
        emit(world, {
          type: 'goal_changed',
          participants: [c.id],
          summary: `${c.name} достиг(ла) цели: ${g.label.toLowerCase()}`,
          cause: 'Накоплена нужная сумма',
          changes: ['Цель выполнена'],
          importance: 0.5,
        });
      }
    }
    if (g.type === 'pay_debt') {
      if (c.debt <= 0) g.status = 'done';
    }
    if (g.type === 'make_friends') {
      const friends = relationsOf(world, c.id).filter((r) => r.kind === 'friend' || r.kind === 'close_friend').length;
      g.progress = clamp(friends * 20, 0, 100);
    }
    if (g.type === 'get_job' && c.job) g.status = 'done';
    if (g.type === 'start_project' && activeOwnedProject(world, c)?.status === 'launched') {
      g.status = 'done';
      g.progress = 100;
    }
    if (g.type === 'explore_ideas') {
      g.progress = clamp(Object.values(world.ideas).filter((i) => i.authorId === c.id).length * 15, 0, 100);
    }
  }

  // Новые цели как реакция на обстоятельства.
  if (!c.job && !c.student && !hasGoal(c, 'get_job') && !activeOwnedProject(world, c) && !c.freelancer) {
    addGoal(world, c, 'get_job', 'Найти работу', runway < 2 ? 1 : 0.7, 'Нет постоянного дохода');
  }
  if (c.debt > 0 && !hasGoal(c, 'pay_debt')) {
    addGoal(world, c, 'pay_debt', 'Закрыть долги', 0.7, `Долг ${money(c.debt)} давит`);
  }
  if (c.job && c.traits.ambition > 0.6 && c.job.performance > 65 && !hasGoal(c, 'promotion') && ['intern', 'specialist', 'senior'].includes(c.job.rank)) {
    if ((c.counters.lastPromotionGoal ?? -999) < world.time - 24 * 20) {
      c.counters.lastPromotionGoal = world.time;
      addGoal(world, c, 'promotion', 'Получить повышение', 0.6, 'Хорошие результаты на работе и амбиции');
    }
  }
  const launched = activeOwnedProject(world, c);
  if (launched?.status === 'launched' && !hasGoal(c, 'grow_project')) {
    addGoal(world, c, 'grow_project', `Вырастить «${launched.name}»`, 0.75, 'Проект запущен — теперь важен рост', launched.id);
  }
  if (c.isAvatar && !hasGoal(c, 'explore_ideas') && !launched && Object.values(world.ideas).length < 12) {
    addGoal(world, c, 'explore_ideas', 'Найти идею собственного проекта', 0.7, 'Хочется своего дела');
  }
  if (c.stress > 75 && !hasGoal(c, 'free_time') && c.traits.leisure > 0.4) {
    addGoal(world, c, 'free_time', 'Снизить нагрузку и отдохнуть', 0.6, `Стресс ${Math.round(c.stress)}/100`);
  }
  // Устаревшие цели отбрасываются.
  for (const g of c.goals) {
    if (g.status === 'active' && g.type === 'free_time' && c.stress < 30 && c.traits.leisure < 0.6 && world.time - g.createdAt > 24 * 14) g.status = 'dropped';
  }
  // Храним ограниченное число завершённых целей.
  const inactive = c.goals.filter((g) => g.status !== 'active');
  if (inactive.length > 12) {
    const drop = new Set(inactive.slice(0, inactive.length - 12).map((g) => g.id));
    c.goals = c.goals.filter((g) => !drop.has(g.id));
  }
}

/** Краткосрочный план на день (для профиля «Планы на ближайшее будущее»). */
export function buildTasks(world: World, c: Character): void {
  const tasks: Character['tasks'] = [];
  const day = dayOf(world.time);
  if (c.job) tasks.push({ id: `t_${day}_work`, label: `Работа ${c.job.startHour}:00–${c.job.endHour}:00 (${c.job.title})` });
  if (c.student) tasks.push({ id: `t_${day}_uni`, label: 'Лекции в университете' });
  for (const g of c.goals.filter((x) => x.status === 'active').sort((a, b) => b.priority - a.priority).slice(0, 3)) {
    const label =
      g.type === 'get_job'
        ? 'Откликнуться на подходящие вакансии'
        : g.type === 'learn_skill' || g.type === 'change_career'
          ? `Позаниматься: ${g.target ?? 'навык'}`
          : g.type === 'start_project' || g.type === 'explore_ideas'
            ? 'Подумать над идеями и наблюдениями'
            : g.type === 'grow_project'
              ? 'Поработать над проектом и найти пользователей'
              : g.type === 'make_friends' || g.type === 'find_partner'
                ? 'Сходить туда, где есть люди'
                : g.type === 'free_time'
                  ? 'Нормально отдохнуть вечером'
                  : g.label;
    tasks.push({ id: `t_${day}_${g.id}`, label, relatedId: g.id });
  }
  for (const p of activeProjects(world, c)) {
    const t = p.tasks.find((x) => x.assigneeId === c.id && !x.done);
    if (t) tasks.push({ id: `t_${day}_${t.id}`, label: `«${p.name}»: ${t.label}`, relatedId: p.id });
  }
  for (const a of c.jobApplications) {
    const o = world.orgs[a.orgId];
    tasks.push({ id: `t_${a.openingId}`, label: `Ждёт ответа от «${o?.name ?? '?'}»`, dueAt: a.decideAt });
  }
  c.tasks = tasks.slice(0, 7);
}

function recomputeRank(world: World, c: Character): void {
  const ownsLaunched = activeOwnedProject(world, c)?.status === 'launched';
  if (c.influence >= 75 && c.reputation >= 70) c.rank = 'influencer';
  else if (c.job?.rank === 'owner') c.rank = 'owner';
  else if (c.job?.rank === 'entrepreneur' || (ownsLaunched && !c.job)) c.rank = 'entrepreneur';
  else if (c.job) c.rank = c.job.rank;
  else c.rank = c.student ? 'student' : ownsLaunched ? 'entrepreneur' : 'none';
  // Влияние: связи, репутация, собственность.
  const respected = relationsOf(world, c.id).filter((r) => {
    const back = world.relations[`${r.to}->${c.id}`];
    return back && back.respect > 60;
  }).length;
  const target = c.reputation * 0.4 + respected * 4 + (c.job?.rank === 'owner' ? 20 : 0) + (ownsLaunched ? 10 : 0);
  c.influence = clamp(c.influence + (target - c.influence) * 0.05, 0, 100);
}

export function planDay(world: World, c: Character): void {
  c.lastPlannedDay = dayOf(world.time);
  updateSatisfaction(world, c);
  updateGoals(world, c);
  considerQuitting(world, c);
  if (c.isAvatar) considerProjectFromIdea(world, c);
  else considerNpcProject(world, c);
  recomputeRank(world, c);
  buildTasks(world, c);
}

export function shouldPlan(world: World, c: Character): boolean {
  return c.lastPlannedDay !== dayOf(world.time) && hourOf(world.time) >= c.planningHour;
}
