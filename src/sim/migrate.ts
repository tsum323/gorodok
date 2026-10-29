import type { World } from './types';

// Миграции снимка мира. Каждая версия — функция, приводящая объект
// предыдущей версии к следующей. Снимки старых версий загружаются
// последовательным применением шагов.

export const CURRENT_WORLD_VERSION = 1;

type Step = (w: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[n] переводит версию n в n+1. */
const MIGRATIONS: Record<number, Step> = {
  // Пример будущего шага:
  // 1: (w) => ({ ...w, newField: defaultValue, version: 2 }),
};

export function migrateWorld(raw: unknown): World {
  if (!raw || typeof raw !== 'object') throw new Error('Повреждённое сохранение: ожидался объект мира');
  let w = raw as Record<string, unknown>;
  let v = typeof w.version === 'number' ? w.version : 0;
  if (v > CURRENT_WORLD_VERSION) {
    throw new Error(`Сохранение создано более новой версией (${v}), чем поддерживает приложение (${CURRENT_WORLD_VERSION})`);
  }
  while (v < CURRENT_WORLD_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`Нет миграции с версии ${v}`);
    w = step(w);
    v = w.version as number;
  }
  const world = w as unknown as World;
  // Поля, которые не входят в снимок, восстанавливаются пустыми.
  world.ideas ??= {};
  world.events ??= [];
  world.observations ??= [];
  return world;
}

/** Сериализация без архива идей (он хранится отдельно). */
export function serializeWorld(world: World): string {
  const { ideas: _ideas, ...rest } = world;
  void _ideas;
  return JSON.stringify(rest);
}
