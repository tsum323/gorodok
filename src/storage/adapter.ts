import type { Idea, WorldEvent } from '../sim/types';
import type { SaveFile } from './saveFile';

// Хранилище с двумя реализациями:
//  - SqliteServerStorage — основная: локальный Node-сервер с SQLite (npm run dev / npm start);
//  - BrowserStorage — запасная, если интерфейс открыт без сервера (localStorage, с ограничениями).

export interface AiInfo {
  active: boolean;
  mode: string;
  keyConfigured: boolean;
  note: string;
}

export interface StorageAdapter {
  readonly kind: 'sqlite' | 'browser';
  readonly label: string;
  ai: AiInfo | null;
  loadWorld(): Promise<unknown | null>;
  saveWorld(snapshot: string, events: WorldEvent[], ideas: Idea[]): Promise<void>;
  loadIdeas(): Promise<Idea[]>;
  saveIdea(idea: Idea): Promise<void>;
  deleteIdeas(ids: string[]): Promise<void>;
  loadEvents(worldId: string, opts?: { characterId?: string; beforeSeq?: number; limit?: number }): Promise<WorldEvent[]>;
  resetWorld(): Promise<void>;
  exportSave(): Promise<SaveFile | null>;
  importSave(file: SaveFile): Promise<void>;
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  if (!r.ok) {
    let msg = `${r.status}`;
    try {
      msg = ((await r.json()) as { error?: string }).error ?? msg;
    } catch {
      /* пусто */
    }
    throw new Error(msg);
  }
  return (await r.json()) as T;
}

export class SqliteServerStorage implements StorageAdapter {
  readonly kind = 'sqlite' as const;
  readonly label = 'SQLite (локальный сервер)';
  ai: AiInfo | null = null;

  async loadWorld(): Promise<unknown | null> {
    const r = await fetch('/api/world');
    if (!r.ok) throw new Error(`Не удалось загрузить мир: ${r.status}`);
    return ((await r.json()) as { snapshot: unknown }).snapshot ?? null;
  }
  async saveWorld(snapshot: string, events: WorldEvent[], ideas: Idea[]): Promise<void> {
    await req('/api/world', { method: 'PUT', body: JSON.stringify({ snapshot, events, ideas }) });
  }
  async loadIdeas(): Promise<Idea[]> {
    return (await req<{ ideas: Idea[] }>('/api/ideas')).ideas;
  }
  async saveIdea(idea: Idea): Promise<void> {
    await req(`/api/ideas/${encodeURIComponent(idea.id)}`, { method: 'PUT', body: JSON.stringify(idea) });
  }
  async deleteIdeas(ids: string[]): Promise<void> {
    await req('/api/ideas/delete', { method: 'POST', body: JSON.stringify({ ids }) });
  }
  async loadEvents(worldId: string, opts: { characterId?: string; beforeSeq?: number; limit?: number } = {}): Promise<WorldEvent[]> {
    const q = new URLSearchParams({ worldId, limit: String(opts.limit ?? 200) });
    if (opts.characterId) q.set('characterId', opts.characterId);
    if (opts.beforeSeq) q.set('beforeSeq', String(opts.beforeSeq));
    return (await req<{ events: WorldEvent[] }>(`/api/events?${q}`)).events;
  }
  async resetWorld(): Promise<void> {
    await req('/api/world', { method: 'DELETE' });
  }
  async exportSave(): Promise<SaveFile | null> {
    const r = await fetch('/api/export');
    if (r.status === 404) return null;
    return (await r.json()) as SaveFile;
  }
  async importSave(file: SaveFile): Promise<void> {
    await req('/api/import', { method: 'POST', body: JSON.stringify(file) });
  }
}

const K_WORLD = 'parallel-life:world';
const K_IDEAS = 'parallel-life:ideas';
const K_EVENTS = 'parallel-life:events';
/** В браузерном режиме полная история ограничена, чтобы не переполнить localStorage. */
export const BROWSER_EVENTS_CAP = 3000;

/** Запись в localStorage; в приватном режиме или при запрете хранилища — без падения. */
function writeKey(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* хранилище недоступно — мир живёт до закрытия вкладки */
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export class BrowserStorage implements StorageAdapter {
  readonly kind = 'browser' as const;
  readonly label = 'Браузер (localStorage) — сервер не найден';
  ai: AiInfo | null = null;

  async loadWorld(): Promise<unknown | null> {
    return readJson<unknown | null>(K_WORLD, null);
  }
  async saveWorld(snapshot: string, events: WorldEvent[], ideas: Idea[]): Promise<void> {
    writeKey(K_WORLD, snapshot);
    if (events.length) {
      const all = readJson<WorldEvent[]>(K_EVENTS, []);
      const known = new Set(all.map((e) => e.id));
      for (const e of events) if (!known.has(e.id)) all.push(e);
      writeKey(K_EVENTS, JSON.stringify(all.slice(-BROWSER_EVENTS_CAP)));
    }
    for (const i of ideas) await this.saveIdea(i);
  }
  async loadIdeas(): Promise<Idea[]> {
    return readJson<Idea[]>(K_IDEAS, []);
  }
  async saveIdea(idea: Idea): Promise<void> {
    const all = readJson<Idea[]>(K_IDEAS, []);
    const i = all.findIndex((x) => x.id === idea.id);
    if (i >= 0) all[i] = idea;
    else all.push(idea);
    writeKey(K_IDEAS, JSON.stringify(all));
  }
  async deleteIdeas(ids: string[]): Promise<void> {
    const drop = new Set(ids);
    writeKey(K_IDEAS, JSON.stringify(readJson<Idea[]>(K_IDEAS, []).filter((i) => !drop.has(i.id))));
  }
  async loadEvents(_worldId: string, opts: { characterId?: string; beforeSeq?: number; limit?: number } = {}): Promise<WorldEvent[]> {
    let all = readJson<WorldEvent[]>(K_EVENTS, []);
    if (opts.characterId) all = all.filter((e) => e.participants.includes(opts.characterId!));
    if (opts.beforeSeq) all = all.filter((e) => e.seq < opts.beforeSeq!);
    return all.reverse().slice(0, opts.limit ?? 200);
  }
  async resetWorld(): Promise<void> {
    try {
      localStorage.removeItem(K_WORLD);
      localStorage.removeItem(K_EVENTS);
    } catch {
      /* недоступно */
    }
  }
  async exportSave(): Promise<SaveFile | null> {
    const snapshot = await this.loadWorld();
    if (!snapshot) return null;
    return { format: 'parallel-life-save', formatVersion: 1, exportedAt: new Date().toISOString(), snapshot, events: readJson(K_EVENTS, []), ideas: await this.loadIdeas() };
  }
  async importSave(file: SaveFile): Promise<void> {
    await this.resetWorld();
    writeKey(K_WORLD, JSON.stringify(file.snapshot));
    writeKey(K_EVENTS, JSON.stringify((file.events ?? []).slice(-BROWSER_EVENTS_CAP)));
    for (const i of file.ideas ?? []) await this.saveIdea(i);
  }
}

/** Выбирает SQLite-сервер, если он отвечает, иначе — хранилище браузера. */
export async function detectStorage(): Promise<StorageAdapter> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const r = await fetch('/api/health', { signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok) {
      const h = (await r.json()) as { storage?: string; ai?: AiInfo };
      if (h.storage === 'sqlite') {
        const s = new SqliteServerStorage();
        s.ai = h.ai ?? null;
        return s;
      }
    }
  } catch {
    /* сервера нет — работаем в браузере */
  }
  return new BrowserStorage();
}
