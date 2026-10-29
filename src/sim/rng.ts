// Детерминированный генератор случайных чисел (mulberry32).
// Состояние хранится в мире (world.rngState), поэтому симуляция воспроизводима:
// одинаковый seed + одинаковая последовательность шагов = одинаковый результат.

export interface RngHolder {
  rngState: number;
}

export function nextRandom(h: RngHolder): number {
  let t = (h.rngState = (h.rngState + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function chance(h: RngHolder, p: number): boolean {
  return nextRandom(h) < p;
}

export function randInt(h: RngHolder, min: number, max: number): number {
  return min + Math.floor(nextRandom(h) * (max - min + 1));
}

export function randRange(h: RngHolder, min: number, max: number): number {
  return min + nextRandom(h) * (max - min);
}

export function pick<T>(h: RngHolder, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick: пустой список');
  return items[Math.floor(nextRandom(h) * items.length)];
}

export function weightedPick<T>(h: RngHolder, items: readonly T[], weight: (item: T) => number): T | undefined {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  if (total <= 0) return undefined;
  let r = nextRandom(h) * total;
  for (const it of items) {
    r -= Math.max(0, weight(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

/** Перемешивание (Фишер–Йетс) — возвращает новый массив. */
export function shuffled<T>(h: RngHolder, items: readonly T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(h) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
