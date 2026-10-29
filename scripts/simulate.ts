// Консольный прогон симуляции без интерфейса: npm run simulate -- [дни] [seed]
import { createWorld, bootstrap, runTicks, totalMoney, formatGameTime, EVENT_TYPES } from '../src/sim/index.ts';

const days = Number(process.argv[2] ?? 14);
const seed = Number(process.argv[3] ?? 20260907);
const world = createWorld({ seed, worldId: 'cli' });
bootstrap(world);
const startMoney = totalMoney(world);
let done = 0;
const t0 = Date.now();
while (done < days * 24) done += runTicks(world, Math.min(24 * 7, days * 24 - done));
const ms = Date.now() - t0;

const counts: Record<string, number> = {};
for (const e of world.events) counts[e.type] = (counts[e.type] ?? 0) + 1;
console.log(`Мир ${seed}: ${days} дн. за ${ms} мс → ${formatGameTime(world.startDate, world.time)}`);
console.log(`Событий всего: ${world.stats.eventsTotal}; последние по типам:`, counts);
console.log(`Идей: ${Object.keys(world.ideas).length}; проектов: ${Object.keys(world.projects).length}; ошибок генерации: ${world.counters.ideaErrors ?? 0}`);
const drift = totalMoney(world) - startMoney - (world.stats.externalIn - world.stats.externalOut);
console.log(`Баланс денег (должен быть 0): ${drift}`);
for (const e of world.events.filter((x) => x.importance >= 0.5).slice(-25)) {
  console.log(`  [${formatGameTime(world.startDate, e.time)}] ${EVENT_TYPES[e.type].icon} ${e.summary}`);
}
for (const i of Object.values(world.ideas)) console.log(`  💡 ${i.title} (${i.avatarScore}/10) — ${i.reason}`);
const av = world.characters.player_avatar;
console.log(`Даня: ${av.activity.label}, деньги ${Math.round(av.money)}, настроение ${Math.round(av.mood)}, решений ${av.decisions.length}`);
