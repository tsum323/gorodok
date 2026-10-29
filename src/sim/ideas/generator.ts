import type { Character, Idea, Observation, World } from '../types';
import { clamp, nextId } from '../util';
import { nextRandom, weightedPick } from '../rng';
import { addHistory, emit, remember } from '../events';
import { formatGameTime, dayOf } from '../time';
import { getRelation, relationsOf, skillName } from '../social';
import { problemById, techById, type ProblemDef, type TechDef } from './catalog';

// Генератор идей главного персонажа.
// Базовая реализация — на правилах и шаблонах, но идея всегда собирается из
// контекста: реального наблюдения в мире, навыков и целей персонажа, известных
// технологий, знакомых людей и прошлых неудач. Интерфейс IdeaGenerator позволяет
// позже подключить языковую модель (см. src/ai/README в README проекта).

export type IdeaTrigger = 'reflection' | 'conversation' | 'failure' | 'news' | 'exploration';

export interface IdeaContext {
  world: World;
  author: Character;
  trigger: IdeaTrigger;
}

export type IdeaDraft = Pick<
  Idea,
  | 'title'
  | 'description'
  | 'reason'
  | 'context'
  | 'relatedEventIds'
  | 'relatedCharacterIds'
  | 'audience'
  | 'problem'
  | 'solution'
  | 'implementation'
  | 'nextStep'
  | 'risks'
  | 'avatarScore'
  | 'avatarComment'
  | 'signature'
  | 'tags'
> & { observationIds: string[] };

export interface IdeaGenerator {
  readonly name: 'rules' | 'llm';
  generate(ctx: IdeaContext): IdeaDraft | null;
}

/** Минимальный интервал между идеями (игровые часы) и лимит в неделю. */
export const IDEA_COOLDOWN_HOURS = 40;
export const IDEAS_PER_WEEK = 2;
export const MAX_IDEAS_PER_PROBLEM = 2;

function existingSignatures(world: World): Set<string> {
  return new Set(Object.values(world.ideas).map((i) => i.signature));
}

function ideasForProblem(world: World, problemId: string): number {
  let n = 0;
  for (const i of Object.values(world.ideas)) if (i.signature.startsWith(problemId + ':')) n++;
  return n;
}

function evidence(world: World, authorId: string, problemId: string): Observation[] {
  return world.observations.filter((o) => o.observerId === authorId && o.problemId === problemId);
}

/** Общие теги («текст», «данные») почти ничего не говорят о пригодности технологии. */
const GENERIC_TAGS = new Set(['text', 'data', 'small_business']);

function techFit(p: ProblemDef, t: TechDef): number {
  let s = 0;
  for (const tag of t.tags) if (p.tags.includes(tag)) s += GENERIC_TAGS.has(tag) ? 0.4 : 1;
  return s;
}

function skillFit(c: Character, t: TechDef): number {
  return clamp((c.skills[t.skill] - t.difficulty + 40) / 80, 0, 1);
}

export class RuleBasedIdeaGenerator implements IdeaGenerator {
  readonly name = 'rules' as const;

  generate({ world, author, trigger: initialTrigger }: IdeaContext): IdeaDraft | null {
    let trigger = initialTrigger;
    const sigs = existingSignatures(world);
    const unused = world.observations.filter((o) => o.observerId === author.id && !o.used);
    if (unused.length === 0) return null;

    // 1. Выбор проблемы: свежесть, «больность», количество подтверждений и связь с целями.
    const goalsText = author.goals.filter((g) => g.status === 'active').map((g) => g.type);
    const obs = weightedPick(world, unused, (o) => {
      const p = problemById.get(o.problemId);
      if (!p || ideasForProblem(world, p.id) >= MAX_IDEAS_PER_PROBLEM) return 0;
      const ev = evidence(world, author.id, p.id).length;
      const age = (world.time - o.time) / 24;
      let w = p.severity * (1 + Math.min(ev, 4) * 0.5) * (1 / (1 + age / 7));
      if (o.sourceId) w *= 1.3; // услышал от живого человека
      if (goalsText.includes('free_time') && p.tags.includes('productivity')) w *= 1.3;
      if (trigger === 'failure' && p.id === 'mvp_no_demand') w *= 3;
      return w;
    });
    if (!obs) return null;
    const problem = problemById.get(obs.problemId)!;

    // 2. Выбор технологии: соответствие задаче, навыки автора, не повторять сочетания.
    const techs = world.technologies.map((id) => techById.get(id)).filter((t): t is TechDef => !!t);
    const tech = weightedPick(world, techs, (t) => {
      if (sigs.has(`${problem.id}:${t.id}`)) return 0;
      const fit = techFit(problem, t);
      if (fit < 1) return 0;
      const recent = trigger === 'news' && world.technologies[world.technologies.length - 1] === t.id ? 3 : 1;
      return fit * fit * (0.5 + skillFit(author, t)) * (0.6 + author.traits.curiosity) * recent;
    });
    if (!tech) {
      obs.used = true; // все разумные сочетания уже придуманы
      return null;
    }

    const ev = evidence(world, author.id, problem.id);
    const sources = [...new Set(ev.map((o) => o.sourceId).filter((x): x is string => !!x))];
    const sourceNames = sources.map((id) => world.characters[id]?.name).filter(Boolean) as string[];

    // 3. Оценка персонажа — субъективная, объясняется в комментарии.
    const sf = skillFit(author, tech);
    const goalFit = goalsText.some((g) => g === 'explore_ideas' || g === 'start_project') ? 1 : 0.5;
    const payFit = problem.payHint === 'high' ? 1 : problem.payHint === 'mid' ? 0.6 : 0.3;
    const raw =
      0.3 +
      problem.severity * 3 +
      Math.min(ev.length, 4) * 0.5 +
      sf * 2 +
      techFit(problem, tech) * 0.4 +
      goalFit * 0.8 +
      payFit * 1.2 +
      (nextRandom(world) - 0.5) * 1.5 -
      (author.traits.caution - 0.5) * 1.5;
    const score = Math.round(clamp(raw, 1, 10));

    // 4. Потенциальный партнёр среди знакомых.
    const partner = relationsOf(world, author.id)
      .filter((r) => r.affinity > 15)
      .map((r) => world.characters[r.to])
      .filter((p): p is Character => !!p && !p.isAvatar && p.skills[tech.skill] >= 50)
      .sort((x, y) => y.skills[tech.skill] - x.skills[tech.skill])[0];

    const title = `${tech.product} для ${problem.audienceShort}: ${problem.goalNoun}`;
    const solution = `${tech.how} ${problem.action}.`;

    const progSkill = author.skills.programming;
    let implementation: string;
    if (progSkill >= 55 && sf > 0.5) {
      implementation = `Собрать MVP самостоятельно: ${tech.stack}. Ограничиться одним сценарием — «${problem.goalNoun}».`;
    } else if (progSkill >= 30) {
      implementation = `Сделать прототип на подручных средствах (${tech.lightStack}); сложные части писать с помощью ИИ-ассистента для кода.`;
    } else {
      implementation = `Начать с ручной версии: выполнять работу вручную для 2–3 первых пользователей, а затем автоматизировать (${tech.lightStack}).`;
    }
    if (partner) {
      implementation += ` Возможный партнёр: ${partner.name} (сильный навык «${skillName(tech.skill)}»).`;
    }

    let nextStep: string;
    if (sourceNames.length > 0) {
      nextStep = `Ещё раз обсудить проблему (собеседник: ${sourceNames[0]}) и подробно расспросить: как часто возникает проблема, как её решают сейчас и сколько времени это отнимает.`;
    } else if (problem.payHint === 'low') {
      nextStep = `Поговорить с 5 представителями аудитории («${problem.audience}») и выяснить, готовы ли они платить или это скорее бесплатный инструмент.`;
    } else {
      nextStep = `Найти 5 человек из аудитории «${problem.audience}», задать три вопроса о проблеме и показать набросок решения на бумаге.`;
    }

    const risks = [
      'Спрос не проверен: идея основана на наблюдениях внутри симуляции, а не на исследовании рынка.',
      'Существующие решения и конкуренты не изучались.',
      ...tech.risks,
    ];
    if (sf < 0.4) risks.push(`Не хватает навыка «${skillName(tech.skill)}» для уверенной реализации.`);
    if (problem.payHint === 'low') risks.push('Аудитория может быть не готова платить.');

    // «Новость» засчитывается, только если идея действительно на новой технологии.
    if (trigger === 'news' && world.technologies[world.technologies.length - 1] !== tech.id) trigger = 'reflection';

    const failure = author.memory
      .filter((m) => m.kind === 'failure')
      .sort((a, b) => b.time - a.time)[0];

    const triggerText: Record<IdeaTrigger, string> = {
      reflection: 'Размышлял(а) в спокойной обстановке и связал(а) наблюдения в одну мысль',
      conversation: 'Идея оформилась после разговора',
      failure: 'Переосмыслил(а) недавнюю неудачу',
      news: `Узнал(а) о новой технологии — ${tech.name}`,
      exploration: 'Изучал(а) новые инструменты и возможности',
    };

    const reasonParts = [`${triggerText[trigger]}.`, `Наблюдение: «${obs.text}».`];
    if (ev.length > 1) reasonParts.push(`Проблема встречалась уже ${ev.length} раз(а).`);
    if (trigger === 'failure' && failure) reasonParts.push(`Повод: ${failure.text.toLowerCase()}.`);

    const job = author.job ? `${author.job.title} в «${world.orgs[author.job.orgId]?.name ?? '—'}»` : 'без постоянной работы';
    const goals = author.goals.filter((g) => g.status === 'active').map((g) => g.label.toLowerCase()).join('; ');
    const context = [
      `Положение автора: ${job}; навык «${skillName(tech.skill)}» — ${Math.round(author.skills[tech.skill])}/100.`,
      `Цели: ${goals || 'не сформулированы'}.`,
      sourceNames.length ? `Связанные люди: ${sourceNames.join(', ')}.` : '',
      `Технология: ${tech.name}.`,
    ]
      .filter(Boolean)
      .join(' ');

    const commentByScore =
      score >= 8
        ? 'Очень хочется попробовать — проблема видна вживую, и я примерно понимаю, как это сделать.'
        : score >= 6
          ? 'Выглядит перспективно, но сначала надо поговорить с людьми.'
          : score >= 4
            ? 'Любопытно, но не уверен(а), что это кому-то нужно настолько, чтобы платить.'
            : 'Скорее мысль на полях — запишу, чтобы не потерять.';

    const description =
      `Проблема: ${problem.statement} ` +
      `Решение: ${solution} ` +
      `Для кого: ${problem.audience}. ` +
      `Как можно начать: ${implementation}`;

    const relatedEventIds = ev.map((o) => o.eventId).filter((x): x is string => !!x);

    return {
      title,
      description,
      reason: reasonParts.join(' '),
      context,
      relatedEventIds,
      relatedCharacterIds: [...sources, ...(partner ? [partner.id] : [])],
      audience: problem.audience,
      problem: problem.statement,
      solution,
      implementation,
      nextStep,
      risks,
      avatarScore: score,
      avatarComment: commentByScore,
      signature: `${problem.id}:${tech.id}`,
      tags: [...new Set([...problem.tags.slice(0, 3), tech.id])],
      observationIds: ev.map((o) => o.id),
    };
  }
}

export const defaultIdeaGenerator: IdeaGenerator = new RuleBasedIdeaGenerator();

export interface GenerateOptions {
  generator?: IdeaGenerator;
  /** Источник фактического времени (для тестов). */
  now?: () => string;
  ignoreCooldown?: boolean;
}

export function canGenerateIdea(world: World, author: Character): boolean {
  const last = author.counters.lastIdeaAt ?? -9999;
  if (world.time - last < IDEA_COOLDOWN_HOURS) return false;
  const week = Math.floor(dayOf(world.time) / 7);
  if ((author.counters.ideaWeek ?? -1) === week && (author.counters.ideasThisWeek ?? 0) >= IDEAS_PER_WEEK) return false;
  return true;
}

/**
 * Попытка сформировать идею. Любая ошибка генератора изолируется:
 * симуляция продолжается, ошибка учитывается в счётчике.
 */
export function tryGenerateIdea(world: World, author: Character, trigger: IdeaTrigger, opts: GenerateOptions = {}): Idea | null {
  if (!opts.ignoreCooldown && !canGenerateIdea(world, author)) return null;
  let draft: IdeaDraft | null = null;
  const generator = opts.generator ?? defaultIdeaGenerator;
  try {
    draft = generator.generate({ world, author, trigger });
  } catch (err) {
    world.counters.ideaErrors = (world.counters.ideaErrors ?? 0) + 1;
    if (typeof console !== 'undefined') console.warn('Ошибка генерации идеи (симуляция продолжается):', err);
    return null;
  }
  if (!draft) return null;
  // Защита от дубликатов: по сигнатуре и по названию.
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  for (const i of Object.values(world.ideas)) {
    if (i.signature === draft.signature || norm(i.title) === norm(draft.title)) return null;
  }

  const now = (opts.now ?? (() => new Date().toISOString()))();
  const idea: Idea = {
    id: `${world.worldId}_${nextId(world, 'idea')}`,
    worldId: world.worldId,
    authorId: author.id,
    authorName: author.name,
    title: draft.title,
    description: draft.description,
    gameTime: world.time,
    gameDate: formatGameTime(world.startDate, world.time),
    createdAt: now,
    reason: draft.reason,
    context: draft.context,
    relatedEventIds: draft.relatedEventIds,
    relatedCharacterIds: draft.relatedCharacterIds,
    audience: draft.audience,
    problem: draft.problem,
    solution: draft.solution,
    implementation: draft.implementation,
    nextStep: draft.nextStep,
    risks: draft.risks,
    avatarScore: draft.avatarScore,
    avatarComment: draft.avatarComment,
    validation: 'not_validated',
    status: 'new',
    userRating: 0,
    userNotes: '',
    favorite: false,
    signature: draft.signature,
    generator: generator.name,
    tags: draft.tags,
    timeline: [{ time: world.time, text: 'Идея записана в архив' }],
    updatedAt: now,
  };
  world.ideas[idea.id] = idea;
  world.stats.ideasTotal++;
  for (const oid of draft.observationIds) {
    const o = world.observations.find((x) => x.id === oid);
    if (o) o.used = true;
  }

  const week = Math.floor(dayOf(world.time) / 7);
  if (author.counters.ideaWeek !== week) {
    author.counters.ideaWeek = week;
    author.counters.ideasThisWeek = 0;
  }
  author.counters.ideasThisWeek = (author.counters.ideasThisWeek ?? 0) + 1;
  author.counters.lastIdeaAt = world.time;
  author.counters.inspiration = 0;

  const ev = emit(world, {
    type: 'idea',
    participants: [author.id, ...draft.relatedCharacterIds.slice(0, 2)],
    locationId: author.locationId,
    summary: `${author.name} придумал(а) идею: «${idea.title}»`,
    cause: draft.reason,
    context: draft.context,
    changes: [`В архив добавлена идея (оценка автора ${idea.avatarScore}/10)`],
    importance: 0.75,
    relatedIds: [idea.id, ...draft.relatedEventIds.slice(0, 3)],
    noHistory: true,
  });
  addHistory(author, { time: world.time, text: `Новая идея: «${idea.title}»`, eventId: ev.id, kind: 'milestone' });
  remember(world, author, 'decision', `Придумал(а) идею «${idea.title}» (${idea.avatarScore}/10)`, 0.5 + idea.avatarScore / 20, [idea.id]);
  // Обсуждение с источником делает отношения теплее.
  for (const sid of draft.relatedCharacterIds) {
    const r = getRelation(world, author.id, sid);
    if (r) r.respect = clamp(r.respect + 2, 0, 100);
  }
  return idea;
}
