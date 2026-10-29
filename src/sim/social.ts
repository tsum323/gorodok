import type { Character, Relation, RelationKind, World, WorldEvent } from './types';
import { clamp } from './util';
import { emit, remember } from './events';
import { chance, nextRandom, pick, weightedPick } from './rng';

// Отношения направленные: relations["a->b"] — как A относится к B.
// Отношение создаётся один раз (при знакомстве) и затем только изменяется.

export function relationKey(from: string, to: string): string {
  return `${from}->${to}`;
}

export function getRelation(world: World, from: string, to: string): Relation | undefined {
  return world.relations[relationKey(from, to)];
}

export function knows(world: World, a: string, b: string): boolean {
  return !!world.relations[relationKey(a, b)];
}

const KIND_LABELS: Record<RelationKind, string> = {
  stranger: 'незнакомец',
  acquaintance: 'знакомый',
  colleague: 'коллега',
  friend: 'друг',
  close_friend: 'близкий друг',
  partner: 'деловой партнёр',
  mentor: 'наставник',
  rival: 'соперник',
  conflict: 'в конфликте',
};

export function relationLabel(kind: RelationKind): string {
  return KIND_LABELS[kind];
}

/** Пересчёт вида отношения из числовых параметров. Наставничество и соперничество «липкие». */
export function recomputeKind(r: Relation, colleagues: boolean): void {
  if (r.affinity <= -40) r.kind = 'conflict';
  else if (r.kind === 'rival' && r.affinity < 30) r.kind = 'rival';
  else if (r.kind === 'mentor' && r.affinity > 0) r.kind = 'mentor';
  else if (r.affinity >= 65 && r.trust >= 60 && r.familiarity >= 60) r.kind = 'close_friend';
  else if (r.affinity >= 40 && r.familiarity >= 40) r.kind = 'friend';
  else if (r.business) r.kind = 'partner';
  else if (colleagues) r.kind = 'colleague';
  else if (r.familiarity > 0) r.kind = 'acquaintance';
  else r.kind = 'stranger';
}

/** Совместимость характеров: 1 — очень похожи, около 0 — плохо уживаются. */
export function compatibility(a: Character, b: Character): number {
  const keys = ['sociability', 'greed', 'leisure', 'caution', 'empathy', 'curiosity'] as const;
  let diff = 0;
  for (const k of keys) diff += Math.abs(a.traits[k] - b.traits[k]);
  return 1 - (diff / keys.length) * 2.2 + (a.traits.empathy + b.traits.empathy - 1) * 0.3;
}

export function areColleagues(a: Character, b: Character): boolean {
  return !!a.job && !!b.job && a.job.orgId === b.job.orgId;
}

/** Создаёт пару отношений при знакомстве. Повторный вызов ничего не дублирует. */
export function ensureMet(world: World, a: Character, b: Character): boolean {
  if (knows(world, a.id, b.id) && knows(world, b.id, a.id)) return false;
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as const) {
    const key = relationKey(x.id, y.id);
    if (world.relations[key]) continue;
    world.relations[key] = {
      from: x.id,
      to: y.id,
      familiarity: 10,
      affinity: Math.round((x.traits.sociability - 0.5) * 20 + (nextRandom(world) - 0.5) * 20),
      trust: 20,
      respect: 30 + Math.round(y.reputation / 5),
      kind: 'acquaintance',
      metAt: world.time,
      lastInteraction: world.time,
      interactions: 0,
      business: false,
    };
  }
  return true;
}

export interface RelationDelta {
  familiarity?: number;
  affinity?: number;
  trust?: number;
  respect?: number;
}

export function adjustRelation(world: World, from: Character, to: Character, d: RelationDelta): Relation {
  ensureMet(world, from, to);
  const r = world.relations[relationKey(from.id, to.id)];
  const before = r.kind;
  r.familiarity = clamp(r.familiarity + (d.familiarity ?? 0), 0, 100);
  r.affinity = clamp(r.affinity + (d.affinity ?? 0), -100, 100);
  r.trust = clamp(r.trust + (d.trust ?? 0), 0, 100);
  r.respect = clamp(r.respect + (d.respect ?? 0), 0, 100);
  r.lastInteraction = world.time;
  r.interactions++;
  recomputeKind(r, areColleagues(from, to));
  if (before !== r.kind && (r.kind === 'friend' || r.kind === 'close_friend') && before !== 'close_friend') {
    // Дружба фиксируется событием только когда она взаимна.
    const back = getRelation(world, to.id, from.id);
    const level = r.kind === 'close_friend' && back?.kind === 'close_friend' ? 'close_friend' : 'friend';
    const already = r.announced === level || back?.announced === level || (level === 'friend' && (r.announced === 'close_friend' || back?.announced === 'close_friend'));
    if (back && !already && (back.kind === 'friend' || back.kind === 'close_friend')) {
      r.announced = level;
      back.announced = level;
      emit(world, {
        type: 'friendship',
        participants: [from.id, to.id],
        summary: `${from.name} и ${to.name} ${level === 'close_friend' ? 'стали близкими друзьями' : 'подружились'}`,
        cause: 'Много хороших разговоров и взаимная симпатия',
        changes: [`Отношения: ${relationLabel(r.kind)}`],
        importance: 0.55,
      });
    }
  }
  return r;
}

export function relationsOf(world: World, id: string): Relation[] {
  const prefix = `${id}->`;
  const out: Relation[] = [];
  for (const k in world.relations) if (k.startsWith(prefix)) out.push(world.relations[k]);
  return out;
}

/** Медленное ослабевание знакомств без общения (раз в день). */
export function decayRelations(world: World): void {
  for (const k in world.relations) {
    const r = world.relations[k];
    if (world.time - r.lastInteraction > 24 * 10) {
      r.familiarity = clamp(r.familiarity - 0.3, 5, 100);
      if (r.affinity > 0) r.affinity = clamp(r.affinity - 0.15, 0, 100);
      if (r.affinity < 0) r.affinity = clamp(r.affinity + 0.3, -100, 0);
      const a = world.characters[r.from];
      const b = world.characters[r.to];
      if (a && b) recomputeKind(r, areColleagues(a, b));
    }
  }
}

// ---------------------------------------------------------------------------
// Разговоры. Тема выбирается из состояния участников; итог разговора меняет
// отношения, память и иногда — мир (договорённости, проекты, наводки на работу).

export type TopicId =
  | 'smalltalk'
  | 'work'
  | 'share_problem'
  | 'advice'
  | 'job_tip'
  | 'pitch'
  | 'argue'
  | 'ideas';

export interface ConversationHooks {
  /** Предложение о сотрудничестве (реализуется в projects.ts). Возвращает событие, если договорились. */
  pitch: (world: World, a: Character, b: Character) => WorldEvent | null;
  /** Может ли A позвать B в проект. */
  canPitch: (world: World, a: Character, b: Character) => boolean;
  /** Наводка на вакансию (career.ts). */
  jobTip: (world: World, a: Character, b: Character) => string | null;
  /** Передача наблюдения о проблеме (ideas). */
  shareProblem: (world: World, a: Character, b: Character) => string | null;
  hasProblemToShare: (world: World, a: Character) => boolean;
}

function topicWeights(world: World, a: Character, b: Character, hooks: ConversationHooks): [TopicId, number][] {
  const rAB = getRelation(world, a.id, b.id);
  const w: [TopicId, number][] = [['smalltalk', 3]];
  if (areColleagues(a, b)) w.push(['work', 3]);
  if (hooks.hasProblemToShare(world, a)) w.push(['share_problem', 2 + a.traits.sociability * 2]);
  const learning = b.goals.find((g) => g.status === 'active' && (g.type === 'learn_skill' || g.type === 'change_career') && g.target);
  if (learning && a.skills[learning.target as keyof Character['skills']] >= 55) w.push(['advice', 2 + a.traits.empathy * 3]);
  if (!b.job && !b.student && a.job && world.orgs[a.job.orgId]?.openings.length) w.push(['job_tip', 3 + a.traits.empathy * 2]);
  if (hooks.canPitch(world, a, b)) w.push(['pitch', 2.5 + a.traits.ambition * 2]);
  if (rAB && (rAB.kind === 'rival' || rAB.kind === 'conflict' || rAB.affinity < -15)) {
    w.push(['argue', 1 + a.traits.impulsivity * 3 + (a.stress / 100) * 2]);
  }
  const av = a.isAvatar ? a : b.isAvatar ? b : null;
  if (av && (a.traits.curiosity > 0.6 || b.traits.curiosity > 0.6) && world.time - (av.counters.lastIdeasTalk ?? -999) > 48) w.push(['ideas', 0.8]);
  return w;
}

const SMALLTALK: [string, string][] = [
  ['Как неделя?', 'Насыщенно. Ещё бы сил побольше.'],
  ['Видел, сколько теперь стоит кофе?', 'Да уж, скоро будем пить воду из кулера.'],
  ['Что нового?', 'Да всё по-старому, работа-дом. А у тебя?'],
  ['Выглядишь уставшим.', 'Есть немного. Надо бы выспаться.'],
  ['Пойдёшь в выходные куда-нибудь?', 'Думаю просто погулять и отдохнуть.'],
];

const WORKTALK: [string, string][] = [
  ['Опять созвон затянулся на час.', 'Половину можно было уложить в одно сообщение.'],
  ['Дедлайн сдвинули?', 'Нет, но обещали «подумать».'],
  ['Как тебе новая задача?', 'Интересная, но требований почти нет.'],
];

function line(id: string, text: string) {
  return { speakerId: id, text };
}

/** Проводит разговор между A (инициатор) и B. Возвращает созданное событие. */
export function converse(world: World, a: Character, b: Character, hooks: ConversationHooks): WorldEvent | null {
  const firstMeeting = ensureMet(world, a, b);
  if (firstMeeting) {
    adjustRelation(world, a, b, { familiarity: 8, affinity: 3 });
    adjustRelation(world, b, a, { familiarity: 8, affinity: Math.round((b.traits.sociability - 0.4) * 10) });
    remember(world, a, 'meeting', `Новое знакомство: ${b.name} (${b.profession})`, 0.4, [b.id]);
    remember(world, b, 'meeting', `Новое знакомство: ${a.name} (${a.profession})`, 0.4, [a.id]);
    return emit(world, {
      type: 'met',
      participants: [a.id, b.id],
      locationId: a.locationId,
      summary: `Знакомство: ${a.name} и ${b.name}`,
      cause: `Оба оказались в одном месте; ${a.name} первым(ой) начал(а) разговор`,
      context: `${a.name} — ${a.profession}, ${b.name} — ${b.profession}`,
      changes: ['Появилось новое знакомство (в обе стороны)'],
      importance: a.isAvatar || b.isAvatar ? 0.5 : 0.3,
      dialogue: [line(a.id, 'Привет! Кажется, мы ещё не знакомы.'), line(b.id, `Привет. Я ${b.name.split(' ')[0]}, ${b.profession.toLowerCase()}.`)],
    });
  }

  const topic = weightedPick(world, topicWeights(world, a, b, hooks), (t) => t[1])?.[0] ?? 'smalltalk';
  const rBA = getRelation(world, b.id, a.id)!;
  const warmth = (rBA.affinity + 100) / 200; // 0..1
  const aFirst = a.name.split(' ')[0];
  const bFirst = b.name.split(' ')[0];

  switch (topic) {
    case 'smalltalk':
    case 'work': {
      return smalltalk(world, a, b, topic === 'work');
    }
    case 'share_problem': {
      const problem = hooks.shareProblem(world, a, b);
      if (!problem) return smalltalk(world, a, b, false);
      // Мелкий разговор фиксируется только для главного персонажа (подробный режим).
      if (!a.isAvatar && !b.isAvatar) return null;
      adjustRelation(world, b, a, { familiarity: 3, affinity: 1 + b.traits.empathy * 2, trust: 1.5 });
      adjustRelation(world, a, b, { familiarity: 3, affinity: 1.5, trust: 2 });
      return emit(world, {
        type: 'conversation',
        participants: [a.id, b.id],
        locationId: a.locationId,
        summary: `${a.name} → ${b.name}: «${problem}»`,
        cause: `${aFirst} давно об этом думает и решил(а) поделиться`,
        changes: [`${bFirst} узнал(а) о проблеме «${problem}»`],
        importance: a.isAvatar || b.isAvatar ? 0.5 : 0.3,
        dialogue: [line(a.id, `Знаешь, что бесит? ${problem}.`), line(b.id, warmth > 0.5 ? 'Слушай, это правда больная тема.' : 'Ну, бывает.')],
      });
    }
    case 'advice': {
      const g = b.goals.find((x) => x.status === 'active' && (x.type === 'learn_skill' || x.type === 'change_career') && x.target)!;
      const skill = g.target as keyof Character['skills'];
      const gain = 1 + a.skills[skill] / 40;
      b.skills[skill] = clamp(b.skills[skill] + gain, 0, 100);
      adjustRelation(world, b, a, { affinity: 5, trust: 4, respect: 6 });
      adjustRelation(world, a, b, { affinity: 2 + a.traits.empathy * 3, familiarity: 3 });
      const rel = getRelation(world, b.id, a.id)!;
      if (rel.respect > 70 && rel.trust > 55 && rel.kind !== 'mentor' && chance(world, 0.3)) rel.kind = 'mentor';
      remember(world, b, 'conversation', `${a.name} помог(ла) советом по теме «${skillName(skill)}»`, 0.5, [a.id]);
      return emit(world, {
        type: 'help',
        participants: [a.id, b.id],
        locationId: a.locationId,
        summary: `${a.name} помогает советом: ${b.name} разбирается в теме «${skillName(skill)}»`,
        cause: `${bFirst} учится (${g.label.toLowerCase()}), а ${aFirst} в этом разбирается`,
        changes: [`${bFirst}: навык «${skillName(skill)}» +${gain.toFixed(1)}`, `${bFirst} стал(а) больше уважать ${aFirst}`],
        importance: 0.45,
        dialogue: [line(b.id, `Можешь подсказать, с чего начать в «${skillName(skill)}»?`), line(a.id, 'Начни с маленькой реальной задачи — так быстрее всего.')],
      });
    }
    case 'job_tip': {
      const tip = hooks.jobTip(world, a, b);
      if (!tip) return smalltalk(world, a, b, false);
      adjustRelation(world, b, a, { affinity: 6, trust: 5 });
      adjustRelation(world, a, b, { affinity: 2 });
      remember(world, b, 'conversation', `${a.name} рассказал(а) о вакансии: ${tip}`, 0.6, [a.id]);
      return emit(world, {
        type: 'conversation',
        participants: [a.id, b.id],
        locationId: a.locationId,
        summary: `${a.name} рекомендует вакансию (${tip}) — ${b.name} ищет работу`,
        cause: `${bFirst} ищет работу, а ${aFirst} знает об открытой позиции в своей компании`,
        changes: [`${bFirst} получил(а) рекомендацию — шанс при отклике выше`],
        importance: 0.5,
        dialogue: [line(a.id, `У нас как раз ищут: ${tip}. Могу замолвить слово.`), line(b.id, 'Серьёзно? Спасибо, откликнусь сегодня же!')],
      });
    }
    case 'pitch':
      return hooks.pitch(world, a, b);
    case 'argue': {
      const severity = 4 + a.traits.impulsivity * 8 + b.traits.impulsivity * 4;
      adjustRelation(world, a, b, { affinity: -severity * 0.6, trust: -3 });
      adjustRelation(world, b, a, { affinity: -severity * (1.1 - b.traits.empathy * 0.5), trust: -5 });
      a.stress = clamp(a.stress + 5, 0, 100);
      b.stress = clamp(b.stress + 7, 0, 100);
      a.mood = clamp(a.mood - 6, 0, 100);
      b.mood = clamp(b.mood - 8, 0, 100);
      const reason = conflictReason(world, a, b);
      remember(world, a, 'conflict', `Ссора (${b.name}): ${reason}`, 0.6, [b.id]);
      remember(world, b, 'conflict', `${a.name} устроил(а) спор: ${reason}`, 0.6, [a.id]);
      return emit(world, {
        type: 'conflict',
        participants: [a.id, b.id],
        locationId: a.locationId,
        summary: `${a.name} и ${b.name} поссорились — ${reason}`,
        cause: reason,
        changes: [`Симпатия упала с обеих сторон`, `Стресс вырос у обоих`],
        importance: 0.55,
        dialogue: [line(a.id, 'Ты опять всё делаешь по-своему!'), line(b.id, 'А ты, как всегда, лучше всех знаешь, да?')],
      });
    }
    case 'ideas': {
      adjustRelation(world, a, b, { familiarity: 4, affinity: 3, respect: 2 });
      adjustRelation(world, b, a, { familiarity: 4, affinity: 2 + b.traits.curiosity * 3, respect: 2 });
      const av = a.isAvatar ? a : b;
      const other = av === a ? b : a;
      av.counters.inspiration = (av.counters.inspiration ?? 0) + 1;
      av.counters.lastIdeasTalk = world.time;
      remember(world, av, 'conversation', `Обсуждение технологий и идей (${other.name})`, 0.4, [other.id]);
      return emit(world, {
        type: 'conversation',
        participants: [a.id, b.id],
        locationId: a.locationId,
        summary: `${a.name} и ${b.name} обсуждали новые технологии и возможности`,
        cause: 'Обоим интересно, что можно сделать с ИИ',
        changes: [`${av.name.split(' ')[0]} получил(а) заряд вдохновения`],
        importance: 0.3,
        noHistory: !a.isAvatar && !b.isAvatar,
        dialogue: [line(a.id, 'Как думаешь, что из ИИ реально приносит пользу, а что хайп?'), line(b.id, 'Польза там, где он экономит кому-то час в день.')],
      });
    }
  }
}

/** Обычная болтовня: отношения меняются в зависимости от совместимости. */
function smalltalk(world: World, a: Character, b: Character, work: boolean): WorldEvent | null {
  const [q, ans] = pick(world, work ? WORKTALK : SMALLTALK);
  const comp = compatibility(a, b);
  const jitter = () => (nextRandom(world) - 0.5) * 2;
  adjustRelation(world, a, b, { familiarity: 2, affinity: (comp - 0.3) * 3 + jitter(), trust: comp > 0.4 ? 0.5 : 0 });
  adjustRelation(world, b, a, { familiarity: 2, affinity: (comp - 0.3) * 3 + jitter() - (b.traits.sociability < 0.3 ? 1 : 0), trust: comp > 0.4 ? 0.5 : 0 });
  // Мелкий разговор фиксируется только для главного персонажа (подробный режим).
  if (!a.isAvatar && !b.isAvatar) return null;
  return emit(world, {
    type: 'conversation',
    participants: [a.id, b.id],
    locationId: a.locationId,
    summary: `${a.name.split(' ')[0]} и ${b.name.split(' ')[0]} поболтали${work ? ' о работе' : ''}`,
    cause: 'Оказались рядом',
    changes: [comp > 0.3 ? 'Немного выросла симпатия' : 'Разговор не очень клеился'],
    importance: 0.15,
    noHistory: true,
    dialogue: [line(a.id, q), line(b.id, ans)],
  });
}

function conflictReason(world: World, a: Character, b: Character): string {
  const sameOpening = a.jobApplications.some((x) => b.jobApplications.some((y) => y.openingId === x.openingId));
  if (sameOpening) return 'оба претендуют на одну вакансию';
  const broken = Object.values(world.agreements).find(
    (ag) => ag.status === 'broken' && ag.partyIds.includes(a.id) && ag.partyIds.includes(b.id),
  );
  if (broken) return 'старая обида из-за нарушенной договорённости';
  if (areColleagues(a, b) && a.job && b.job && a.job.rank === b.job.rank) return 'спор о том, кто больше делает для команды';
  if (a.traits.greed > 0.7 && b.traits.leisure > 0.7) return 'разные взгляды на работу и деньги';
  return 'накопившееся раздражение';
}

export function skillName(s: string): string {
  return (
    {
      programming: 'Программирование',
      ai: 'ИИ',
      analytics: 'Аналитика',
      management: 'Управление',
      sales: 'Продажи',
      design: 'Дизайн',
      communication: 'Коммуникация',
      finance: 'Финансы',
      service: 'Сервис',
    } as Record<string, string>
  )[s] ?? s;
}
