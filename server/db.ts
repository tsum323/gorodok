import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Idea, WorldEvent } from '../src/sim/types.ts';
import type { SaveFile } from '../src/storage/saveFile.ts';

export type { SaveFile };

// Хранилище на SQLite (встроенный модуль node:sqlite, без нативных зависимостей).
// Схема развивается миграциями: PRAGMA user_version хранит номер последней применённой.
//
// Таблицы:
//  world  — снимок текущего мира (JSON) + служебные поля;
//  events — полная история событий (append-only, INSERT OR IGNORE по id);
//  ideas  — архив идей, не удаляется при сбросе мира;
//  meta   — настройки и служебные значения.

const MIGRATIONS: string[] = [
  // 1: базовая схема
  `
  CREATE TABLE IF NOT EXISTS world (
    slot TEXT PRIMARY KEY,
    world_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    game_time INTEGER NOT NULL,
    seed INTEGER NOT NULL,
    rng_state INTEGER NOT NULL,
    snapshot TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    world_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    game_time INTEGER NOT NULL,
    type TEXT NOT NULL,
    participants TEXT NOT NULL,
    summary TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS events_world_seq ON events(world_id, seq);
  CREATE TABLE IF NOT EXISTS event_participants (
    event_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    world_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    PRIMARY KEY (event_id, character_id)
  );
  CREATE INDEX IF NOT EXISTS ep_char ON event_participants(world_id, character_id, seq);
  CREATE TABLE IF NOT EXISTS ideas (
    id TEXT PRIMARY KEY,
    world_id TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    favorite INTEGER NOT NULL DEFAULT 0,
    user_rating INTEGER NOT NULL DEFAULT 0,
    game_time INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    search_text TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ideas_status ON ideas(status);
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

export const DB_SCHEMA_VERSION = MIGRATIONS.length;

export interface WorldRow {
  worldId: string;
  version: number;
  gameTime: number;
  snapshot: string;
  updatedAt: string;
}

export class Store {
  readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
    this.migrate();
  }

  private migrate(): void {
    const row = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
    let v = row.user_version;
    while (v < MIGRATIONS.length) {
      this.db.exec('BEGIN');
      try {
        this.db.exec(MIGRATIONS[v]);
        v++;
        this.db.exec(`PRAGMA user_version = ${v}`);
        this.db.exec('COMMIT');
      } catch (e) {
        this.db.exec('ROLLBACK');
        throw e;
      }
    }
  }

  schemaVersion(): number {
    return (this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  }

  private tx<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const r = fn();
      this.db.exec('COMMIT');
      return r;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  loadWorld(): WorldRow | null {
    const r = this.db.prepare('SELECT world_id, version, game_time, snapshot, updated_at FROM world WHERE slot = ?').get('current') as
      | { world_id: string; version: number; game_time: number; snapshot: string; updated_at: string }
      | undefined;
    if (!r) return null;
    return { worldId: r.world_id, version: r.version, gameTime: r.game_time, snapshot: r.snapshot, updatedAt: r.updated_at };
  }

  /** Сохраняет снимок, дописывает новые события и обновляет идеи — атомарно. */
  saveWorld(snapshot: string, events: WorldEvent[], ideas: Idea[]): void {
    const meta = JSON.parse(snapshot) as { worldId: string; version: number; time: number; seed: number; rngState: number };
    if (!meta.worldId) throw new Error('Снимок без worldId');
    this.tx(() => {
      this.db
        .prepare(
          `INSERT INTO world (slot, world_id, version, game_time, seed, rng_state, snapshot, updated_at)
           VALUES ('current', ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(slot) DO UPDATE SET world_id = excluded.world_id, version = excluded.version, game_time = excluded.game_time,
             seed = excluded.seed, rng_state = excluded.rng_state, snapshot = excluded.snapshot, updated_at = excluded.updated_at`,
        )
        .run(meta.worldId, meta.version, meta.time, meta.seed, meta.rngState, snapshot, new Date().toISOString());
      this.appendEvents(meta.worldId, events);
      for (const idea of ideas) this.upsertIdea(idea);
    });
  }

  private appendEvents(worldId: string, events: WorldEvent[]): void {
    const ins = this.db.prepare(
      'INSERT OR IGNORE INTO events (id, world_id, seq, game_time, type, participants, summary, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const insP = this.db.prepare('INSERT OR IGNORE INTO event_participants (event_id, character_id, world_id, seq) VALUES (?, ?, ?, ?)');
    for (const e of events) {
      const key = `${worldId}:${e.id}`;
      const res = ins.run(key, worldId, e.seq, e.time, e.type, JSON.stringify(e.participants), e.summary, JSON.stringify(e));
      if (res.changes > 0) for (const p of e.participants) insP.run(key, p, worldId, e.seq);
    }
  }

  upsertIdea(idea: Idea): void {
    const search = [idea.title, idea.description, idea.problem, idea.solution, idea.audience, idea.userNotes, idea.reason].join(' ').toLowerCase();
    this.db
      .prepare(
        `INSERT INTO ideas (id, world_id, title, status, favorite, user_rating, game_time, created_at, updated_at, search_text, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, status = excluded.status, favorite = excluded.favorite,
           user_rating = excluded.user_rating, updated_at = excluded.updated_at, search_text = excluded.search_text, data = excluded.data`,
      )
      .run(idea.id, idea.worldId, idea.title, idea.status, idea.favorite ? 1 : 0, idea.userRating, idea.gameTime, idea.createdAt, idea.updatedAt, search, JSON.stringify(idea));
  }

  /** Удаляет идеи по решению пользователя. Возвращает число удалённых. */
  deleteIdeas(ids: string[]): number {
    let n = 0;
    this.tx(() => {
      const del = this.db.prepare('DELETE FROM ideas WHERE id = ?');
      for (const id of ids) n += Number(del.run(id).changes);
    });
    return n;
  }

  getIdea(id: string): Idea | null {
    const r = this.db.prepare('SELECT data FROM ideas WHERE id = ?').get(id) as { data: string } | undefined;
    return r ? (JSON.parse(r.data) as Idea) : null;
  }

  listIdeas(filter: { q?: string; status?: string } = {}): Idea[] {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (filter.q) {
      where.push('search_text LIKE ?');
      args.push(`%${filter.q.toLowerCase()}%`);
    }
    if (filter.status) {
      where.push('status = ?');
      args.push(filter.status);
    }
    const sql = `SELECT data FROM ideas ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC, id DESC`;
    return (this.db.prepare(sql).all(...args) as { data: string }[]).map((r) => JSON.parse(r.data) as Idea);
  }

  listEvents(opts: { worldId: string; characterId?: string; beforeSeq?: number; limit?: number }): WorldEvent[] {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 1000);
    const before = opts.beforeSeq ?? Number.MAX_SAFE_INTEGER;
    const rows = opts.characterId
      ? (this.db
          .prepare(
            `SELECT e.data FROM event_participants p JOIN events e ON e.id = p.event_id
             WHERE p.world_id = ? AND p.character_id = ? AND p.seq < ? ORDER BY p.seq DESC LIMIT ?`,
          )
          .all(opts.worldId, opts.characterId, before, limit) as { data: string }[])
      : (this.db.prepare('SELECT data FROM events WHERE world_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?').all(opts.worldId, before, limit) as {
          data: string;
        }[]);
    return rows.map((r) => JSON.parse(r.data) as WorldEvent);
  }

  countEvents(worldId: string): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM events WHERE world_id = ?').get(worldId) as { n: number }).n;
  }

  /** Сброс мира: удаляет снимок и события, архив идей сохраняется. */
  resetWorld(): void {
    const cur = this.loadWorld();
    this.tx(() => {
      this.db.prepare("DELETE FROM world WHERE slot = 'current'").run();
      if (cur) {
        this.db.prepare('DELETE FROM events WHERE world_id = ?').run(cur.worldId);
        this.db.prepare('DELETE FROM event_participants WHERE world_id = ?').run(cur.worldId);
      }
    });
  }

  exportSave(): SaveFile | null {
    const cur = this.loadWorld();
    if (!cur) return null;
    const events = (this.db.prepare('SELECT data FROM events WHERE world_id = ? ORDER BY seq').all(cur.worldId) as { data: string }[]).map(
      (r) => JSON.parse(r.data) as WorldEvent,
    );
    return {
      format: 'parallel-life-save',
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      snapshot: JSON.parse(cur.snapshot),
      events,
      ideas: this.listIdeas(),
    };
  }

  importSave(file: SaveFile): void {
    if (file?.format !== 'parallel-life-save') throw new Error('Это не файл сохранения «Параллельной жизни»');
    const snapshot = JSON.stringify(file.snapshot);
    const worldId = (file.snapshot as { worldId?: string })?.worldId;
    if (!worldId) throw new Error('В сохранении нет мира');
    this.resetWorld();
    this.db.prepare('DELETE FROM events WHERE world_id = ?').run(worldId);
    this.db.prepare('DELETE FROM event_participants WHERE world_id = ?').run(worldId);
    this.saveWorld(snapshot, file.events ?? [], file.ideas ?? []);
  }

  getMeta(key: string): string | null {
    const r = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
    return r?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  }

  close(): void {
    this.db.close();
  }
}
