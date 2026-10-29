import type { GameTime } from './types';

// Игровое время: world.time — число часов от полуночи даты начала мира.

export const HOURS_PER_DAY = 24;
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function hourOf(t: GameTime): number {
  return ((t % 24) + 24) % 24;
}

export function dayOf(t: GameTime): number {
  return Math.floor(t / 24);
}

/** 0 = понедельник (мир начинается в понедельник). */
export function weekdayOf(t: GameTime): number {
  return dayOf(t) % 7;
}

export function isWeekend(t: GameTime): boolean {
  return weekdayOf(t) >= 5;
}

export function toDate(startDate: string, t: GameTime): Date {
  const d = new Date(startDate);
  d.setUTCHours(d.getUTCHours() + t);
  return d;
}

export function formatGameTime(startDate: string, t: GameTime, withTime = true): string {
  const d = toDate(startDate, t);
  const base = `${WEEKDAYS[weekdayOf(t)]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (!withTime) return base;
  return `${base}, ${String(d.getUTCHours()).padStart(2, '0')}:00`;
}

export function formatShort(startDate: string, t: GameTime): string {
  const d = toDate(startDate, t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${String(d.getUTCHours()).padStart(2, '0')}:00`;
}

export function formatDuration(hours: number): string {
  if (hours < 24) return `${hours} ч`;
  const days = Math.floor(hours / 24);
  return `${days} дн`;
}

export function isNight(t: GameTime): boolean {
  const h = hourOf(t);
  return h >= 23 || h < 7;
}
