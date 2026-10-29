import type { Character, World } from './types';
import { ACTION_BY_ID, actionCtx } from './actions';
import { applyNeeds } from './needs';
import { chooseAction, needsInterrupt, planDay, shouldPlan } from './planner';
import { converse, getRelation, type ConversationHooks } from './social';
import { dailyEconomy } from './economy';
import { dailyPerformance, jobTip, processApplications, weeklyReview } from './career';
import { canPitch, dailyProjects, pitch } from './projects';
import { decayRelations } from './social';
import { dailyRandomEvents } from './randomEvents';
import { hasProblemToShare, shareProblem } from './ideas/observe';
import { hourOf, weekdayOf } from './time';
import { chance, shuffled, weightedPick } from './rng';

// Движок времени. Один вызов tick() = один игровой час.
// Порядок внутри шага фиксирован, поэтому при одинаковом seed результат одинаков.

export const conversationHooks: ConversationHooks = {
  pitch,
  canPitch,
  jobTip,
  shareProblem,
  hasProblemToShare,
};

/** Максимум шагов за один вызов runTicks — защита от «зависания» интерфейса. */
export const MAX_TICKS_PER_CALL = 24 * 14;

function present(c: Character): boolean {
  return c.activity.arriveAt === undefined && c.activity.state !== 'sleep';
}

/** Разговоры: персонажи, открытые к общению, заговаривают с теми, кто рядом. */
function socialHour(world: World): void {
  const byLoc = new Map<string, Character[]>();
  for (const id of world.order) {
    const c = world.characters[id];
    if (!present(c)) continue;
    const list = byLoc.get(c.locationId) ?? [];
    list.push(c);
    byLoc.set(c.locationId, list);
  }
  const talkedThisHour = new Set<string>();
  for (const [, people] of byLoc) {
    if (people.length < 2) continue;
    for (const a of shuffled(world, people)) {
      if (talkedThisHour.has(a.id)) continue;
      const def = ACTION_BY_ID.get(a.activity.actionId);
      const base = def?.talkChance ?? 0.05;
      if (!chance(world, base * (0.5 + a.traits.sociability))) continue;
      const others = people.filter((b) => b !== a && !talkedThisHour.has(b.id));
      const b = weightedPick(world, others, (x) => {
        const r = getRelation(world, a.id, x.id);
        if (r && world.time - r.lastInteraction < 6 && a.activity.actionId !== 'network') return 0;
        if (!r) return 0.05 + a.traits.sociability * 0.25; // незнакомец
        if (a.activity.actionId === 'network' && canPitch(world, a, x)) return 6;
        return 1 + Math.max(0, r.affinity) / 25 + (r.kind === 'rival' || r.kind === 'conflict' ? a.traits.impulsivity * 2 : 0);
      });
      if (!b) continue;
      const ev = converse(world, a, b, conversationHooks);
      a.counters.lastTalkAt = world.time;
      b.counters.lastTalkAt = world.time;
      talkedThisHour.add(a.id);
      talkedThisHour.add(b.id);
      if (ev) {
        a.counters.lastTalkWith = world.order.indexOf(b.id);
        b.counters.lastTalkWith = world.order.indexOf(a.id);
      }
    }
  }
}

function characterHour(world: World, c: Character): void {
  const act = c.activity;
  // Прибытие на место.
  if (act.arriveAt !== undefined && world.time >= act.arriveAt) {
    c.locationId = act.locationId;
    delete act.arriveAt;
  }
  const traveling = act.arriveAt !== undefined;
  applyNeeds(c, traveling ? 'walk' : act.state);
  if (!traveling) {
    const def = ACTION_BY_ID.get(act.actionId);
    def?.onHour?.(actionCtx(world, c));
  }
}

function finishAndChoose(world: World, c: Character): void {
  const act = c.activity;
  const interrupt = needsInterrupt(c);
  if (world.time < act.endsAt && !interrupt) return;
  if (world.time >= act.endsAt && act.arriveAt === undefined) {
    ACTION_BY_ID.get(act.actionId)?.onEnd?.(actionCtx(world, c));
  }
  if (act.arriveAt !== undefined) {
    // Прерванная дорога: персонаж остаётся там, где был путь (на улице).
    delete act.arriveAt;
  }
  if (shouldPlan(world, c)) planDay(world, c);
  c.activity = chooseAction(world, c);
}

/** Один игровой час. */
export function tick(world: World): void {
  world.time += 1;
  world.stats.ticks += 1;
  const hour = hourOf(world.time);

  if (hour === 0) {
    // Полночь: итоги прошедшего дня. Выполняется ровно один раз за игровые сутки,
    // потому что время только растёт и каждый час проходит один раз.
    dailyEconomy(world);
    dailyPerformance(world);
    dailyProjects(world);
    decayRelations(world);
    dailyRandomEvents(world);
  }
  if (hour === 17 && weekdayOf(world.time) === 4) weeklyReview(world);

  for (const id of world.order) characterHour(world, world.characters[id]);
  socialHour(world);
  processApplications(world);
  for (const id of world.order) finishAndChoose(world, world.characters[id]);
}

/** Несколько шагов подряд с ограничением сверху. */
export function runTicks(world: World, n: number, onTick?: (w: World) => void): number {
  const steps = Number.isFinite(n) ? Math.max(0, Math.min(Math.floor(n), MAX_TICKS_PER_CALL)) : 0;
  for (let i = 0; i < steps; i++) {
    tick(world);
    onTick?.(world);
  }
  return steps;
}

/** Первичная инициализация действий в только что созданном мире. */
export function bootstrap(world: World): void {
  for (const id of world.order) {
    const c = world.characters[id];
    if (c.activity.actionId === 'wake') {
      if (shouldPlan(world, c)) planDay(world, c);
      c.activity = chooseAction(world, c);
    }
  }
}
