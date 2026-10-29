import { createWorld, bootstrap, runTicks, type World } from '../src/sim/index.ts';

export function freshWorld(seed = 42): World {
  const w = createWorld({ seed, worldId: `test_${seed}` });
  bootstrap(w);
  return w;
}

export function simulateDays(w: World, days: number): World {
  for (let d = 0; d < days; d++) runTicks(w, 24);
  return w;
}
