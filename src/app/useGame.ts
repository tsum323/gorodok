import { createContext, useContext, useSyncExternalStore } from 'react';
import type { GameController } from './controller';

export const GameContext = createContext<GameController | null>(null);

/** Возвращает контроллер и номер версии состояния (для перерисовки при изменениях мира). */
export function useGame(): { game: GameController; version: number } {
  const game = useContext(GameContext);
  if (!game) throw new Error('GameContext не задан');
  const version = useSyncExternalStore(game.subscribe, game.getVersion);
  return { game, version };
}
