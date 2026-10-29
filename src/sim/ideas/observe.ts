import type { Character, Observation, World } from '../types';
import { nextId } from '../util';
import { chance, pick } from '../rng';
import { PROBLEMS, problemById } from './catalog';

// Наблюдения — замеченные персонажами проблемы мира. Это сырьё для идей
// главного персонажа и тема для разговоров («знаешь, что бесит?..»).

export const OBSERVATIONS_CAP = 400;

/** Контекстные ключи, в которых сейчас находится персонаж. */
export function contextKeys(world: World, c: Character): string[] {
  const keys: string[] = [];
  if (c.job) {
    const o = world.orgs[c.job.orgId];
    if (o) keys.push(`org:${o.kind}`);
    keys.push(`role:${c.job.skill}`);
  }
  keys.push(`loc:${c.locationId}`);
  if (c.student) keys.push('student');
  if (c.freelancer) keys.push('freelancer');
  if (!c.job && !c.student) keys.push('state:unemployed');
  if (c.debt > 0) keys.push('state:debt');
  if (c.money < c.housing.rent + c.livingCost) keys.push('state:low_money');
  if (c.stress > 65) keys.push('state:burnout');
  for (const g of c.goals) if (g.status === 'active') keys.push(`goal:${g.type}`);
  return keys;
}

/**
 * Запоминает наблюдение. Повторное наблюдение той же проблемы от того же
 * источника в течение 3 дней не создаёт новую запись.
 */
export function observe(
  world: World,
  observer: Character,
  problemId: string,
  text: string,
  sourceId?: string,
  eventId?: string,
): Observation | null {
  if (!problemById.has(problemId)) return null;
  const dup = world.observations.find(
    (o) => o.observerId === observer.id && o.problemId === problemId && o.sourceId === sourceId && world.time - o.time < 72,
  );
  if (dup) return null;
  const obs: Observation = {
    id: nextId(world, 'obs'),
    problemId,
    observerId: observer.id,
    sourceId,
    time: world.time,
    text,
    eventId,
    used: false,
  };
  world.observations.push(obs);
  if (world.observations.length > OBSERVATIONS_CAP) {
    // В первую очередь забываются использованные и старые наблюдения.
    const idx = world.observations.findIndex((o) => o.used);
    world.observations.splice(idx >= 0 ? idx : 0, 1);
  }
  return obs;
}

/** С некоторой вероятностью персонаж замечает проблему из своего окружения. */
export function maybeNoticeProblem(world: World, c: Character, p: number, extraKeys: string[] = []): Observation | null {
  if (!chance(world, p)) return null;
  const keys = new Set([...contextKeys(world, c), ...extraKeys]);
  const candidates = PROBLEMS.filter((pr) => pr.contexts.some((k) => keys.has(k)));
  if (candidates.length === 0) return null;
  const pr = pick(world, candidates);
  return observe(world, c, pr.id, `${c.name.split(' ')[0]} заметил(а): ${pr.short}`);
}

export function noticeSpecific(world: World, c: Character, problemId: string, why: string, eventId?: string): Observation | null {
  const pr = problemById.get(problemId);
  if (!pr) return null;
  return observe(world, c, problemId, `${why}: ${pr.short}`, undefined, eventId);
}

/** Есть ли у персонажа собственная проблема, которой он может поделиться. */
export function hasProblemToShare(world: World, c: Character): boolean {
  return world.observations.some((o) => o.observerId === c.id && !o.sourceId && world.time - o.time < 24 * 14);
}

/** A рассказывает B о проблеме; B получает наблюдение со ссылкой на источник. */
export function shareProblem(world: World, a: Character, b: Character): string | null {
  const known = new Set(world.observations.filter((o) => o.observerId === b.id).map((o) => o.problemId));
  const own = world.observations.filter((o) => o.observerId === a.id && !o.sourceId && world.time - o.time < 24 * 14 && !known.has(o.problemId));
  if (own.length === 0) return null;
  const o = pick(world, own);
  const pr = problemById.get(o.problemId)!;
  observe(world, b, pr.id, `${a.name} рассказал(а): ${pr.short}`, a.id);
  return pr.short;
}
