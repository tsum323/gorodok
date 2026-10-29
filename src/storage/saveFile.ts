import type { Idea, WorldEvent } from '../sim/types';

/** Формат файла экспорта/импорта сохранения. */
export interface SaveFile {
  format: 'parallel-life-save';
  formatVersion: 1;
  exportedAt: string;
  snapshot: unknown;
  events: WorldEvent[];
  ideas: Idea[];
}

export function isSaveFile(x: unknown): x is SaveFile {
  return !!x && typeof x === 'object' && (x as SaveFile).format === 'parallel-life-save' && !!(x as SaveFile).snapshot;
}
