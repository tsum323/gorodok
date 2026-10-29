import type { Character, Decision, DecisionAlternative, World } from './types';
import { addHistory, emit, remember } from './events';
import { nextId, pushCapped } from './util';

// Журнал решений. Важные решения получают краткое объяснение: что выбрал,
// почему, какие альтернативы рассматривал и чего ожидал.

export const DECISIONS_CAP = 120;
export const AVATAR_DECISIONS_CAP = 400;

export interface DecisionInput {
  choice: string;
  reason: string;
  alternatives: DecisionAlternative[];
  expected: string;
  /** Важное решение попадает в ленту событий и историю. */
  important?: boolean;
  relatedIds?: string[];
}

export function recordDecision(world: World, c: Character, d: DecisionInput): Decision {
  const decision: Decision = {
    id: nextId(world, 'dec'),
    time: world.time,
    choice: d.choice,
    reason: d.reason,
    alternatives: d.alternatives.slice(0, 4).map((a) => ({ label: a.label, score: Math.round(a.score * 100) / 100 })),
    expected: d.expected,
  };
  if (d.important) {
    const ev = emit(world, {
      type: 'decision',
      participants: [c.id],
      locationId: c.locationId,
      summary: `${c.name} решил(а): ${d.choice.charAt(0).toLowerCase()}${d.choice.slice(1)}`,
      cause: d.reason,
      context: `Альтернативы: ${decision.alternatives.map((a) => a.label).join(' / ')}`,
      changes: [`Ожидание: ${d.expected}`],
      importance: c.isAvatar ? 0.7 : 0.5,
      relatedIds: d.relatedIds,
      noHistory: true,
    });
    decision.eventId = ev.id;
    addHistory(c, { time: world.time, text: `Решение: ${d.choice}`, eventId: ev.id, kind: 'decision' });
    remember(world, c, 'decision', d.choice, 0.6, d.relatedIds ?? []);
  }
  pushCapped(c.decisions, decision, c.isAvatar ? AVATAR_DECISIONS_CAP : DECISIONS_CAP);
  return decision;
}

/** Записывает фактический итог ранее принятого решения. */
export function resolveDecision(c: Character, match: (d: Decision) => boolean, outcome: string): void {
  for (let i = c.decisions.length - 1; i >= 0; i--) {
    const d = c.decisions[i];
    if (!d.outcome && match(d)) {
      d.outcome = outcome;
      return;
    }
  }
}
