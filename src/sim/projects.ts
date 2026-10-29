import type { Character, Idea, Project, SkillKey, World, WorldEvent } from './types';
import { clamp, money, nextId, pushCapped } from './util';
import { emit, remember } from './events';
import { chance, nextRandom, pick, randRange } from './rng';
import { adjustRelation, getRelation, skillName } from './social';
import { ch, payExternal, receiveExternal, runwayMonths } from './economy';
import { recordDecision, resolveDecision } from './decisions';
import { noticeSpecific } from './ideas/observe';
import { PROBLEMS, problemById } from './ideas/catalog';
import { tryGenerateIdea } from './ideas/generator';
import { dayOf } from './time';

// Проекты и маленькие бизнесы персонажей: участники, затраты, прогресс,
// запуск, пользователи, выручка, история и возможный провал.

const NAME_A = ['Тихий', 'Быстрый', 'Умный', 'Лёгкий', 'Ясный', 'Добрый', 'Точный', 'Свежий'];
const NAME_B = ['Поток', 'Счёт', 'Помощник', 'Компас', 'Блокнот', 'Мост', 'Радар', 'Ключ'];

export function activeOwnedProject(world: World, c: Character): Project | undefined {
  return c.projectIds
    .map((id) => world.projects[id])
    .find((p) => p && p.ownerId === c.id && (p.status === 'active' || p.status === 'launched' || p.status === 'planning'));
}

export function activeProjects(world: World, c: Character): Project[] {
  return c.projectIds.map((id) => world.projects[id]).filter((p) => p && (p.status === 'active' || p.status === 'launched' || p.status === 'planning'));
}

function projectHistory(p: Project, time: number, text: string, eventId?: string): void {
  pushCapped(p.history, { time, text, eventId }, 60);
}

export interface StartProjectInput {
  name: string;
  description: string;
  kind: Project['kind'];
  skill: SkillKey;
  ideaId?: string;
  reason: string;
  alternatives: { label: string; score: number }[];
}

export function startProject(world: World, owner: Character, input: StartProjectInput): Project {
  const p: Project = {
    id: nextId(world, 'proj'),
    name: input.name,
    description: input.description,
    kind: input.kind,
    ownerId: owner.id,
    memberIds: [owner.id],
    status: 'active',
    progress: 0,
    quality: 20 + owner.skills[input.skill] * 0.3,
    users: 0,
    spent: 0,
    revenueTotal: 0,
    expectedValue: Math.round(50 + owner.traits.ambition * 50 + nextRandom(world) * 30),
    createdAt: world.time,
    ideaId: input.ideaId,
    skill: input.skill,
    tasks: [
      { id: nextId(world, 'task'), label: 'Собрать первую версию', assigneeId: owner.id, done: false },
      { id: nextId(world, 'task'), label: 'Найти первых пользователей', assigneeId: owner.id, done: false },
    ],
    history: [],
    lastWorkedAt: world.time,
  };
  world.projects[p.id] = p;
  owner.projectIds.push(p.id);
  const dec = recordDecision(world, owner, {
    choice: `Начать проект «${p.name}»`,
    reason: input.reason,
    alternatives: input.alternatives,
    expected: `Запустить первую версию и проверить, нужна ли она людям (ожидаемая ценность по личной оценке: ${p.expectedValue}/150)`,
    important: true,
    relatedIds: [p.id, ...(input.ideaId ? [input.ideaId] : [])],
  });
  const ev = emit(world, {
    type: 'project_started',
    participants: [owner.id],
    locationId: owner.locationId,
    summary: `${owner.name} начал(а) проект «${p.name}»`,
    cause: input.reason,
    context: input.description,
    changes: ['Создан проект', 'Появились задачи: первая версия, первые пользователи'],
    importance: 0.75,
    relatedIds: [p.id, dec.id, ...(input.ideaId ? [input.ideaId] : [])],
  });
  projectHistory(p, world.time, `Проект создан: ${input.reason}`, ev.id);
  for (const g of owner.goals) if (g.status === 'active' && (g.type === 'start_project' || g.type === 'explore_ideas')) g.progress = Math.max(g.progress, 50);
  if (input.ideaId) {
    const idea = world.ideas[input.ideaId];
    if (idea) idea.timeline.push({ time: world.time, text: `${owner.name} начал(а) проект «${p.name}» по этой идее` });
  }
  return p;
}

/** Один час работы над проектом. */
export function workOnProject(world: World, c: Character, p: Project): void {
  if (p.status !== 'active' && p.status !== 'launched') return;
  const skill = c.skills[p.skill];
  const energyF = 0.4 + c.needs.energy / 160;
  const synergy = 1 + (p.memberIds.length - 1) * 0.25;
  p.lastWorkedAt = world.time;
  c.counters[`lastWork_${p.id}`] = world.time;
  if (p.status === 'active') {
    const before = p.progress;
    p.progress = clamp(p.progress + (0.35 + skill / 90) * energyF * synergy * randRange(world, 0.7, 1.3), 0, 100);
    p.quality = clamp(p.quality + (skill / 100) * 0.25 * energyF, 0, 100);
    if (before < 50 && p.progress >= 50) {
      const ev = emit(world, {
        type: 'project_milestone',
        participants: p.memberIds,
        summary: `Проект «${p.name}» готов наполовину`,
        cause: 'Участники регулярно над ним работают',
        changes: ['Прогресс: 50%'],
        importance: 0.4,
        relatedIds: [p.id],
      });
      projectHistory(p, world.time, 'Готово 50%', ev.id);
    }
    if (p.progress >= 100) launchProject(world, p);
  } else {
    // После запуска работа улучшает качество и удерживает пользователей.
    p.quality = clamp(p.quality + (skill / 100) * 0.12, 0, 100);
  }
  // Небольшая скорость обучения в процессе.
  c.skills[p.skill] = clamp(c.skills[p.skill] + 0.04, 0, 100);
}

function launchProject(world: World, p: Project): void {
  p.status = 'launched';
  p.launchedAt = world.time;
  p.users = Math.round(2 + p.quality / 15);
  const t = p.tasks.find((x) => x.label === 'Собрать первую версию');
  if (t) t.done = true;
  const owner = world.characters[p.ownerId];
  const ev = emit(world, {
    type: 'project_launched',
    participants: p.memberIds,
    summary: `Запуск! «${p.name}» доступен первым пользователям`,
    cause: 'Первая версия готова',
    changes: [`Первые пользователи: ${p.users}`, `Качество: ${Math.round(p.quality)}/100`],
    importance: 0.8,
    relatedIds: [p.id],
  });
  projectHistory(p, world.time, 'Запуск первой версии', ev.id);
  for (const id of p.memberIds) {
    const m = world.characters[id];
    if (!m) continue;
    m.mood = clamp(m.mood + 15, 0, 100);
    m.reputation = clamp(m.reputation + 3, 0, 100);
    remember(world, m, 'success', `Запустили «${p.name}»`, 0.8, [p.id]);
  }
  if (owner && owner.rank !== 'owner') owner.rank = 'entrepreneur';
  if (p.ideaId && world.ideas[p.ideaId]) world.ideas[p.ideaId].timeline.push({ time: world.time, text: `Проект «${p.name}» запущен` });
  if (owner) resolveDecision(owner, (d) => d.choice.includes(p.name), `Проект запущен через ${Math.round((world.time - p.createdAt) / 24)} дн.`);
}

/** Ежедневный расчёт проектов: расходы, пользователи, выручка, провалы. */
export function dailyProjects(world: World): void {
  for (const p of Object.values(world.projects)) {
    if (p.status !== 'active' && p.status !== 'launched') continue;
    const owner = world.characters[p.ownerId];
    if (!owner) continue;
    // Затраты (хостинг, инструменты, реклама).
    const cost = p.status === 'launched' ? 400 + p.users * 4 : 250;
    const { paid } = payExternal(world, ch(owner), cost);
    p.spent += paid;

    if (p.status === 'launched') {
      const sales = (owner.skills.sales + owner.skills.communication) / 200;
      const growth = (p.quality / 100) * (0.4 + sales) * (1 + owner.influence / 100) * randRange(world, 0, 4);
      const churn = p.users * (0.02 + (1 - p.quality / 100) * 0.04);
      p.users = Math.max(0, Math.round(p.users + growth - churn));
      const revenue = p.users * 12 * (0.5 + p.quality / 200);
      if (revenue > 0) {
        // Выручка делится между участниками поровну.
        const share = revenue / p.memberIds.length;
        for (const id of p.memberIds) {
          const m = world.characters[id];
          if (m) receiveExternal(world, ch(m), share);
        }
        p.revenueTotal += Math.round(revenue);
      }
      const days = (world.time - (p.launchedAt ?? world.time)) / 24;
      if (p.users >= 50 && !p.history.some((h) => h.text.startsWith('50 пользователей'))) {
        const ev = emit(world, {
          type: 'project_milestone',
          participants: p.memberIds,
          summary: `У «${p.name}» уже 50 активных пользователей`,
          cause: 'Качество продукта и усилия по продвижению',
          changes: [`Выручка всего: ${money(p.revenueTotal)}`],
          importance: 0.6,
          relatedIds: [p.id],
        });
        projectHistory(p, world.time, '50 пользователей', ev.id);
        owner.reputation = clamp(owner.reputation + 5, 0, 100);
        owner.influence = clamp(owner.influence + 4, 0, 100);
      }
      if (days > 25 && p.users < 6 && p.spent > p.revenueTotal) {
        failProject(world, p, 'за месяц после запуска продукт так и не нашёл пользователей');
        continue;
      }
    }
    // Заброшенный проект.
    if (world.time - p.lastWorkedAt > 24 * 16) {
      abandonProject(world, p, owner, 'над проектом давно никто не работал');
      continue;
    }
    // Нарушенные договорённости: участник обещал работать, но пропал.
    for (const id of p.memberIds) {
      if (id === p.ownerId) continue;
      const m = world.characters[id];
      if (!m) continue;
      const last = m.counters[`lastWork_${p.id}`] ?? p.createdAt;
      if (world.time - last > 24 * 12) breakCollaboration(world, p, m, owner);
    }
  }
}

export function failProject(world: World, p: Project, why: string): void {
  p.status = 'failed';
  const owner = world.characters[p.ownerId];
  const ev = emit(world, {
    type: 'project_failed',
    participants: p.memberIds,
    summary: `Проект «${p.name}» закрыт: ${why}`,
    cause: why,
    changes: [`Потрачено: ${money(p.spent)}, заработано: ${money(p.revenueTotal)}`],
    importance: 0.75,
    relatedIds: [p.id],
  });
  projectHistory(p, world.time, `Провал: ${why}`, ev.id);
  afterFailure(world, p, ev);
  if (owner) resolveDecision(owner, (d) => d.choice.includes(p.name), `Проект провалился: ${why}`);
}

export function abandonProject(world: World, p: Project, owner: Character, why: string): void {
  p.status = 'abandoned';
  const ev = emit(world, {
    type: 'project_abandoned',
    participants: p.memberIds,
    summary: `${owner.name} забросил(а) проект «${p.name}»`,
    cause: why,
    changes: [`Прогресс остановился на ${Math.round(p.progress)}%`],
    importance: 0.6,
    relatedIds: [p.id],
  });
  projectHistory(p, world.time, `Заброшен: ${why}`, ev.id);
  afterFailure(world, p, ev);
  resolveDecision(owner, (d) => d.choice.includes(p.name), `Проект заброшен: ${why}`);
}

function afterFailure(world: World, p: Project, ev: WorldEvent): void {
  for (const id of p.memberIds) {
    const m = world.characters[id];
    if (!m) continue;
    m.mood = clamp(m.mood - 15, 0, 100);
    m.stress = clamp(m.stress + 10, 0, 100);
    remember(world, m, 'failure', `Проект «${p.name}» не взлетел`, 0.85, [p.id]);
    noticeSpecific(world, m, 'mvp_no_demand', `Опыт с «${p.name}»`, ev.id);
    // Меняются цели: после провала люди становятся осторожнее.
    for (const g of m.goals) if (g.status === 'active' && (g.type === 'start_project' || g.type === 'grow_project') && g.target === p.id) g.status = 'dropped';
    if (m.money < (m.housing.rent + m.livingCost) * 2 && !m.goals.some((g) => g.status === 'active' && g.type === 'save_money')) {
      m.goals.push({ id: nextId(world, 'goal'), type: 'save_money', label: 'Восстановить финансовую подушку', priority: 0.8, progress: 0, createdAt: world.time, status: 'active', horizon: 'short' });
      emit(world, {
        type: 'goal_changed',
        participants: [m.id],
        summary: `${m.name} решил(а) сначала восстановить финансы`,
        cause: `Провал проекта «${p.name}» и тающие сбережения`,
        changes: ['Новая цель: восстановить подушку'],
        importance: 0.45,
      });
    }
    if (m.isAvatar) {
      // Неудача — повод переосмыслить. Ошибка генерации не ломает симуляцию.
      tryGenerateIdea(world, m, 'failure', { ignoreCooldown: true });
    }
  }
  if (p.ideaId && world.ideas[p.ideaId]) {
    world.ideas[p.ideaId].timeline.push({ time: world.time, text: `Проект «${p.name}» остановлен: ${p.status === 'failed' ? 'провал' : 'заброшен'}` });
  }
  for (const agId of Object.keys(world.agreements)) {
    const ag = world.agreements[agId];
    if (ag.projectId === p.id && ag.status === 'active') ag.status = 'fulfilled';
  }
}

function breakCollaboration(world: World, p: Project, m: Character, owner: Character): void {
  p.memberIds = p.memberIds.filter((id) => id !== m.id);
  m.projectIds = m.projectIds.filter((id) => id !== p.id);
  const ag = Object.values(world.agreements).find((a) => a.projectId === p.id && a.partyIds.includes(m.id) && a.status === 'active');
  if (ag) ag.status = 'broken';
  adjustRelation(world, owner, m, { affinity: -15 - owner.traits.impulsivity * 10, trust: -20 });
  adjustRelation(world, m, owner, { affinity: -4, trust: -3 });
  const r = getRelation(world, owner.id, m.id);
  if (r) r.business = false;
  const ev = emit(world, {
    type: 'agreement_broken',
    participants: [owner.id, m.id],
    summary: `${m.name} перестал(а) участвовать в «${p.name}» — договорённость нарушена (владелец: ${owner.name})`,
    cause: `${m.name.split(' ')[0]} не работал(а) над проектом больше 12 дней`,
    changes: ['Участник покинул проект', 'Доверие владельца упало'],
    importance: 0.6,
    relatedIds: [p.id, ...(ag ? [ag.id] : [])],
  });
  projectHistory(p, world.time, `${m.name} покинул(а) проект`, ev.id);
  remember(world, owner, 'conflict', `${m.name} не сдержал(а) обещание по «${p.name}»`, 0.7, [m.id, p.id]);
}

// --- Сотрудничество -------------------------------------------------------------

export function canPitch(world: World, a: Character, b: Character): boolean {
  const p = activeOwnedProject(world, a);
  if (!p || p.memberIds.includes(b.id) || p.memberIds.length >= 3) return false;
  if (b.isAvatar === false && b.job?.rank === 'owner') return false;
  const r = getRelation(world, a.id, b.id);
  if (!r || r.familiarity < 15 || r.affinity < 0) return false;
  if ((a.counters[`pitch_${b.id}`] ?? -9999) > world.time - 24 * 14) return false;
  const useful = b.skills[p.skill] >= 40 || b.skills.design >= 50 || b.skills.sales >= 50;
  return useful;
}

export function pitch(world: World, a: Character, b: Character): WorldEvent | null {
  const p = activeOwnedProject(world, a);
  if (!p) return null;
  a.counters[`pitch_${b.id}`] = world.time;
  const rBA = getRelation(world, b.id, a.id);
  const wantsProject = b.goals.some((g) => g.status === 'active' && (g.type === 'start_project' || g.type === 'find_partner' || g.type === 'explore_ideas'));
  const busy = b.job ? 0.15 : -0.1;
  const prob = clamp(
    0.1 + (rBA ? rBA.affinity / 200 + rBA.trust / 300 : 0) + b.traits.curiosity * 0.2 + b.traits.ambition * 0.2 - b.traits.leisure * 0.25 - busy + (wantsProject ? 0.25 : 0) - b.traits.caution * 0.15,
    0.03,
    0.85,
  );
  const accepted = chance(world, prob);
  const options = [
    { label: 'Присоединиться к проекту', score: prob },
    { label: 'Вежливо отказаться', score: 1 - prob },
  ];
  if (!accepted) {
    adjustRelation(world, a, b, { affinity: -1 });
    if (b.isAvatar) {
      recordDecision(world, b, {
        choice: `Отказаться от участия в «${p.name}»`,
        reason: `${a.name} предложил(а) присоединиться, но сейчас не хватает времени или уверенности в идее`,
        alternatives: options,
        expected: 'Сохранить фокус на своих целях',
      });
    }
    return emit(world, {
      type: 'conversation',
      participants: [a.id, b.id],
      locationId: a.locationId,
      summary: `${b.name} отклонил(а) предложение присоединиться к «${p.name}» (предлагал(а): ${a.name})`,
      cause: `${a.name.split(' ')[0]} искал(а) партнёра с навыками`,
      changes: ['Партнёрство не состоялось'],
      importance: 0.35,
      dialogue: [
        { speakerId: a.id, text: `Слушай, я делаю «${p.name}». Нужен человек с твоими навыками — присоединишься?` },
        { speakerId: b.id, text: 'Звучит интересно, но сейчас не потяну. Давай позже.' },
      ],
    });
  }
  p.memberIds.push(b.id);
  b.projectIds.push(p.id);
  const ag = {
    id: nextId(world, 'agr'),
    kind: 'collaboration' as const,
    partyIds: [a.id, b.id],
    terms: `${b.name} помогает с «${p.name}» несколько часов в неделю, выручка делится поровну`,
    createdAt: world.time,
    status: 'active' as const,
    projectId: p.id,
  };
  world.agreements[ag.id] = ag;
  b.counters[`lastWork_${p.id}`] = world.time;
  const task = { id: nextId(world, 'task'), label: `${skillName(b.skills.design >= 50 && p.skill !== 'design' ? 'design' : p.skill)}: помочь с проектом`, assigneeId: b.id, done: false };
  p.tasks.push(task);
  for (const [x, y] of [[a, b], [b, a]] as const) {
    adjustRelation(world, x, y, { affinity: 5, trust: 6, respect: 3 });
    const r = getRelation(world, x.id, y.id);
    if (r) r.business = true;
  }
  remember(world, a, 'agreement', `${b.name} присоединился(ась) к «${p.name}»`, 0.75, [b.id, p.id]);
  remember(world, b, 'agreement', `Договорённость: вместе делать «${p.name}» (партнёр — ${a.name})`, 0.75, [a.id, p.id]);
  if (b.isAvatar) {
    recordDecision(world, b, {
      choice: `Присоединиться к проекту «${p.name}»`,
      reason: `${a.name} позвал(а) в проект; это шанс получить практический опыт и партнёрство`,
      alternatives: options,
      expected: 'Опыт, связи и доля в возможной выручке',
      important: true,
      relatedIds: [p.id],
    });
  }
  const ev = emit(world, {
    type: 'collaboration',
    participants: [a.id, b.id],
    locationId: a.locationId,
    summary: `${a.name} и ${b.name} договорились вместе делать «${p.name}»`,
    cause: `${a.name.split(' ')[0]} искал(а) партнёра, ${b.name.split(' ')[0]} заинтересовался(ась)`,
    context: p.description,
    changes: [`${b.name.split(' ')[0]} — участник проекта`, `Создана договорённость: ${ag.terms}`, `Новая задача: ${task.label}`],
    importance: 0.7,
    relatedIds: [p.id, ag.id],
    dialogue: [
      { speakerId: a.id, text: `Делаю «${p.name}». Нужен человек с твоими навыками — присоединишься?` },
      { speakerId: b.id, text: 'Давай попробуем! Пару вечеров в неделю точно найду.' },
    ],
  });
  projectHistory(p, world.time, `${b.name} присоединился(ась)`, ev.id);
  return ev;
}

// --- Решения о старте проектов (вызываются из ежедневного планирования) ----------

/** Главный персонаж решает, запускать ли проект по одной из своих идей. */
export function considerProjectFromIdea(world: World, c: Character): Project | null {
  if (activeOwnedProject(world, c)) return null;
  if ((c.counters.lastProjectThought ?? -9999) > world.time - 24 * 4) return null;
  c.counters.lastProjectThought = world.time;
  const ideas = Object.values(world.ideas)
    .filter((i) => i.authorId === c.id && !i.timeline.some((t) => t.text.includes('начал(а) проект')))
    .sort((a, b) => b.avatarScore - a.avatarScore);
  const best: Idea | undefined = ideas[0];
  if (!best) return null;
  const runway = runwayMonths(c);
  const failures = c.memory.filter((m) => m.kind === 'failure' && m.text.includes('не взлетел')).length;
  // Пока есть работа, проект — «вечерний», и запас денег важен меньше.
  const moneyFactor = c.job ? (runway > 1 ? 0.2 : -0.3) : runway > 3 ? 0.4 : -0.6;
  const start = best.avatarScore / 10 + c.traits.ambition * 0.6 + c.traits.impulsivity * 0.3 + moneyFactor - failures * 0.3 - c.traits.caution * 0.4 + (best.avatarScore >= 8 ? 0.3 : 0);
  const wait = 0.7 + c.traits.caution * 0.5 + (runway < (c.job ? 1 : 3) ? 0.5 : 0);
  const explore = 0.5 + c.traits.curiosity * 0.4 + (ideas.length < 2 ? 0.4 : 0);
  const options = [
    { label: `Начать проект по идее «${best.title}»`, score: start },
    { label: 'Подождать и накопить денег', score: wait },
    { label: 'Продолжить искать идеи', score: explore },
  ].sort((a, b) => b.score - a.score);
  if (options[0].score !== start) {
    // Не всегда записываем «ничего не делать», только раз в неделю.
    if ((c.counters.lastWaitDecision ?? -9999) < world.time - 24 * 7) {
      c.counters.lastWaitDecision = world.time;
      recordDecision(world, c, {
        choice: options[0].label,
        reason: `Лучшая идея — «${best.title}» (${best.avatarScore}/10), но ${runway < 3 ? `сбережений хватит лишь на ${runway.toFixed(1)} мес.` : 'уверенности пока недостаточно'}`,
        alternatives: options,
        expected: 'Решение о проекте отложено',
      });
    }
    return null;
  }
  const tags = best.tags;
  const kind: Project['kind'] = tags.includes('llm_assistant') || tags.includes('rag') || tags.includes('agents') || tags.includes('speech') || tags.includes('vision') ? 'ai_tool' : tags.includes('marketplace') ? 'service' : 'app';
  const tech = tags[tags.length - 1];
  const skill: SkillKey = ['llm_assistant', 'rag', 'agents', 'speech', 'vision'].includes(tech) ? 'ai' : tech === 'dashboard' || tech === 'forecasting' ? 'analytics' : 'programming';
  return startProject(world, c, {
    name: projectName(world),
    description: best.title,
    kind,
    skill,
    ideaId: best.id,
    reason: `Идея «${best.title}» кажется самой сильной (${best.avatarScore}/10); запас денег ~${runway.toFixed(1)} мес.`,
    alternatives: options,
  });
}

/** Другие амбициозные персонажи запускают проекты из своих наблюдений. */
export function considerNpcProject(world: World, c: Character): Project | null {
  if (c.isAvatar || activeOwnedProject(world, c)) return null;
  const wants = c.goals.some((g) => g.status === 'active' && g.type === 'start_project');
  if (!wants && c.traits.ambition + c.traits.creativity < 1.4) return null;
  if ((c.counters.lastProjectThought ?? -9999) > world.time - 24 * 6) return null;
  c.counters.lastProjectThought = world.time;
  const runway = runwayMonths(c);
  const recentFailure = c.memory.some((m) => m.kind === 'failure' && m.text.includes('не взлетел') && world.time - m.time < 24 * 30);
  const start = (wants ? 0.8 : 0.3) + c.traits.ambition * 0.5 + c.traits.impulsivity * 0.5 + (runway > 2 ? 0.3 : -0.5) - (recentFailure ? 0.8 : 0) - c.traits.caution * 0.5;
  const wait = 0.9 + c.traits.caution * 0.4;
  if (start < wait || !chance(world, 0.5)) return null;
  const own = world.observations.filter((o) => o.observerId === c.id);
  const problem = own.length ? problemById.get(pick(world, own).problemId)! : pick(world, PROBLEMS);
  const skill: SkillKey = (['programming', 'design', 'sales', 'analytics', 'service', 'ai'] as SkillKey[]).sort((x, y) => c.skills[y] - c.skills[x])[0];
  const kind: Project['kind'] = skill === 'programming' || skill === 'ai' ? 'app' : skill === 'design' ? 'content' : skill === 'sales' ? 'consulting' : 'service';
  return startProject(world, c, {
    name: projectName(world),
    description: `Решение для ${problem.audienceShort}: ${problem.goalNoun}`,
    kind,
    skill,
    reason: `${c.name.split(' ')[0]} хочет своё дело и видит проблему: ${problem.short}`,
    alternatives: [
      { label: 'Начать свой проект', score: start },
      { label: 'Подождать', score: wait },
    ],
  });
}

function projectName(world: World): string {
  for (let i = 0; i < 10; i++) {
    const n = `${pick(world, NAME_A)} ${pick(world, NAME_B).toLowerCase()}`;
    if (!Object.values(world.projects).some((p) => p.name === n)) return n;
  }
  return `Проект №${Object.keys(world.projects).length + 1}`;
}

export function projectAgeDays(world: World, p: Project): number {
  return dayOf(world.time) - dayOf(p.createdAt);
}
