import type { JSX, ReactNode } from 'react';

// Пиксельные декорации сцен (SVG 320×180) и места, где могут стоять персонажи.

export type SlotKind = 'desk' | 'seat' | 'bed' | 'spot' | 'path' | 'staff';

export interface Slot {
  x: number;
  y: number;
  kind: SlotKind;
  /** Для жилого квартала — к какому дому относится место. */
  loc?: string;
  /** Рабочее место конкретной организации. */
  org?: string;
}

const C = {
  floor: '#2a2c38',
  floor2: '#30323f',
  wall: '#3a3d50',
  wallTop: '#454960',
  wood: '#6b4f3a',
  woodDark: '#4e3929',
  metal: '#5c6170',
  screen: '#3fb8af',
  screenOff: '#1d2a33',
  plant: '#3e7d4f',
  plantDark: '#2c5a39',
  red: '#b5523b',
  bed: '#6a7bb0',
  sheet: '#d8d3c4',
  grass: '#2f4a33',
  grass2: '#355439',
  road: '#3b3b42',
  stripe: '#8c8a76',
  glass: '#5e86a8',
  glassNight: '#e9c46a',
  sky: '#6c8fb5',
  skyNight: '#141a2e',
};

const R = (x: number, y: number, w: number, h: number, fill: string, key?: string | number) => <rect key={key} x={x} y={y} width={w} height={h} fill={fill} />;

function Desk({ x, y, on }: { x: number; y: number; on: boolean }) {
  return (
    <g>
      {R(x - 10, y - 12, 20, 3, C.wood)}
      {R(x - 9, y - 9, 2, 7, C.woodDark)}
      {R(x + 7, y - 9, 2, 7, C.woodDark)}
      {R(x - 5, y - 20, 10, 7, C.metal)}
      {R(x - 4, y - 19, 8, 5, on ? C.screen : C.screenOff)}
      {R(x - 1, y - 13, 2, 1, C.metal)}
    </g>
  );
}

function Table({ x, y }: { x: number; y: number }) {
  return (
    <g>
      {R(x - 8, y - 10, 16, 3, C.wood)}
      {R(x - 1, y - 7, 2, 6, C.woodDark)}
      {R(x - 2, y - 13, 3, 3, '#e8e2d0')}
    </g>
  );
}

function Plant({ x, y }: { x: number; y: number }) {
  return (
    <g>
      {R(x - 3, y - 5, 6, 5, C.red)}
      {R(x - 5, y - 13, 10, 8, C.plant)}
      {R(x - 3, y - 16, 6, 4, C.plantDark)}
    </g>
  );
}

function Window({ x, y, w, h, night }: { x: number; y: number; w: number; h: number; night: boolean }) {
  return (
    <g>
      {R(x - 1, y - 1, w + 2, h + 2, C.wallTop)}
      {R(x, y, w, h, night ? C.skyNight : C.sky)}
      {R(x + w / 2 - 0.5, y, 1, h, C.wallTop)}
      {night && R(x + 2, y + 2, 1, 1, '#ffffff')}
    </g>
  );
}

function Bed({ x, y }: { x: number; y: number }) {
  return (
    <g>
      {R(x - 12, y - 8, 24, 6, C.woodDark)}
      {R(x - 12, y - 10, 24, 3, C.bed)}
      {R(x - 12, y - 11, 6, 3, C.sheet)}
    </g>
  );
}

function Shelf({ x, y }: { x: number; y: number }) {
  return (
    <g>
      {R(x - 10, y - 30, 20, 30, C.woodDark)}
      {[0, 1, 2].map((i) => R(x - 9, y - 28 + i * 9, 18, 7, i % 2 ? '#c9a227' : '#7aa5c9', i))}
      {R(x - 4, y - 28, 3, 7, C.red)}
      {R(x + 3, y - 19, 3, 7, C.plant)}
    </g>
  );
}

function Tree({ x, y }: { x: number; y: number }) {
  return (
    <g>
      {R(x - 2, y - 12, 4, 12, C.woodDark)}
      {R(x - 10, y - 30, 20, 18, C.plant)}
      {R(x - 7, y - 36, 14, 8, C.plantDark)}
    </g>
  );
}

function Bench({ x, y }: { x: number; y: number }) {
  return (
    <g>
      {R(x - 10, y - 8, 20, 3, C.wood)}
      {R(x - 10, y - 13, 20, 2, C.wood)}
      {R(x - 9, y - 5, 2, 5, C.metal)}
      {R(x + 7, y - 5, 2, 5, C.metal)}
    </g>
  );
}

function Room({ children, night, label }: { children?: ReactNode; night: boolean; label?: string }) {
  return (
    <g>
      {R(0, 0, 320, 70, C.wall)}
      {R(0, 68, 320, 4, C.wallTop)}
      {R(0, 72, 320, 108, C.floor)}
      {Array.from({ length: 10 }, (_, i) => R(i * 32 + (i % 2) * 16, 72, 16, 108, C.floor2, `f${i}`))}
      {label && (
        <text x={6} y={12} fill="#9aa0b8" fontSize={7} fontFamily="monospace">
          {label}
        </text>
      )}
      {night && R(0, 0, 320, 180, 'rgba(10,14,40,0.25)')}
      {children}
    </g>
  );
}

export interface SceneDef {
  slots: Slot[];
  draw(night: boolean, busyDesks: Set<number>): JSX.Element;
}

const officeDesks: [number, number][] = [
  [30, 110], [70, 110], [110, 110], [30, 150], [70, 150], [110, 150],
  [200, 110], [240, 110], [280, 110], [200, 150], [240, 150],
];

const coworkDesks: [number, number][] = [
  [30, 112], [65, 112], [100, 112], [135, 112], [30, 156], [65, 156], [100, 156], [135, 156], [245, 112], [280, 112], [245, 156],
];

export const SCENE_DEFS: Record<string, SceneDef> = {
  office: {
    slots: [
      ...officeDesks.map(([x, y], i) => ({ x, y, kind: 'desk' as const, org: i < 6 ? 'org_nordcode' : 'org_fintrust' })),
      { x: 160, y: 95, kind: 'spot' }, { x: 160, y: 130, kind: 'spot' }, { x: 290, y: 160, kind: 'spot' }, { x: 150, y: 170, kind: 'spot' },
      { x: 175, y: 160, kind: 'spot' }, { x: 300, y: 135, kind: 'spot' },
    ],
    draw: (night, busy) => (
      <Room night={night} label="Северный Код  |  ФинТраст">
        <Window x={20} y={20} w={40} h={28} night={night} />
        <Window x={90} y={20} w={40} h={28} night={night} />
        <Window x={200} y={20} w={40} h={28} night={night} />
        <Window x={260} y={20} w={40} h={28} night={night} />
        {R(156, 0, 8, 72, C.wallTop)}
        {R(150, 72, 20, 108, '#262833')}
        <Plant x={140} y={70} />
        <Plant x={180} y={70} />
        {R(290, 50, 12, 20, C.metal)}
        {R(292, 53, 8, 4, C.red)}
        <g>{officeDesks.map(([x, y], i) => <Desk key={i} x={x} y={y - 2} on={busy.has(i)} />)}</g>
      </Room>
    ),
  },
  coworking: {
    slots: [
      ...coworkDesks.map(([x, y], i) => ({ x, y, kind: 'desk' as const, org: i >= 8 ? 'org_pixel' : undefined })),
      { x: 190, y: 120, kind: 'seat' }, { x: 205, y: 145, kind: 'seat' }, { x: 180, y: 160, kind: 'seat' },
      { x: 215, y: 95, kind: 'spot' }, { x: 300, y: 165, kind: 'spot' }, { x: 160, y: 95, kind: 'staff' },
    ],
    draw: (night, busy) => (
      <Room night={night} label="Коворкинг «Улей»  ·  угол «Пикселя»">
        <Window x={20} y={18} w={60} h={32} night={night} />
        <Window x={100} y={18} w={60} h={32} night={night} />
        {R(230, 10, 80, 50, '#2f3346')}
        <text x={240} y={30} fill="#e07a2f" fontSize={8} fontFamily="monospace">PIXEL</text>
        {R(180, 40, 30, 28, '#e07a2f')}
        <text x={184} y={57} fill="#1b1b22" fontSize={7} fontFamily="monospace">HIVE</text>
        {R(175, 128, 40, 8, '#4a5a8a')}
        {R(172, 120, 6, 16, '#4a5a8a')}
        <Plant x={225} y={176} />
        <g>{coworkDesks.map(([x, y], i) => <Desk key={i} x={x} y={y - 2} on={busy.has(i)} />)}</g>
      </Room>
    ),
  },
  cafe: {
    slots: [
      { x: 60, y: 92, kind: 'staff' }, { x: 95, y: 92, kind: 'staff' },
      { x: 150, y: 120, kind: 'seat' }, { x: 182, y: 120, kind: 'seat' }, { x: 230, y: 120, kind: 'seat' }, { x: 262, y: 120, kind: 'seat' },
      { x: 150, y: 165, kind: 'seat' }, { x: 182, y: 165, kind: 'seat' }, { x: 230, y: 165, kind: 'seat' }, { x: 262, y: 165, kind: 'seat' },
      { x: 40, y: 150, kind: 'spot' }, { x: 70, y: 160, kind: 'spot' }, { x: 100, y: 150, kind: 'spot' }, { x: 300, y: 140, kind: 'spot' },
    ],
    draw: (night) => (
      <Room night={night} label="Кафе «Зерно»">
        <Window x={140} y={18} w={50} h={34} night={night} />
        <Window x={220} y={18} w={50} h={34} night={night} />
        {R(30, 20, 90, 30, C.woodDark)}
        {[0, 1, 2, 3].map((i) => R(36 + i * 21, 26, 14, 4, '#e8e2d0', i))}
        <text x={40} y={45} fill="#e9c46a" fontSize={6} fontFamily="monospace">КОФЕ · ЧАЙ</text>
        {R(30, 96, 90, 14, C.wood)}
        {R(30, 94, 90, 3, '#8a6a4a')}
        {R(40, 86, 10, 8, C.metal)}
        <Table x={166} y={128} />
        <Table x={246} y={128} />
        <Table x={166} y={172} />
        <Table x={246} y={172} />
        <Plant x={305} y={100} />
      </Room>
    ),
  },
  park: {
    slots: [
      ...[20, 52, 84, 116, 148, 180, 212, 244, 276, 300].map((x, i) => ({ x, y: i % 2 ? 128 : 140, kind: 'path' as const })),
      { x: 60, y: 172, kind: 'seat' }, { x: 75, y: 172, kind: 'seat' }, { x: 230, y: 172, kind: 'seat' }, { x: 245, y: 172, kind: 'seat' },
      { x: 150, y: 172, kind: 'spot' }, { x: 300, y: 172, kind: 'spot' }, { x: 30, y: 105, kind: 'spot' }, { x: 290, y: 105, kind: 'spot' },
    ],
    draw: (night) => (
      <g>
        {R(0, 0, 320, 60, night ? C.skyNight : C.sky)}
        {night && [20, 80, 150, 210, 290].map((x, i) => R(x, 8 + (i % 3) * 7, 1, 1, '#ffffff', i))}
        {R(10, 20, 50, 40, '#3a3d50')}
        {R(70, 10, 40, 50, '#454960')}
        {R(220, 15, 60, 45, '#3a3d50')}
        {[0, 1, 2, 3].map((i) => R(16 + i * 11, 28, 6, 6, night ? C.glassNight : C.glass, `w1${i}`))}
        {[0, 1, 2].map((i) => R(76 + i * 11, 20, 6, 6, night && i !== 1 ? C.glassNight : C.glass, `w2${i}`))}
        {[0, 1, 2, 3, 4].map((i) => R(226 + i * 11, 25, 6, 6, night && i % 2 ? C.glassNight : C.glass, `w3${i}`))}
        {R(0, 60, 320, 52, C.grass)}
        {R(0, 112, 320, 36, C.road)}
        {Array.from({ length: 10 }, (_, i) => R(i * 34 + 6, 129, 16, 2, C.stripe, `s${i}`))}
        {R(0, 148, 320, 32, C.grass2)}
        <Tree x={30} y={100} />
        <Tree x={130} y={95} />
        <Tree x={200} y={102} />
        <Tree x={290} y={98} />
        <Bench x={68} y={178} />
        <Bench x={238} y={178} />
        {R(150, 150, 2, 22, C.metal)}
        {R(147, 148, 8, 3, night ? C.glassNight : C.metal)}
        {night && R(0, 0, 320, 180, 'rgba(10,14,40,0.3)')}
      </g>
    ),
  },
  university: {
    slots: [
      { x: 160, y: 92, kind: 'staff' },
      ...[0, 1, 2, 3, 4].map((i) => ({ x: 70 + i * 45, y: 130, kind: 'desk' as const })),
      ...[0, 1, 2, 3, 4].map((i) => ({ x: 70 + i * 45, y: 168, kind: 'desk' as const })),
      { x: 30, y: 160, kind: 'spot' }, { x: 300, y: 160, kind: 'spot' }, { x: 300, y: 110, kind: 'spot' },
    ],
    draw: (night) => (
      <Room night={night} label="Городской университет — аудитория 214">
        {R(90, 14, 140, 46, '#1f3b2f')}
        {R(88, 12, 144, 2, C.woodDark)}
        <text x={100} y={32} fill="#d8d3c4" fontSize={7} fontFamily="monospace">y = f(x) + ε</text>
        <text x={100} y={46} fill="#d8d3c4" fontSize={6} fontFamily="monospace">ИИ · данные · модели</text>
        <Shelf x={20} y={70} />
        <Shelf x={300} y={70} />
        {[0, 1, 2, 3, 4].map((i) => R(55 + i * 45, 120, 30, 3, C.wood, `d1${i}`))}
        {[0, 1, 2, 3, 4].map((i) => R(55 + i * 45, 158, 30, 3, C.wood, `d2${i}`))}
      </Room>
    ),
  },
  shop: {
    slots: [
      { x: 270, y: 100, kind: 'staff' },
      { x: 60, y: 130, kind: 'spot' }, { x: 120, y: 130, kind: 'spot' }, { x: 180, y: 130, kind: 'spot' },
      { x: 60, y: 172, kind: 'spot' }, { x: 120, y: 172, kind: 'spot' }, { x: 180, y: 172, kind: 'spot' }, { x: 240, y: 165, kind: 'spot' },
    ],
    draw: (night) => (
      <Room night={night} label="Магазин «Рядом»">
        {[30, 90, 150].map((x, i) => (
          <g key={i}>
            {R(x, 20, 50, 48, C.woodDark)}
            {[0, 1, 2, 3].map((j) => R(x + 2, 22 + j * 12, 46, 9, ['#c9a227', '#b5523b', '#3e7d4f', '#7aa5c9'][(i + j) % 4], j))}
          </g>
        ))}
        {R(240, 102, 60, 14, C.wood)}
        {R(250, 92, 14, 10, C.metal)}
        {R(252, 94, 10, 4, C.screen)}
        {R(30, 140, 100, 6, C.woodDark)}
        {R(30, 134, 100, 6, '#e9c46a')}
        <Window x={230} y={18} w={70} h={36} night={night} />
      </Room>
    ),
  },
  home: {
    slots: [
      // Многоэтажка (x 0–150)
      ...[[25, 100], [70, 100], [115, 100], [25, 160], [70, 160], [115, 160]].map(([x, y]) => ({ x, y, kind: 'bed' as const, loc: 'home_flats' })),
      ...[[45, 120], [92, 120], [135, 120], [45, 176], [92, 176], [135, 176], [10, 176]].map(([x, y]) => ({ x, y, kind: 'spot' as const, loc: 'home_flats' })),
      // Общежитие (x 155–235)
      ...[[175, 100], [215, 100], [175, 160], [215, 160]].map(([x, y]) => ({ x, y, kind: 'bed' as const, loc: 'home_dorm' })),
      ...[[195, 120], [195, 176], [228, 176], [162, 176]].map(([x, y]) => ({ x, y, kind: 'spot' as const, loc: 'home_dorm' })),
      // Лофты (x 240–320)
      ...[[262, 100], [300, 100], [262, 160], [300, 160]].map(([x, y]) => ({ x, y, kind: 'bed' as const, loc: 'home_lofts' })),
      ...[[282, 120], [282, 176], [312, 176], [248, 176]].map(([x, y]) => ({ x, y, kind: 'spot' as const, loc: 'home_lofts' })),
    ],
    draw: (night) => (
      <g>
        {R(0, 0, 320, 180, C.floor)}
        {/* стены домов */}
        {R(0, 0, 150, 180, '#2c2f3e')}
        {R(155, 0, 80, 180, '#33302f')}
        {R(240, 0, 80, 180, '#2a3438')}
        {R(150, 0, 5, 180, '#1b1c24')}
        {R(235, 0, 5, 180, '#1b1c24')}
        {R(0, 120, 320, 4, '#1b1c24')}
        {R(0, 62, 320, 3, '#1b1c24')}
        <text x={4} y={9} fill="#9aa0b8" fontSize={6} fontFamily="monospace">Многоэтажка</text>
        <text x={158} y={9} fill="#9aa0b8" fontSize={6} fontFamily="monospace">Общежитие</text>
        <text x={243} y={9} fill="#9aa0b8" fontSize={6} fontFamily="monospace">Лофты</text>
        {[10, 55, 100, 165, 205, 250, 290].map((x, i) => (
          <Window key={i} x={x} y={16} w={22} h={20} night={night} />
        ))}
        {[[25, 100], [70, 100], [115, 100], [25, 160], [70, 160], [115, 160], [175, 100], [215, 100], [175, 160], [215, 160], [262, 100], [300, 100], [262, 160], [300, 160]].map(
          ([x, y], i) => <Bed key={i} x={x} y={y + 6} />,
        )}
        {night && R(0, 0, 320, 180, 'rgba(10,14,40,0.35)')}
      </g>
    ),
  },
};
