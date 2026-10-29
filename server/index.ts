import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { Store, type SaveFile } from './db.ts';
import type { Idea, WorldEvent } from '../src/sim/types.ts';
import { aiStatus } from './ai.ts';

// Локальный сервер «Параллельной жизни».
//  - REST API для сохранения мира, событий и архива идей в SQLite;
//  - в режиме --dev подключает Vite (горячая перезагрузка интерфейса);
//  - без --dev раздаёт собранный интерфейс из dist/.

const DEV = process.argv.includes('--dev');
const PORT = Number(process.env.PORT ?? 5173);
const HOST = process.env.HOST ?? '127.0.0.1';
const ROOT = resolve(import.meta.dirname, '..');
const DB_PATH = resolve(ROOT, process.env.PL_DB_PATH ?? 'data/parallel-life.db');

const store = new Store(DB_PATH);

// По умолчанию каждый запуск сервера начинает мир с нуля (архив идей сохраняется).
// Продолжить прошлый мир: флаг --continue или PL_CONTINUE=1.
const CONTINUE = process.argv.includes('--continue') || process.env.PL_CONTINUE === '1';
/** Миры, сброшенные при запуске: открытая со старых времён вкладка не должна их «воскресить». */
const retiredWorldIds = new Set<string>();
if (!CONTINUE) {
  const prev = store.loadWorld();
  if (prev) {
    retiredWorldIds.add(prev.worldId);
    store.resetWorld();
  }
}

async function readBody(req: IncomingMessage, limit = 50 * 1024 * 1024): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, 'Слишком большой запрос');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const path = url.pathname;
  const method = req.method ?? 'GET';

  if (path === '/api/health' && method === 'GET') {
    return json(res, 200, { ok: true, storage: 'sqlite', dbPath: DB_PATH, schemaVersion: store.schemaVersion(), ai: aiStatus() });
  }
  if (path === '/api/world' && method === 'GET') {
    const w = store.loadWorld();
    if (!w) return json(res, 200, { worldId: null, snapshot: null });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(`{"worldId":${JSON.stringify(w.worldId)},"updatedAt":${JSON.stringify(w.updatedAt)},"snapshot":${w.snapshot}}`);
    return;
  }
  if (path === '/api/world' && method === 'PUT') {
    const body = JSON.parse(await readBody(req)) as { snapshot: string; events?: WorldEvent[]; ideas?: Idea[] };
    if (typeof body.snapshot !== 'string') throw new HttpError(400, 'Нет снимка мира');
    const worldId = (JSON.parse(body.snapshot) as { worldId?: string }).worldId;
    if (worldId && retiredWorldIds.has(worldId)) {
      throw new HttpError(409, 'Сервер перезапущен, и мир начат заново — обновите страницу');
    }
    store.saveWorld(body.snapshot, body.events ?? [], body.ideas ?? []);
    return json(res, 200, { ok: true });
  }
  if (path === '/api/world' && method === 'DELETE') {
    store.resetWorld();
    return json(res, 200, { ok: true });
  }
  if (path === '/api/events' && method === 'GET') {
    const worldId = url.searchParams.get('worldId');
    if (!worldId) throw new HttpError(400, 'Нужен worldId');
    const before = url.searchParams.get('beforeSeq');
    return json(res, 200, {
      events: store.listEvents({
        worldId,
        characterId: url.searchParams.get('characterId') ?? undefined,
        beforeSeq: before ? Number(before) : undefined,
        limit: Number(url.searchParams.get('limit') ?? 100),
      }),
      total: store.countEvents(worldId),
    });
  }
  if (path === '/api/ideas' && method === 'GET') {
    return json(res, 200, { ideas: store.listIdeas({ q: url.searchParams.get('q') ?? undefined, status: url.searchParams.get('status') ?? undefined }) });
  }
  const ideaMatch = path.match(/^\/api\/ideas\/([^/]+)$/);
  if (ideaMatch && method === 'PUT') {
    const idea = JSON.parse(await readBody(req)) as Idea;
    if (idea.id !== decodeURIComponent(ideaMatch[1])) throw new HttpError(400, 'ID идеи не совпадает');
    store.upsertIdea(idea);
    return json(res, 200, { ok: true });
  }
  if (path === '/api/export' && method === 'GET') {
    const save = store.exportSave();
    if (!save) return json(res, 404, { error: 'Нечего экспортировать' });
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="parallel-life-${new Date().toISOString().slice(0, 10)}.json"`,
    });
    res.end(JSON.stringify(save));
    return;
  }
  if (path === '/api/import' && method === 'POST') {
    const file = JSON.parse(await readBody(req)) as SaveFile;
    const importedId = (file?.snapshot as { worldId?: string } | undefined)?.worldId;
    if (importedId) retiredWorldIds.delete(importedId);
    store.importSave(file);
    return json(res, 200, { ok: true });
  }
  throw new HttpError(404, 'Неизвестный адрес API');
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function serveStatic(res: ServerResponse, url: URL): Promise<void> {
  const dist = join(ROOT, 'dist');
  let file = resolve(dist, '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(dist)) throw new HttpError(403, 'Запрещено');
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(dist, 'index.html');
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    throw new HttpError(404, 'Интерфейс не собран: выполните npm run build или используйте npm run dev');
  }
}

async function main(): Promise<void> {
  let vite: import('vite').ViteDevServer | undefined;
  if (DEV) {
    const { createServer: createVite } = await import('vite');
    vite = await createVite({ root: ROOT, server: { middlewareMode: true }, appType: 'spa' });
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (vite) return vite.middlewares(req, res);
      return await serveStatic(res, url);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : e instanceof SyntaxError ? 400 : 500;
      if (status === 500) console.error(e);
      if (!res.headersSent) json(res, status, { error: e instanceof Error ? e.message : String(e) });
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`\n  «Параллельная жизнь» запущена: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(`  Режим: ${DEV ? 'разработка (Vite)' : 'production (dist/)'}; база: ${DB_PATH}`);
    console.log(`  Мир: ${CONTINUE ? 'продолжается с прошлого запуска' : 'начат с нуля (архив идей сохранён); продолжить прошлый — флаг --continue'}\n`);
  });

  const shutdown = () => {
    server.close();
    void vite?.close();
    store.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main();
