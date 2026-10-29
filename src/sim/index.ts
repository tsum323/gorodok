// Публичный API движка симуляции (без зависимостей от React и браузера).
export * from './types';
export { createWorld, AVATAR_ID, DEFAULT_AVATAR, type AvatarConfig, type NewWorldOptions } from './seed';
export { tick, runTicks, bootstrap, MAX_TICKS_PER_CALL } from './engine';
export { migrateWorld, serializeWorld, CURRENT_WORLD_VERSION } from './migrate';
export { EVENT_TYPES, eventsAfter } from './events';
export { totalMoney, monthlyExpenses, runwayMonths } from './economy';
export { relationsOf, getRelation, relationLabel, skillName } from './social';
export { RANK_LABEL } from './career';
export { LOCATIONS, SCENES, getLocation, sceneOf } from './locations';
export { formatGameTime, formatShort, hourOf, dayOf, isNight } from './time';
export { tryGenerateIdea, RuleBasedIdeaGenerator, type IdeaGenerator } from './ideas/generator';
export { money } from './util';
