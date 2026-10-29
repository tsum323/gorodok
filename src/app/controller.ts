import type { Idea, World, WorldEvent } from '../sim/types';
import { createWorld, type NewWorldOptions, AVATAR_ID } from '../sim/seed';
import { bootstrap, tick } from '../sim/engine';
import { migrateWorld, serializeWorld } from '../sim/migrate';
import type { StorageAdapter } from '../storage/adapter';
import type { SaveFile } from '../storage/saveFile';

// Контроллер игры: держит мир, крутит время, сохраняет, отдаёт данные интерфейсу.
// Логика симуляции живёт в src/sim; React-компоненты только читают состояние
// и вызывают методы контроллера.

export type Speed = 'pause' | 'normal' | 'fast' | 'faster' | 'max';

/** Сколько игровых часов в секунду на каждой скорости. */
export const SPEED_TPS: Record<Speed, number> = { pause: 0, normal: 1, fast: 4, faster: 15, max: Infinity };
export const SPEED_LABELS: Record<Speed, string> = { pause: 'Пауза', normal: '×1', fast: '×4', faster: '×15', max: 'Макс' };

const FRAME_MS = 50;
/** Бюджет времени на шаги за один кадр в режиме «Макс» — интерфейс остаётся отзывчивым. */
const MAX_FRAME_BUDGET_MS = 28;
const MAX_TICKS_PER_FRAME = 30;
const AUTOSAVE_REAL_MS = 10_000;

export interface ControllerState {
  version: number;
  speed: Speed;
  saving: boolean;
  lastSavedAt: number | null;
  error: string | null;
}

export class GameController {
  world!: World;
  /** Идеи из прошлых миров (архив не очищается при сбросе мира). */
  pastIdeas: Idea[] = [];
  speed: Speed = 'pause';
  saving = false;
  lastSavedAt: number | null = null;
  error: string | null = null;

  private version = 0;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private acc = 0;
  private lastFrame = 0;
  private savedSeq = 0;
  private outbox: WorldEvent[] = [];
  private collectedSeq = 0;
  private dirtyIdeas = new Set<string>();
  private knownIdeaCount = 0;
  private lastSaveTime = 0;
  private lastSaveReal = 0;
  private notifyQueued = false;
  private saveChain: Promise<void> = Promise.resolve();

  constructor(readonly storage: StorageAdapter) {}

  async init(): Promise<void> {
    const raw = await this.storage.loadWorld().catch((e) => {
      this.error = `Не удалось загрузить сохранение: ${e instanceof Error ? e.message : e}`;
      return null;
    });
    const ideas = await this.storage.loadIdeas().catch(() => [] as Idea[]);
    if (raw) {
      try {
        this.world = migrateWorld(raw);
      } catch (e) {
        this.error = `Сохранение повреждено или несовместимо (${e instanceof Error ? e.message : e}). Создан новый мир.`;
        this.world = createWorld({ seed: Date.now() % 1_000_000 });
        bootstrap(this.world);
      }
    } else {
      this.world = createWorld({ seed: Date.now() % 1_000_000 });
      bootstrap(this.world);
    }
    this.attachIdeas(ideas);
    // Для нового мира события стартового планирования ещё не сохранены — соберём их.
    this.savedSeq = raw ? (this.world.counters.ev ?? 0) : 0;
    this.collectedSeq = this.savedSeq;
    this.collect();
    this.lastSaveTime = this.world.time;
    if (!raw) await this.save();
    this.start();
  }

  private attachIdeas(all: Idea[]): void {
    this.world.ideas = {};
    this.pastIdeas = [];
    for (const i of all) {
      if (i.worldId === this.world.worldId) this.world.ideas[i.id] = i;
      else this.pastIdeas.push(i);
    }
    this.knownIdeaCount = Object.keys(this.world.ideas).length;
  }

  // --- подписка для React (useSyncExternalStore) ---------------------------------

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  private notify(): void {
    this.version++;
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    // Перерисовка не чаще кадра: при максимальной скорости React не захлёбывается.
    const flush = () => {
      this.notifyQueued = false;
      for (const l of this.listeners) l();
    };
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(flush);
    else setTimeout(flush, 16);
  }

  // --- время -------------------------------------------------------------------

  private start(): void {
    if (this.timer) return;
    this.lastFrame = performance.now();
    this.timer = setInterval(() => this.frame(), FRAME_MS);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') void this.save();
      });
      window.addEventListener('beforeunload', () => void this.save());
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(now - this.lastFrame, 1000);
    this.lastFrame = now;
    if (this.speed === 'pause') return;
    let steps = 0;
    if (this.speed === 'max') {
      const t0 = performance.now();
      while (steps < MAX_TICKS_PER_FRAME && performance.now() - t0 < MAX_FRAME_BUDGET_MS) {
        this.stepOnce();
        steps++;
      }
    } else {
      this.acc += (dt / 1000) * SPEED_TPS[this.speed];
      // Не «догоняем» больше 10 шагов за кадр (например, после сна вкладки).
      this.acc = Math.min(this.acc, 10);
      while (this.acc >= 1) {
        this.acc -= 1;
        this.stepOnce();
        steps++;
      }
    }
    if (steps > 0) {
      this.notify();
      const gameHoursSinceSave = this.world.time - this.lastSaveTime;
      if (gameHoursSinceSave >= this.world.settings.autosaveEveryHours * (this.speed === 'max' ? 8 : 1) || now - this.lastSaveReal > AUTOSAVE_REAL_MS) {
        void this.save();
      }
    }
  }

  private stepOnce(): void {
    try {
      tick(this.world);
    } catch (e) {
      // Ошибка в правилах не должна «убить» интерфейс: ставим паузу и показываем её.
      console.error(e);
      this.error = `Ошибка симуляции: ${e instanceof Error ? e.message : e}. Время поставлено на паузу.`;
      this.speed = 'pause';
      return;
    }
    this.collect();
  }

  /** Собирает новые события после шага (лента в мире ограничена, а в хранилище — нет). */
  private collect(): void {
    const evs = this.world.events;
    for (let i = evs.length - 1; i >= 0 && evs[i].seq > this.collectedSeq; i--) this.outbox.push(evs[i]);
    this.collectedSeq = this.world.counters.ev ?? this.collectedSeq;
    const n = Object.keys(this.world.ideas).length;
    if (n !== this.knownIdeaCount) {
      for (const id of Object.keys(this.world.ideas)) this.dirtyIdeas.add(id);
      this.knownIdeaCount = n;
    }
  }

  step(): void {
    this.stepOnce();
    this.notify();
  }

  setSpeed(s: Speed): void {
    this.speed = s;
    this.acc = 0;
    if (s === 'pause') void this.save();
    this.notify();
  }

  // --- сохранение ----------------------------------------------------------------

  save(): Promise<void> {
    // Сохранения выполняются строго по очереди.
    this.saveChain = this.saveChain.then(() => this.doSave()).catch(() => undefined);
    return this.saveChain;
  }

  private async doSave(): Promise<void> {
    if (!this.world) return;
    const events = this.outbox.slice().sort((a, b) => a.seq - b.seq);
    const ideas = [...this.dirtyIdeas].map((id) => this.world.ideas[id]).filter(Boolean);
    const snapshot = serializeWorld(this.world);
    this.saving = true;
    try {
      await this.storage.saveWorld(snapshot, events, ideas);
      this.outbox.splice(0, events.length);
      for (const i of ideas) this.dirtyIdeas.delete(i.id);
      this.savedSeq = events.length ? events[events.length - 1].seq : this.savedSeq;
      this.lastSaveTime = this.world.time;
      this.lastSaveReal = performance.now();
      this.lastSavedAt = Date.now();
      if (this.error?.startsWith('Не удалось сохранить')) this.error = null;
    } catch (e) {
      this.error = `Не удалось сохранить: ${e instanceof Error ? e.message : e}`;
      this.lastSaveReal = performance.now();
    } finally {
      this.saving = false;
      this.notify();
    }
  }

  // --- архив идей ----------------------------------------------------------------

  allIdeas(): Idea[] {
    return [...Object.values(this.world.ideas), ...this.pastIdeas];
  }

  async updateIdea(id: string, patch: Partial<Pick<Idea, 'status' | 'userRating' | 'userNotes' | 'favorite'>>): Promise<void> {
    const idea = this.world.ideas[id] ?? this.pastIdeas.find((i) => i.id === id);
    if (!idea) return;
    Object.assign(idea, patch, { updatedAt: new Date().toISOString() });
    this.notify();
    try {
      await this.storage.saveIdea(idea);
    } catch (e) {
      this.error = `Не удалось сохранить идею: ${e instanceof Error ? e.message : e}`;
      this.notify();
    }
  }

  // --- настройки и мир -----------------------------------------------------------

  renameAvatar(name: string): void {
    const n = name.trim().slice(0, 40);
    if (!n) return;
    this.world.settings.avatarName = n;
    const av = this.world.characters[AVATAR_ID];
    if (av) av.name = n;
    this.notify();
    void this.save();
  }

  async newWorld(opts: NewWorldOptions): Promise<void> {
    const wasSpeed = this.speed;
    this.speed = 'pause';
    await this.save();
    await this.storage.resetWorld();
    const ideas = this.allIdeas();
    this.world = createWorld(opts);
    bootstrap(this.world);
    this.attachIdeas(ideas);
    this.outbox = [];
    this.dirtyIdeas.clear();
    this.savedSeq = 0;
    this.collectedSeq = 0;
    this.collect();
    this.error = null;
    await this.save();
    this.speed = wasSpeed;
    this.notify();
  }

  async exportSave(): Promise<SaveFile | null> {
    await this.save();
    return this.storage.exportSave();
  }

  async importSave(file: SaveFile): Promise<void> {
    const world = migrateWorld(structuredClone(file.snapshot));
    this.speed = 'pause';
    await this.storage.importSave(file);
    this.world = world;
    this.attachIdeas(await this.storage.loadIdeas());
    this.outbox = [];
    this.dirtyIdeas.clear();
    this.collectedSeq = this.world.counters.ev ?? 0;
    this.savedSeq = this.collectedSeq;
    this.error = null;
    this.notify();
  }

  loadCharacterHistory(characterId: string, beforeSeq?: number): Promise<WorldEvent[]> {
    return this.storage.loadEvents(this.world.worldId, { characterId, beforeSeq, limit: 100 });
  }
}
