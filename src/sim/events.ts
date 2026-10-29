import type { Character, EventType, HistoryEntry, Memory, MemoryKind, World, WorldEvent } from './types';
import { nextId, pushCapped } from './util';

// Единая система событий. Любое значимое изменение мира проходит через emit():
// событие получает ID, порядковый номер, время и попадает в ленту, в историю
// участников и в хранилище (инкрементально, по seq).

export const RECENT_EVENTS_CAP = 400;
export const HISTORY_CAP = 200;
export const MEMORY_CAP = 80;

export interface EventTypeInfo {
  label: string;
  icon: string;
  /** Попадает ли событие в общую ленту по умолчанию. */
  feed: boolean;
  tone: 'good' | 'bad' | 'neutral' | 'idea' | 'social';
}

/** Реестр типов событий. Новые типы добавляются сюда и в EventType. */
export const EVENT_TYPES: Record<EventType, EventTypeInfo> = {
  met: { label: 'Знакомство', icon: '🤝', feed: true, tone: 'social' },
  conversation: { label: 'Разговор', icon: '💬', feed: true, tone: 'social' },
  friendship: { label: 'Дружба', icon: '💛', feed: true, tone: 'good' },
  conflict: { label: 'Конфликт', icon: '⚡', feed: true, tone: 'bad' },
  help: { label: 'Помощь', icon: '🫱', feed: true, tone: 'good' },
  hired: { label: 'Новая работа', icon: '💼', feed: true, tone: 'good' },
  fired: { label: 'Увольнение', icon: '📦', feed: true, tone: 'bad' },
  quit: { label: 'Уход с работы', icon: '🚪', feed: true, tone: 'neutral' },
  promoted: { label: 'Повышение', icon: '⬆', feed: true, tone: 'good' },
  warning: { label: 'Предупреждение', icon: '⚠', feed: true, tone: 'bad' },
  job_search: { label: 'Поиск работы', icon: '🔎', feed: true, tone: 'neutral' },
  project_started: { label: 'Новый проект', icon: '🚀', feed: true, tone: 'good' },
  project_joined: { label: 'Присоединился к проекту', icon: '➕', feed: true, tone: 'good' },
  project_launched: { label: 'Запуск', icon: '🎉', feed: true, tone: 'good' },
  project_failed: { label: 'Провал проекта', icon: '💥', feed: true, tone: 'bad' },
  project_abandoned: { label: 'Проект заброшен', icon: '🗃', feed: true, tone: 'bad' },
  project_milestone: { label: 'Прогресс проекта', icon: '📈', feed: true, tone: 'good' },
  collaboration: { label: 'Сотрудничество', icon: '🤜', feed: true, tone: 'good' },
  agreement_broken: { label: 'Нарушена договорённость', icon: '✂', feed: true, tone: 'bad' },
  idea: { label: 'Новая идея', icon: '💡', feed: true, tone: 'idea' },
  goal_changed: { label: 'Смена цели', icon: '🎯', feed: true, tone: 'neutral' },
  financial: { label: 'Финансы', icon: '₵', feed: true, tone: 'neutral' },
  skill_up: { label: 'Рост навыка', icon: '📚', feed: false, tone: 'good' },
  random: { label: 'Случай', icon: '🎲', feed: true, tone: 'neutral' },
  business: { label: 'Бизнес', icon: '🏪', feed: true, tone: 'neutral' },
  observation: { label: 'Наблюдение', icon: '👁', feed: false, tone: 'idea' },
  decision: { label: 'Решение', icon: '🧭', feed: true, tone: 'neutral' },
};

export interface EmitInput {
  type: EventType;
  participants: string[];
  summary: string;
  cause: string;
  context?: string;
  changes?: string[];
  importance?: number;
  relatedIds?: string[];
  locationId?: string;
  dialogue?: WorldEvent['dialogue'];
  /** Не записывать в историю участников (для мелких событий). */
  noHistory?: boolean;
}

/** Колбэки для подписчиков (например, сохранение). Не сериализуются. */
export function emit(world: World, input: EmitInput): WorldEvent {
  const seq = (world.counters.ev ?? 0) + 1;
  const ev: WorldEvent = {
    id: nextId(world, 'ev'),
    seq,
    time: world.time,
    type: input.type,
    participants: [...new Set(input.participants)],
    locationId: input.locationId,
    summary: input.summary,
    context: input.context ?? '',
    cause: input.cause,
    changes: input.changes ?? [],
    importance: input.importance ?? 0.5,
    relatedIds: input.relatedIds ?? [],
    dialogue: input.dialogue,
  };
  pushCapped(world.events, ev, RECENT_EVENTS_CAP);
  world.stats.eventsTotal++;
  if (!input.noHistory) {
    for (const pid of ev.participants) {
      const c = world.characters[pid];
      if (c) addHistory(c, { time: ev.time, text: ev.summary, eventId: ev.id, kind: 'event' });
    }
  }
  return ev;
}

export function addHistory(c: Character, entry: HistoryEntry): void {
  pushCapped(c.history, entry, c.isAvatar ? HISTORY_CAP * 2 : HISTORY_CAP);
}

export function remember(
  world: World,
  c: Character,
  kind: MemoryKind,
  text: string,
  importance: number,
  relatedIds: string[] = [],
): Memory {
  const m: Memory = { id: nextId(world, 'mem'), time: world.time, kind, text, importance, relatedIds };
  c.memory.push(m);
  if (c.memory.length > MEMORY_CAP) {
    // Забываются наименее важные старые воспоминания.
    let worst = 0;
    let worstScore = Infinity;
    for (let i = 0; i < c.memory.length - 10; i++) {
      const s = c.memory[i].importance - (world.time - c.memory[i].time) / (24 * 60);
      if (s < worstScore) {
        worstScore = s;
        worst = i;
      }
    }
    c.memory.splice(worst, 1);
  }
  return m;
}

/** События, ещё не отправленные в хранилище. */
export function eventsAfter(world: World, seq: number): WorldEvent[] {
  return world.events.filter((e) => e.seq > seq);
}
