import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, DB_SCHEMA_VERSION } from '../server/db.ts';
import { serializeWorld, migrateWorld, CURRENT_WORLD_VERSION } from '../src/sim/migrate.ts';
import { tryGenerateIdea } from '../src/sim/ideas/generator.ts';
import { observe } from '../src/sim/ideas/observe.ts';
import { GameController } from '../src/app/controller.ts';
import type { StorageAdapter } from '../src/storage/adapter.ts';
import type { SaveFile } from '../src/storage/saveFile.ts';
import type { Idea, WorldEvent } from '../src/sim/types.ts';
import { freshWorld, simulateDays } from './helpers.ts';

const dirs: string[] = [];
function tempDb(): string {
  const d = mkdtempSync(join(tmpdir(), 'pl-test-'));
  dirs.push(d);
  return join(d, 'test.db');
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function worldWithIdea() {
  const w = simulateDays(freshWorld(61), 3);
  const av = w.characters.player_avatar;
  observe(w, av, 'support_repeat', 'наблюдение');
  tryGenerateIdea(w, av, 'reflection', { ignoreCooldown: true, now: () => '2026-10-29T00:00:00.000Z' });
  return w;
}

describe('SQLite-хранилище', () => {
  it('применяет миграции схемы', () => {
    const s = new Store(tempDb());
    expect(s.schemaVersion()).toBe(DB_SCHEMA_VERSION);
    s.close();
  });

  it('мир, события и идеи переживают перезапуск', () => {
    const path = tempDb();
    const w = worldWithIdea();
    const s1 = new Store(path);
    s1.saveWorld(serializeWorld(w), w.events, Object.values(w.ideas));
    s1.close();

    const s2 = new Store(path);
    const row = s2.loadWorld()!;
    const restored = migrateWorld(JSON.parse(row.snapshot));
    expect(restored.time).toBe(w.time);
    expect(restored.rngState).toBe(w.rngState);
    expect(Object.keys(restored.characters)).toEqual(Object.keys(w.characters));
    expect(s2.countEvents(w.worldId)).toBe(w.events.length);
    expect(s2.listIdeas()).toHaveLength(Object.keys(w.ideas).length);
    s2.close();
  });

  it('повторное сохранение не дублирует события', () => {
    const s = new Store(tempDb());
    const w = worldWithIdea();
    s.saveWorld(serializeWorld(w), w.events, []);
    s.saveWorld(serializeWorld(w), w.events, []);
    expect(s.countEvents(w.worldId)).toBe(w.events.length);
    const avatarEvents = s.listEvents({ worldId: w.worldId, characterId: 'player_avatar', limit: 1000 });
    expect(avatarEvents.every((e) => e.participants.includes('player_avatar'))).toBe(true);
    s.close();
  });

  it('сброс мира не удаляет архив идей', () => {
    const s = new Store(tempDb());
    const w = worldWithIdea();
    s.saveWorld(serializeWorld(w), w.events, Object.values(w.ideas));
    s.resetWorld();
    expect(s.loadWorld()).toBeNull();
    expect(s.countEvents(w.worldId)).toBe(0);
    expect(s.listIdeas().length).toBe(Object.keys(w.ideas).length);
    s.close();
  });

  it('правки идеи пользователем сохраняются, поиск работает', () => {
    const s = new Store(tempDb());
    const w = worldWithIdea();
    const idea = Object.values(w.ideas)[0];
    s.upsertIdea({ ...idea, status: 'interesting', userNotes: 'проверить с коллегами', userRating: 4, favorite: true });
    const got = s.getIdea(idea.id)!;
    expect(got.status).toBe('interesting');
    expect(got.userRating).toBe(4);
    expect(s.listIdeas({ q: 'коллегами' })).toHaveLength(1);
    expect(s.listIdeas({ status: 'new' })).toHaveLength(0);
    s.close();
  });

  it('экспорт и импорт сохранения', () => {
    const a = new Store(tempDb());
    const w = worldWithIdea();
    a.saveWorld(serializeWorld(w), w.events, Object.values(w.ideas));
    const file = a.exportSave()!;
    expect(file.format).toBe('parallel-life-save');
    const b = new Store(tempDb());
    b.importSave(JSON.parse(JSON.stringify(file)));
    expect(b.loadWorld()!.gameTime).toBe(w.time);
    expect(b.listIdeas()).toHaveLength(Object.keys(w.ideas).length);
    expect(() => b.importSave({ format: 'другое' } as unknown as SaveFile)).toThrow();
    a.close();
    b.close();
  });

  it('снимок не содержит архив идей, а миграции отвергают будущие версии', () => {
    const w = worldWithIdea();
    expect(JSON.parse(serializeWorld(w)).ideas).toBeUndefined();
    expect(() => migrateWorld({ version: CURRENT_WORLD_VERSION + 1 })).toThrow();
    expect(() => migrateWorld(null)).toThrow();
  });
});

/** Хранилище в памяти, повторяющее контракт адаптера. */
class MemoryStorage implements StorageAdapter {
  readonly kind = 'browser' as const;
  readonly label = 'memory';
  ai = null;
  snapshot: string | null = null;
  events: WorldEvent[] = [];
  ideas = new Map<string, Idea>();
  async loadWorld() {
    return this.snapshot ? JSON.parse(this.snapshot) : null;
  }
  async saveWorld(snapshot: string, events: WorldEvent[], ideas: Idea[]) {
    this.snapshot = snapshot;
    const known = new Set(this.events.map((e) => e.id));
    for (const e of events) if (!known.has(e.id)) this.events.push(e);
    for (const i of ideas) this.ideas.set(i.id, structuredClone(i));
  }
  async loadIdeas() {
    return [...this.ideas.values()].map((i) => structuredClone(i));
  }
  async saveIdea(i: Idea) {
    this.ideas.set(i.id, structuredClone(i));
  }
  async loadEvents(_w: string, o: { characterId?: string } = {}) {
    return this.events.filter((e) => !o.characterId || e.participants.includes(o.characterId));
  }
  async resetWorld() {
    this.snapshot = null;
    this.events = [];
  }
  async exportSave() {
    return null;
  }
  async importSave() {}
}

describe('контроллер игры', () => {
  it('после «перезапуска» мир продолжается с того же места, полная история сохраняется', async () => {
    const storage = new MemoryStorage();
    const g1 = new GameController(storage);
    await g1.init();
    g1.stop();
    for (let i = 0; i < 24 * 20; i++) g1.step();
    await g1.save();
    const time = g1.world.time;
    const total = g1.world.stats.eventsTotal;
    expect(storage.events.length).toBe(total); // в хранилище все события, а не только последние
    const ideaIds = Object.keys(g1.world.ideas);

    const g2 = new GameController(storage);
    await g2.init();
    g2.stop();
    expect(g2.world.time).toBe(time);
    expect(Object.keys(g2.world.ideas).sort()).toEqual(ideaIds.sort());
    g2.step();
    expect(g2.world.time).toBe(time + 1);
  });

  it('новый мир сохраняет старые идеи в архиве', async () => {
    const storage = new MemoryStorage();
    const g = new GameController(storage);
    await g.init();
    g.stop();
    const av = g.world.characters.player_avatar;
    observe(g.world, av, 'support_repeat', 'x');
    tryGenerateIdea(g.world, av, 'reflection', { ignoreCooldown: true });
    g.step();
    await g.save();
    const before = g.allIdeas().length;
    expect(before).toBe(1);
    await g.newWorld({ seed: 99, avatar: { name: 'Тест' } });
    g.stop();
    expect(g.world.characters.player_avatar.name).toBe('Тест');
    expect(g.pastIdeas).toHaveLength(1);
    await g.updateIdea(g.pastIdeas[0].id, { status: 'review', userNotes: 'заметка' });
    expect((await storage.loadIdeas())[0].userNotes).toBe('заметка');
  });
});
