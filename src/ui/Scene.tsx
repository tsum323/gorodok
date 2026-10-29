import { useMemo } from 'react';
import type { Character, World } from '../sim/types';
import { SCENES, sceneOf } from '../sim/locations';
import { hourOf } from '../sim/time';
import { Sprite, type Pose } from './Sprite';
import { SCENE_DEFS, type Slot, type SlotKind } from './sceneLayouts';

interface Placed {
  c: Character;
  x: number;
  y: number;
  pose: Pose;
  slotIndex: number;
}

function wantedSlot(c: Character, world: World, scene: string): SlotKind[] {
  const traveling = c.activity.arriveAt !== undefined;
  if (traveling) return ['path', 'spot'];
  const st = c.activity.state;
  if (st === 'sleep') return ['bed', 'spot'];
  const owner = c.job && world.orgs[c.job.orgId]?.locationId === c.locationId && c.activity.actionId === 'work';
  if (owner && (scene === 'cafe' || scene === 'shop' || scene === 'university' || (scene === 'coworking' && c.job?.orgId === 'org_hive'))) return ['staff', 'desk', 'spot'];
  if (st === 'work' || st === 'study' || st === 'think') return ['desk', 'seat', 'spot', 'path'];
  if (st === 'eat' || st === 'talk') return ['seat', 'spot', 'desk', 'path'];
  if (st === 'walk') return ['path', 'spot', 'seat'];
  return ['seat', 'spot', 'path', 'desk'];
}

function poseFor(c: Character, slot: Slot): Pose {
  if (c.activity.arriveAt !== undefined || slot.kind === 'path') return 'walk';
  if (c.activity.state === 'sleep' && slot.kind === 'bed') return 'sleep';
  if (slot.kind === 'desk' || slot.kind === 'seat') return 'sit';
  return 'stand';
}

/** Раскладка персонажей по местам сцены (стабильная: по порядку в мире). */
export function layoutScene(world: World, scene: string): Placed[] {
  const def = SCENE_DEFS[scene];
  const people = world.order.map((id) => world.characters[id]).filter((c) => sceneOf(c.locationId) === scene);
  const used = new Set<number>();
  const out: Placed[] = [];
  for (const c of people) {
    const kinds = wantedSlot(c, world, scene);
    let idx = -1;
    const orgId = c.activity.actionId === 'work' || c.activity.actionId === 'overtime' ? c.job?.orgId : undefined;
    const fits = (s: Slot, i: number, k: SlotKind) => !used.has(i) && s.kind === k && (!s.loc || s.loc === c.locationId);
    for (const k of kinds) {
      // Сотрудники садятся за столы своей организации, остальные — за свободные «общие».
      idx = def.slots.findIndex((s, i) => fits(s, i, k) && (orgId ? s.org === orgId : !s.org));
      if (idx < 0) idx = def.slots.findIndex((s, i) => fits(s, i, k));
      if (idx >= 0) break;
    }
    if (idx < 0) idx = def.slots.findIndex((s, i) => !used.has(i) && (!s.loc || s.loc === c.locationId));
    if (idx < 0) {
      // Мест нет — встаём рядом с последним, со сдвигом.
      out.push({ c, x: 20 + (out.length * 23) % 280, y: 175, pose: 'stand', slotIndex: -1 });
      continue;
    }
    used.add(idx);
    const s = def.slots[idx];
    out.push({ c, x: s.x, y: s.y, pose: poseFor(c, s), slotIndex: idx });
  }
  return out;
}

function bubbleFor(c: Character, world: World): { text: string; kind: 'talk' | 'think' | 'act' | 'sleep' } | null {
  if (c.activity.state === 'sleep') return { text: 'z', kind: 'sleep' };
  if ((c.counters.lastTalkAt ?? -99) >= world.time - 1 && c.activity.arriveAt === undefined) return { text: '…', kind: 'talk' };
  if (c.isAvatar && (c.counters.lastIdeaAt ?? -99) >= world.time - 2) return { text: '💡', kind: 'think' };
  if (c.activity.state === 'think') return { text: c.activity.icon, kind: 'think' };
  return { text: c.activity.arriveAt !== undefined ? '🚶' : c.activity.icon, kind: 'act' };
}

export function Scene({
  world,
  version,
  scene,
  onScene,
  onSelect,
  selectedId,
}: {
  world: World;
  version: number;
  scene: string;
  onScene: (s: string) => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  const hour = hourOf(world.time);
  const night = hour >= 21 || hour < 6;
  const placed = useMemo(() => layoutScene(world, scene), [world, version, scene]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const id of world.order) {
      const s = sceneOf(world.characters[id].locationId);
      m[s] = (m[s] ?? 0) + 1;
    }
    return m;
  }, [world, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const def = SCENE_DEFS[scene];
  const busy = new Set(placed.filter((p) => def.slots[p.slotIndex]?.kind === 'desk' && p.pose === 'sit').map((p) => p.slotIndex));
  const avatarScene = sceneOf(world.characters.player_avatar.locationId);

  return (
    <section className="scene-wrap" aria-label="Сцена">
      <div className="scene-tabs" role="tablist">
        {SCENES.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={scene === s.id}
            className={`scene-tab${scene === s.id ? ' active' : ''}`}
            onClick={() => onScene(s.id)}
            title={s.name}
          >
            {s.short}
            <span className="count">{counts[s.id] ?? 0}</span>
            {avatarScene === s.id && <span className="avatar-dot" title="Здесь главный персонаж" />}
          </button>
        ))}
      </div>
      <div className={`scene${night ? ' night' : ''}`}>
        <svg className="scene-bg" viewBox="0 0 320 180" shapeRendering="crispEdges" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          {def.draw(night, busy)}
        </svg>
        {placed.map((p) => {
          const b = bubbleFor(p.c, world);
          return (
            <button
              key={p.c.id}
              className={`scene-char${p.c.isAvatar ? ' is-avatar' : ''}${selectedId === p.c.id ? ' selected' : ''} pose-${p.pose}`}
              style={{ left: `${(p.x / 320) * 100}%`, top: `${(p.y / 180) * 100}%` }}
              onClick={() => onSelect(p.c.id)}
              title={`${p.c.name} — ${p.c.activity.label}`}
            >
              {b && <span className={`bubble bubble-${b.kind}`}>{b.text}</span>}
              <Sprite appearance={p.c.appearance} pose={p.pose} size={3} highlight={p.c.isAvatar} />
              <span className="char-name">{p.c.name.split(' ')[0]}</span>
            </button>
          );
        })}
        {placed.length === 0 && <div className="scene-empty">Сейчас здесь никого нет</div>}
      </div>
    </section>
  );
}
