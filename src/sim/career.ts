import type { Character, Job, Opening, Org, Rank, World } from './types';
import { clamp, money, nextId } from './util';
import { emit, remember } from './events';
import { chance, nextRandom, randInt } from './rng';
import { employees, payroll } from './economy';
import { getRelation, adjustRelation, skillName } from './social';
import { noticeSpecific } from './ideas/observe';
import { recordDecision } from './decisions';
import { weekdayOf } from './time';

// Карьера: вакансии, отклики, найм, ревью эффективности, повышения, увольнения.

const NEXT_RANK: Partial<Record<Rank, Rank>> = { intern: 'specialist', specialist: 'senior', senior: 'manager' };
const RANK_SKILL: Partial<Record<Rank, number>> = { specialist: 35, senior: 60, manager: 68 };
/** Минимальный стаж на текущей ступени (дни) перед следующим повышением. */
const RANK_TENURE: Partial<Record<Rank, number>> = { specialist: 30, senior: 60, manager: 120 };
export const RANK_LABEL: Record<Rank, string> = {
  none: 'Без работы',
  student: 'Студент',
  intern: 'Стажёр',
  specialist: 'Специалист',
  senior: 'Старший специалист',
  manager: 'Руководитель',
  entrepreneur: 'Предприниматель',
  owner: 'Владелец бизнеса',
  influencer: 'Влиятельный участник',
};

export function allOpenings(world: World): { org: Org; opening: Opening }[] {
  const out: { org: Org; opening: Opening }[] = [];
  for (const o of Object.values(world.orgs)) for (const op of o.openings) out.push({ org: o, opening: op });
  return out;
}

/** Насколько вакансия подходит персонажу (0 — не подходит). */
export function openingFit(c: Character, op: Opening): number {
  const skill = c.skills[op.skill];
  if (skill < op.minSkill * 0.75) return 0;
  const money = op.salary / Math.max(40000, c.job?.salary ?? 0);
  let fit = (skill - op.minSkill * 0.75) / 40 + money * 0.5 * (0.5 + c.traits.greed);
  const career = c.goals.find((g) => g.status === 'active' && g.type === 'change_career');
  if (career?.target === op.skill) fit += 1;
  if (c.job && op.salary <= c.job.salary) fit *= 0.3;
  // Опытные люди не рвутся в стажёры.
  if (op.rank === 'intern' && Math.max(...Object.values(c.skills)) >= 60) fit *= 0.3;
  return Math.max(0, fit);
}

export function applyForJob(world: World, c: Character, orgId: string, op: Opening): void {
  if (c.jobApplications.some((a) => a.openingId === op.id)) return;
  c.jobApplications.push({ orgId, openingId: op.id, appliedAt: world.time, decideAt: world.time + randInt(world, 24, 72) });
}

function candidateScore(world: World, c: Character, org: Org, op: Opening): number {
  let s = c.skills[op.skill] - op.minSkill + c.reputation * 0.3 + nextRandom(world) * 25;
  if (c.counters[`referral_${org.id}`]) s += 15;
  if (org.ownerId) {
    const r = getRelation(world, org.ownerId, c.id);
    if (r) s += r.respect * 0.1 + r.affinity * 0.1;
  }
  return s;
}

/** Решения по откликам, у которых подошёл срок. Среди претендентов выигрывает лучший. */
export function processApplications(world: World): void {
  const due = new Map<string, { c: Character; orgId: string }[]>();
  for (const id of world.order) {
    const c = world.characters[id];
    for (const a of c.jobApplications) {
      if (a.decideAt <= world.time) {
        const list = due.get(a.openingId) ?? [];
        list.push({ c, orgId: a.orgId });
        due.set(a.openingId, list);
      }
    }
  }
  for (const [openingId, list] of due) {
    const org = world.orgs[list[0].orgId];
    const op = org?.openings.find((o) => o.id === openingId);
    // Все, кто ждал по этой вакансии, получают ответ.
    for (const { c } of list) c.jobApplications = c.jobApplications.filter((a) => a.openingId !== openingId);
    if (!org || !op) {
      for (const { c } of list) rejected(world, c, org?.name ?? 'компания', 'вакансию уже закрыли');
      continue;
    }
    const scored = list
      .map(({ c }) => ({ c, s: candidateScore(world, c, org, op) }))
      .sort((a, b) => b.s - a.s);
    const best = scored[0];
    if (best.s >= 10) {
      hire(world, best.c, org, op);
      for (const { c } of scored.slice(1)) rejected(world, c, org.name, `выбрали другого кандидата (${best.c.name})`);
    } else {
      for (const { c } of scored) rejected(world, c, org.name, `не хватило опыта в «${skillName(op.skill)}»`);
    }
  }
}

function rejected(world: World, c: Character, orgName: string, why: string): void {
  c.mood = clamp(c.mood - 6, 0, 100);
  c.stress = clamp(c.stress + 4, 0, 100);
  c.counters.rejections = (c.counters.rejections ?? 0) + 1;
  const ev = emit(world, {
    type: 'job_search',
    participants: [c.id],
    summary: `${c.name} получил(а) отказ от «${orgName}»`,
    cause: why,
    changes: ['Настроение снизилось'],
    importance: c.isAvatar ? 0.5 : 0.3,
  });
  remember(world, c, 'failure', `Отказ от «${orgName}»: ${why}`, 0.5);
  noticeSpecific(world, c, 'job_search_pain', 'Сам(а) столкнулся(ась) с отказом', ev.id);
}

export function hire(world: World, c: Character, org: Org, op: Opening): void {
  const prev = c.job;
  if (prev) {
    leaveJob(world, c, 'quit', `перешёл(ла) в «${org.name}»`);
  }
  org.openings = org.openings.filter((o) => o.id !== op.id);
  const job: Job = {
    orgId: org.id,
    title: op.title,
    rank: op.rank,
    salary: op.salary,
    startHour: org.workHours[0],
    endHour: org.workHours[1],
    weekends: org.kind === 'cafe' || org.kind === 'shop',
    performance: 55,
    hiredAt: world.time,
    hoursToday: 0,
    warnings: 0,
    skill: op.skill,
  };
  c.job = job;
  c.rank = op.rank;
  c.freelancer = c.freelancer && op.rank === 'intern';
  c.mood = clamp(c.mood + 15, 0, 100);
  c.stress = clamp(c.stress - 10, 0, 100);
  delete c.counters[`referral_${org.id}`];
  for (const g of c.goals) {
    if (g.status === 'active' && g.type === 'get_job') {
      g.status = 'done';
      g.progress = 100;
    }
    if (g.status === 'active' && g.type === 'change_career' && g.target === op.skill) {
      g.status = 'done';
      g.progress = 100;
    }
  }
  const ev = emit(world, {
    type: 'hired',
    participants: [c.id, ...(org.ownerId ? [org.ownerId] : [])],
    locationId: org.locationId,
    summary: `${c.name} устроился(ась) в «${org.name}» на позицию «${op.title}»`,
    cause: `Отклик на вакансию; навык «${skillName(op.skill)}» ${Math.round(c.skills[op.skill])}/100`,
    changes: [`Зарплата: ${money(op.salary)} в месяц`, prev ? `Ушёл(ла) с прежней работы` : 'Появился стабильный доход'],
    importance: 0.7,
    relatedIds: [org.id],
  });
  org.history.push({ time: world.time, text: `Нанят(а) ${c.name} — ${op.title}` });
  remember(world, c, 'success', `Получил(а) работу в «${org.name}»`, 0.8, [org.id]);
  // Новые коллеги замечают проблему адаптации.
  if (chance(world, 0.5)) noticeSpecific(world, c, 'onboarding_chaos', 'Первые дни на новом месте', ev.id);
}

export function leaveJob(world: World, c: Character, how: 'quit' | 'fired', why: string): void {
  const j = c.job;
  if (!j) return;
  const org = world.orgs[j.orgId];
  c.job = null;
  c.rank = c.student ? 'student' : 'none';
  if (org) {
    // Освободившаяся позиция открывается снова (если это не владелец).
    if (j.rank !== 'owner' && j.rank !== 'entrepreneur') {
      org.openings.push({
        id: nextId(world, 'open'),
        title: j.title,
        rank: j.rank,
        skill: j.skill,
        minSkill: Math.max(15, (RANK_SKILL[j.rank] ?? 30) - 5),
        salary: j.salary,
        createdAt: world.time,
      });
    }
    org.history.push({ time: world.time, text: `${c.name} ${how === 'fired' ? 'уволен(а)' : 'ушёл(ла)'}: ${why}` });
  }
  emit(world, {
    type: how,
    participants: [c.id, ...(org?.ownerId && org.ownerId !== c.id ? [org.ownerId] : [])],
    locationId: org?.locationId,
    summary: how === 'fired' ? `${c.name} уволен(а) из «${org?.name}»` : `${c.name} ушёл(ла) из «${org?.name}»`,
    cause: why,
    changes: ['Потерян постоянный доход', 'Открылась вакансия'],
    importance: 0.7,
  });
  if (how === 'fired') {
    c.mood = clamp(c.mood - 25, 0, 100);
    c.stress = clamp(c.stress + 20, 0, 100);
    c.reputation = clamp(c.reputation - 5, 0, 100);
    remember(world, c, 'failure', `Уволили из «${org?.name}»: ${why}`, 0.9);
  }
}

/** Наводка на работу: A рекомендует B в свою компанию. */
export function jobTip(world: World, a: Character, b: Character): string | null {
  if (!a.job) return null;
  const org = world.orgs[a.job.orgId];
  const op = org?.openings.find((o) => b.skills[o.skill] >= o.minSkill * 0.7);
  if (!org || !op) return null;
  b.counters[`referral_${org.id}`] = 1;
  return `${op.title} в «${org.name}»`;
}

/** Еженедельное ревью в пятницу вечером: повышения, предупреждения, увольнения, новые вакансии. */
export function weeklyReview(world: World): void {
  for (const org of Object.values(world.orgs)) {
    const staff = employees(world, org.id);
    for (const c of staff) {
      const j = c.job;
      if (!j || j.orgId !== org.id) continue;
      if (j.rank === 'owner' || j.rank === 'entrepreneur') continue;
      const tenureDays = (world.time - Math.max(j.hiredAt, c.counters.lastPromotionAt ?? -1e9)) / 24;
      const managers = staff.filter((s) => s.job?.orgId === org.id && s.job.rank === 'manager').length;
      const managerSlots = org.kind === 'company' ? 2 : 1;
      const next = NEXT_RANK[j.rank];
      const ownerRespect = org.ownerId ? (getRelation(world, org.ownerId, c.id)?.respect ?? 40) : 50;
      if (
        next &&
        (next !== 'manager' || managers < managerSlots) &&
        j.performance >= 72 &&
        tenureDays >= (RANK_TENURE[next] ?? 30) &&
        c.skills[j.skill] >= (RANK_SKILL[next] ?? 100) &&
        org.balance > payroll(world, org) * 2 &&
        chance(world, 0.12 + c.traits.ambition * 0.15 + (ownerRespect - 50) / 300)
      ) {
        const old = j.title;
        j.rank = next;
        j.salary = Math.round(j.salary * 1.3);
        j.title = promotedTitle(old, next);
        j.performance = 60;
        c.counters.lastPromotionAt = world.time;
        c.rank = next;
        c.reputation = clamp(c.reputation + 6, 0, 100);
        c.mood = clamp(c.mood + 20, 0, 100);
        for (const g of c.goals) if (g.status === 'active' && g.type === 'promotion') { g.status = 'done'; g.progress = 100; }
        emit(world, {
          type: 'promoted',
          participants: [c.id, ...(org.ownerId ? [org.ownerId] : [])],
          locationId: org.locationId,
          summary: `${c.name} получил(а) повышение: ${j.title} в «${org.name}»`,
          cause: `Высокая эффективность (${Math.round(j.performance)}), стаж ${Math.round(tenureDays)} дн., навык «${skillName(j.skill)}» ${Math.round(c.skills[j.skill])}`,
          changes: [`Новая зарплата: ${money(j.salary)}`, 'Репутация выросла'],
          importance: 0.75,
          relatedIds: [org.id],
        });
        remember(world, c, 'success', `Повышение до «${j.title}»`, 0.85, [org.id]);
        // Коллеги того же ранга могут позавидовать.
        for (const other of staff) {
          if (other === c || !other.job) continue;
          if (other.traits.greed > 0.7 && other.traits.ambition > 0.7) {
            adjustRelation(world, other, c, { affinity: -8, respect: 3 });
            const r = getRelation(world, other.id, c.id);
            if (r && r.affinity < 10) r.kind = 'rival';
          }
        }
      } else if (j.performance < 35 && tenureDays > 5) {
        j.warnings++;
        if (j.warnings >= 3 || (j.warnings >= 2 && chance(world, 0.5))) {
          leaveJob(world, c, 'fired', `низкая эффективность (${Math.round(j.performance)}/100) после предупреждений`);
          continue;
        }
        c.stress = clamp(c.stress + 12, 0, 100);
        emit(world, {
          type: 'warning',
          participants: [c.id],
          locationId: org.locationId,
          summary: `${c.name} получил(а) предупреждение в «${org.name}»`,
          cause: `Эффективность упала до ${Math.round(j.performance)}/100 (пропуски, усталость или низкий навык)`,
          changes: [`Предупреждений: ${j.warnings}`],
          importance: 0.55,
        });
        remember(world, c, 'failure', `Предупреждение о низкой эффективности`, 0.6, [org.id]);
      } else if (j.performance >= 50 && j.warnings > 0) {
        j.warnings = Math.max(0, j.warnings - 1);
      }
    }

    // Вакансии: прибыльная организация расширяется, убыточная — сокращает.
    const pr = payroll(world, org);
    if (org.balance > pr * 6 + 500_000 && org.openings.length < 2 && staff.length < 8 && chance(world, 0.35)) {
      const skill = staff[randInt(world, 0, Math.max(0, staff.length - 1))]?.job?.skill ?? 'service';
      const rank: Rank = chance(world, 0.4) ? 'intern' : 'specialist';
      org.openings.push({
        id: nextId(world, 'open'),
        title: rank === 'intern' ? `Стажёр (${skillName(skill).toLowerCase()})` : `Специалист (${skillName(skill).toLowerCase()})`,
        rank,
        skill,
        minSkill: rank === 'intern' ? 15 : 40,
        salary: rank === 'intern' ? 45000 : 90000,
        createdAt: world.time,
      });
      emit(world, {
        type: 'business',
        participants: org.ownerId ? [org.ownerId] : [],
        locationId: org.locationId,
        summary: `«${org.name}» открыла вакансию: ${org.openings[org.openings.length - 1].title}`,
        cause: 'Компания растёт и может позволить нового сотрудника',
        changes: ['Новая вакансия на рынке'],
        importance: 0.35,
        relatedIds: [org.id],
      });
    } else if (org.balance < pr * 0.5 && staff.length > 1) {
      const victim = staff
        .filter((s) => s.job?.orgId === org.id && s.job.rank !== 'owner' && s.job.rank !== 'entrepreneur')
        .sort((a, b) => (a.job?.performance ?? 0) - (b.job?.performance ?? 0))[0];
      if (victim) leaveJob(world, victim, 'fired', `«${org.name}» сокращает расходы — денег не хватает на зарплаты`);
    }
    // Старые вакансии закрываются.
    org.openings = org.openings.filter((op) => world.time - op.createdAt < 24 * 45);
  }
}

function promotedTitle(old: string, next: Rank): string {
  if (next === 'specialist') {
    const m = old.match(/^Стажёр\s*\((.+)\)$/);
    if (m) return `Специалист (${m[1]})`;
    const rest = old.replace(/^Стажёр-?\s*/i, '').trim();
    return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : 'Специалист';
  }
  if (next === 'senior') {
    if (/^Старш/.test(old)) return old;
    const base = old.replace(/^Младший\s+/i, '');
    return `Старший ${base.charAt(0).toLowerCase()}${base.slice(1)}`;
  }
  if (next === 'manager') return 'Руководитель направления';
  return old;
}

/** Ежедневное обновление эффективности по итогам рабочего дня. */
export function dailyPerformance(world: World): void {
  const yesterday = world.time - 24;
  const workday = weekdayOf(yesterday) < 5;
  for (const id of world.order) {
    const c = world.characters[id];
    const j = c.job;
    if (!j) continue;
    const required = workday || j.weekends ? j.endHour - j.startHour : 0;
    if (required > 0) {
      const ratio = j.hoursToday / required;
      if (ratio < 0.4) j.performance = clamp(j.performance - 6, 0, 100);
      else if (ratio > 1.1) j.performance = clamp(j.performance + 1, 0, 100);
    }
    j.hoursToday = 0;
  }
}

/** Решение уволиться (вызывается из ежедневного планирования). */
export function considerQuitting(world: World, c: Character): boolean {
  const j = c.job;
  if (!j || j.rank === 'owner' || j.rank === 'entrepreneur') return false;
  const runway = c.money / Math.max(1, c.housing.rent + c.livingCost);
  const unhappy = c.satisfaction < 35 && c.stress > 55;
  const ownProject = c.projectIds.map((id) => world.projects[id]).find((p) => p && p.ownerId === c.id && (p.status === 'active' || p.status === 'launched'));
  const projectPull = ownProject && ownProject.users > 30 && runway > 4;
  if (!unhappy && !projectPull) return false;
  const quitScore = (unhappy ? 1 : 0) + (projectPull ? 1.2 : 0) + c.traits.impulsivity - c.traits.caution + (runway > 6 ? 0.5 : -0.8);
  const stayScore = 1 + (runway < 3 ? 1 : 0) + c.traits.caution * 0.5;
  const searchScore = 0.8 + c.traits.discipline * 0.5;
  const options = [
    { label: 'Уволиться сейчас', score: quitScore },
    { label: 'Остаться и терпеть', score: stayScore },
    { label: 'Искать новую работу, не увольняясь', score: searchScore },
  ].sort((a, b) => b.score - a.score);
  const choice = options[0];
  if (choice.label === 'Остаться и терпеть') return false;
  if ((c.counters.lastQuitThought ?? -999) > world.time - 24 * 5) return false;
  c.counters.lastQuitThought = world.time;
  const why = projectPull
    ? `собственный проект «${ownProject!.name}» набрал ${ownProject!.users} пользователей, а сбережений хватит на ${runway.toFixed(1)} мес.`
    : `удовлетворённость жизнью упала до ${Math.round(c.satisfaction)}, стресс ${Math.round(c.stress)}`;
  if (choice.label === 'Уволиться сейчас') {
    recordDecision(world, c, {
      choice: `Уволиться из «${world.orgs[j.orgId]?.name}»`,
      reason: `Решение: ${why}. Импульсивность и запас денег перевесили осторожность.`,
      alternatives: options,
      expected: projectPull ? 'Больше времени на свой проект и шанс на рост' : 'Отдохнуть и найти более подходящее место',
      important: true,
    });
    leaveJob(world, c, 'quit', why);
    c.stress = clamp(c.stress - 20, 0, 100);
    if (!projectPull && !c.goals.some((g) => g.status === 'active' && g.type === 'get_job')) {
      c.goals.push({ id: nextId(world, 'goal'), type: 'get_job', label: 'Найти работу получше', priority: 0.8, progress: 0, createdAt: world.time, status: 'active', horizon: 'short' });
    }
    return true;
  }
  if (!c.counters.searchingWhileEmployed) {
    c.counters.searchingWhileEmployed = 1;
    recordDecision(world, c, {
      choice: 'Начать искать работу, не увольняясь',
      reason: `Причина: ${why}. Рисковать доходом не хочется.`,
      alternatives: options,
      expected: 'Найти более подходящее место без периода без дохода',
      important: true,
    });
  }
  return false;
}
