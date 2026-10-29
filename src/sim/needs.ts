import type { ActivityState, Character, World } from './types';
import { clamp } from './util';
import { relationsOf } from './social';
import { runwayMonths } from './economy';

// Базовые потребности и эмоциональное состояние.

type NeedDelta = { energy: number; satiety: number; social: number; fun: number; stress: number };

const EFFECTS: Record<ActivityState, NeedDelta> = {
  sleep: { energy: 11, satiety: -1.5, social: -0.5, fun: 0, stress: -0.4 },
  eat: { energy: 1, satiety: 45, social: 0, fun: 2, stress: -0.2 },
  work: { energy: -5, satiety: -4, social: -1, fun: -2, stress: 0.8 },
  study: { energy: -4.5, satiety: -4, social: -1, fun: -1, stress: 0.3 },
  rest: { energy: -1, satiety: -3.5, social: -1.5, fun: 9, stress: -1.2 },
  talk: { energy: -2.5, satiety: -3.5, social: 12, fun: 3, stress: -0.6 },
  think: { energy: -2.5, satiety: -3.5, social: -2, fun: 2, stress: -0.3 },
  walk: { energy: -3, satiety: -4, social: -1, fun: 1, stress: -0.2 },
};

export function applyNeeds(c: Character, state: ActivityState): void {
  const e = EFFECTS[state];
  const n = c.needs;
  n.energy = clamp(n.energy + e.energy, 0, 100);
  n.satiety = clamp(n.satiety + e.satiety, 0, 100);
  n.social = clamp(n.social + e.social * (state === 'talk' ? 0.6 + c.traits.sociability * 0.8 : 1), 0, 100);
  n.fun = clamp(n.fun + e.fun * (state === 'rest' ? 0.6 + c.traits.leisure * 0.8 : 1), 0, 100);
  let stress = e.stress;
  if (state === 'work') stress *= 1.6 - c.traits.discipline;
  if (n.energy < 15 || n.satiety < 15) stress += 1;
  // Стресс тянется к базовому уровню, который задают обстоятельства жизни.
  const base = c.counters.stressBase ?? 25;
  stress += (base - c.stress) * 0.06;
  c.stress = clamp(c.stress + stress, 0, 100);
  // Настроение плавно движется к целевому значению.
  const needAvg = (n.energy + n.satiety + n.social + n.fun) / 4;
  const target = needAvg * 0.55 + (100 - c.stress) * 0.3 + c.satisfaction * 0.15;
  c.mood = clamp(c.mood + (target - c.mood) * 0.15, 0, 100);
}

/** Ежедневная переоценка удовлетворённости жизнью. */
export function updateSatisfaction(world: World, c: Character): void {
  const friends = relationsOf(world, c.id).filter((r) => r.kind === 'friend' || r.kind === 'close_friend').length;
  const runway = runwayMonths(c);
  const goals = c.goals.filter((g) => g.status === 'active');
  const goalProgress = goals.length ? goals.reduce((s, g) => s + g.progress, 0) / goals.length : 50;
  const done = c.goals.filter((g) => g.status === 'done').length;

  let jobFit = 50;
  if (c.job) {
    jobFit = 45 + c.job.performance * 0.25;
    const career = goals.find((g) => g.type === 'change_career');
    if (career && career.target !== c.job.skill) jobFit -= 20;
    if (c.job.rank === 'owner' || c.job.rank === 'entrepreneur') jobFit += 10;
    if (c.traits.leisure > 0.7 && c.job.endHour - c.job.startHour > 8) jobFit -= 10;
  } else if (!c.student) {
    jobFit = c.freelancer ? 55 + c.traits.leisure * 15 : 25 + c.traits.leisure * 15;
  }

  // Базовый стресс от обстоятельств.
  let stressBase = 12 + (1 - c.traits.caution) * -4 + c.traits.caution * 6;
  if (c.debt > 0) stressBase += 15 + Math.min(20, c.debt / 10000);
  if (runway < 1) stressBase += 15;
  if (c.job) {
    stressBase += c.job.warnings * 12 + (c.job.rank === 'manager' || c.job.rank === 'owner' ? 10 : 0);
    if (c.traits.leisure > 0.6 && c.job.endHour - c.job.startHour >= 9) stressBase += 8;
  } else if (!c.student) stressBase += 18;
  if (c.projectIds.some((id) => world.projects[id]?.status === 'active') && c.job) stressBase += 8;
  stressBase += c.goals.filter((g) => g.status === 'active' && g.priority >= 0.8).length * 4;
  c.counters.stressBase = clamp(stressBase, 0, 90);

  const moneyScore = clamp(runway * 12, 0, 100) * (0.5 + c.traits.greed * 0.5) - (c.debt > 0 ? 15 : 0);
  const social = clamp(friends * 18, 0, 100);
  const target =
    jobFit * 0.25 +
    moneyScore * 0.25 +
    social * (0.1 + c.traits.sociability * 0.15) +
    goalProgress * 0.15 +
    Math.min(done * 5, 15) +
    (100 - c.stress) * 0.15;
  c.satisfaction = clamp(c.satisfaction + (target - c.satisfaction) * 0.2, 0, 100);
}
