import type { Location, LocationId } from './types';

// Локации мира. Несколько квартир объединены в одну сцену «Жилой квартал».

export const LOCATIONS: Location[] = [
  { id: 'home_flats', name: 'Многоэтажка на Садовой', kind: 'home', scene: 'home', description: 'Съёмные квартиры и комнаты.' },
  { id: 'home_dorm', name: 'Общежитие', kind: 'home', scene: 'home', description: 'Комнаты студентов и тех, кто экономит.' },
  { id: 'home_lofts', name: 'Лофты у набережной', kind: 'home', scene: 'home', description: 'Дорогие квартиры с видом на реку.' },
  { id: 'office', name: 'Бизнес-центр «Меридиан»', kind: 'office', scene: 'office', description: 'Офисы IT-компании и финансовой фирмы.' },
  { id: 'coworking', name: 'Коворкинг «Улей»', kind: 'coworking', scene: 'coworking', description: 'Фрилансеры, стартапы, нетворкинг.' },
  { id: 'cafe', name: 'Кафе «Зерно»', kind: 'cafe', scene: 'cafe', description: 'Кофе, обеды, случайные знакомства.' },
  { id: 'park', name: 'Улица и сквер', kind: 'park', scene: 'park', description: 'Прогулки, дорога между местами, размышления.' },
  { id: 'university', name: 'Городской университет', kind: 'university', scene: 'university', description: 'Лекции, библиотека, курсы.' },
  { id: 'shop', name: 'Магазин «Рядом»', kind: 'shop', scene: 'shop', description: 'Продукты и мелочи у дома.' },
];

export interface SceneDef {
  id: string;
  name: string;
  short: string;
}

export const SCENES: SceneDef[] = [
  { id: 'home', name: 'Жилой квартал', short: 'Дом' },
  { id: 'office', name: 'Бизнес-центр', short: 'Офис' },
  { id: 'coworking', name: 'Коворкинг', short: 'Коворк' },
  { id: 'cafe', name: 'Кафе «Зерно»', short: 'Кафе' },
  { id: 'park', name: 'Улица и сквер', short: 'Улица' },
  { id: 'university', name: 'Университет', short: 'Универ' },
  { id: 'shop', name: 'Магазин', short: 'Магазин' },
];

const byId = new Map(LOCATIONS.map((l) => [l.id, l]));

export function getLocation(id: LocationId): Location {
  const l = byId.get(id);
  if (!l) throw new Error(`Неизвестная локация: ${id}`);
  return l;
}

export function sceneOf(id: LocationId): string {
  return byId.get(id)?.scene ?? 'park';
}

/** Дорога между разными сценами занимает 1 час (между квартирами — тоже). */
export function travelHours(from: LocationId, to: LocationId): number {
  return from === to ? 0 : 1;
}
