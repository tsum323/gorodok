import type { World } from './types';

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Детерминированные ID: префикс + счётчик мира. */
export function nextId(world: World, prefix: string): string {
  const n = (world.counters[prefix] ?? 0) + 1;
  world.counters[prefix] = n;
  return `${prefix}_${n}`;
}

export function pushCapped<T>(arr: T[], item: T, cap: number): void {
  arr.push(item);
  if (arr.length > cap) arr.splice(0, arr.length - cap);
}

export function money(v: number): string {
  return `${Math.round(v).toLocaleString('ru-RU')} ₵`;
}
