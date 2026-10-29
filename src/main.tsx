import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { GameController } from './app/controller';
import { GameContext } from './app/useGame';
import { detectStorage } from './storage/adapter';
import './styles.css';

async function boot(): Promise<void> {
  const root = createRoot(document.getElementById('root')!);
  try {
    const storage = await detectStorage();
    const game = new GameController(storage);
    await game.init();
    // Для отладки в консоли браузера: window.game
    (window as unknown as { game: GameController }).game = game;
    root.render(
      <StrictMode>
        <GameContext.Provider value={game}>
          <App />
        </GameContext.Provider>
      </StrictMode>,
    );
  } catch (e) {
    root.render(<div className="boot error">Не удалось запустить мир: {e instanceof Error ? e.message : String(e)}</div>);
  }
}

void boot();
