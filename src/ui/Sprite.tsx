import { memo } from 'react';
import type { Appearance } from '../sim/types';

// Пиксельный спрайт персонажа, собранный из прямоугольников SVG (без внешних картинок).
// Сетка 12×20 «пикселей»; позы: стоит, сидит, лежит (сон), идёт.

export type Pose = 'stand' | 'sit' | 'sleep' | 'walk';

type Px = [number, number, number, number, string]; // x, y, w, h, цвет

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * k)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * k)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * k)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function pixels(a: Appearance, pose: Pose): Px[] {
  const skin = a.skin;
  const hair = a.hair;
  const shirt = a.shirt;
  const pants = a.pants;
  const dark = '#1b1b22';
  const px: Px[] = [];
  // Голова
  px.push([3, 2, 6, 6, skin]);
  px.push([4, 5, 1, 1, dark], [7, 5, 1, 1, dark]); // глаза
  px.push([5, 7, 2, 1, shade(skin, 0.85)]); // рот/тень
  // Волосы
  switch (a.hairStyle) {
    case 'short':
      px.push([3, 1, 6, 2, hair], [2, 2, 1, 3, hair], [9, 2, 1, 2, hair]);
      break;
    case 'long':
      px.push([3, 1, 6, 2, hair], [2, 2, 1, 8, hair], [9, 2, 1, 8, hair]);
      break;
    case 'bun':
      px.push([5, 0, 2, 1, hair], [3, 1, 6, 2, hair], [2, 2, 1, 3, hair], [9, 2, 1, 3, hair]);
      break;
    case 'curly':
      px.push([2, 0, 8, 3, hair], [1, 2, 1, 3, hair], [10, 2, 1, 3, hair], [2, 3, 1, 1, hair], [9, 3, 1, 1, hair]);
      break;
    case 'cap':
      px.push([2, 1, 8, 2, hair], [8, 2, 3, 1, shade(hair, 0.7)]);
      break;
    case 'bald':
      px.push([2, 3, 1, 2, hair], [9, 3, 1, 2, hair]);
      break;
  }
  if (a.accessory === 'glasses') px.push([3, 5, 3, 1, '#2a2a2a'], [6, 5, 3, 1, '#2a2a2a']);
  // Тело
  const torsoH = 5;
  px.push([3, 8, 6, torsoH, shirt], [3, 8, 6, 1, shade(shirt, 1.2)]);
  // Руки
  px.push([2, 9, 1, 4, shirt], [9, 9, 1, 4, shirt], [2, 13, 1, 1, skin], [9, 13, 1, 1, skin]);
  if (pose === 'sit') {
    px.push([3, 13, 6, 2, pants], [3, 15, 2, 3, pants], [7, 15, 2, 3, pants], [3, 18, 2, 1, dark], [7, 18, 2, 1, dark]);
  } else if (pose === 'walk') {
    px.push([3, 13, 6, 2, pants], [3, 15, 2, 4, pants], [7, 15, 2, 3, pants], [2, 19, 3, 1, dark], [7, 18, 3, 1, dark]);
  } else {
    px.push([3, 13, 6, 2, pants], [3, 15, 2, 4, pants], [7, 15, 2, 4, pants], [3, 19, 2, 1, dark], [7, 19, 2, 1, dark]);
  }
  return px;
}

export const Sprite = memo(function Sprite({
  appearance,
  pose = 'stand',
  size = 3,
  highlight = false,
}: {
  appearance: Appearance;
  pose?: Pose;
  size?: number;
  highlight?: boolean;
}) {
  const px = pixels(appearance, pose);
  const w = 12;
  const h = 20;
  return (
    <svg
      className={`sprite pose-${pose}${highlight ? ' sprite-hl' : ''}`}
      width={w * size}
      height={h * size}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {pose !== 'sleep' && <rect x={2} y={19.4} width={8} height={0.8} fill="rgba(0,0,0,0.35)" />}
      {px.map(([x, y, pw, ph, c], i) => (
        <rect key={i} x={x} y={y} width={pw} height={ph} fill={c} />
      ))}
    </svg>
  );
});

/** Квадратный портрет (голова и плечи) для списков и профиля. */
export const Portrait = memo(function Portrait({ appearance, size = 40 }: { appearance: Appearance; size?: number }) {
  const px = pixels(appearance, 'stand').filter(([, y]) => y < 12);
  return (
    <svg className="portrait" width={size} height={size} viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden="true">
      <rect x={0} y={0} width={12} height={12} fill="var(--portrait-bg)" />
      {px.map(([x, y, pw, ph, c], i) => (
        <rect key={i} x={x} y={y} width={pw} height={Math.min(ph, 12 - y)} fill={c} />
      ))}
    </svg>
  );
});
