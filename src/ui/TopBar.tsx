import { useGame } from '../app/useGame';
import { SPEED_LABELS, type Speed } from '../app/controller';
import { formatGameTime, hourOf } from '../sim/time';
import { money } from '../sim/util';

const SPEEDS: Speed[] = ['pause', 'normal', 'fast', 'faster', 'max'];
const SPEED_ICONS: Record<Speed, string> = { pause: '⏸', normal: '▶', fast: '⏩', faster: '⏩⏩', max: '⚡' };

export function TopBar({ onArchive, onSettings, onAvatar }: { onArchive: () => void; onSettings: () => void; onAvatar: () => void }) {
  const { game } = useGame();
  const w = game.world;
  const hour = hourOf(w.time);
  const ideas = Object.keys(w.ideas).length + game.pastIdeas.length;
  const newIdeas = game.allIdeas().filter((i) => i.status === 'new').length;
  const av = w.characters.player_avatar;
  const employed = w.order.filter((id) => w.characters[id].job).length;
  const projects = Object.values(w.projects).filter((p) => p.status === 'active' || p.status === 'launched').length;

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">◧</span>
        <span className="brand-name">Параллельная жизнь</span>
      </div>

      <div className="clock" title="Игровое время">
        <span className={`sun ${hour >= 6 && hour < 21 ? 'day' : 'night'}`} aria-hidden="true">
          {hour >= 6 && hour < 21 ? '☀' : '☾'}
        </span>
        <span className="clock-text">{formatGameTime(w.startDate, w.time)}</span>
      </div>

      <div className="time-controls" role="group" aria-label="Управление временем">
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={`tc-btn${game.speed === s ? ' active' : ''}`}
            onClick={() => game.setSpeed(s)}
            title={SPEED_LABELS[s]}
            aria-pressed={game.speed === s}
          >
            <span aria-hidden="true">{SPEED_ICONS[s]}</span>
            <span className="tc-label">{SPEED_LABELS[s]}</span>
          </button>
        ))}
        <button className="tc-btn" onClick={() => game.step()} title="Один шаг (1 игровой час)" disabled={game.speed !== 'pause'}>
          <span aria-hidden="true">+1ч</span>
        </button>
      </div>

      <div className="stats">
        <span title="Работают / всего">👥 {employed}/{w.order.length}</span>
        <span title="Активные проекты">🚀 {projects}</span>
        <span title="Событий за всё время">📰 {w.stats.eventsTotal}</span>
      </div>

      <button className="avatar-chip" onClick={onAvatar} title="Профиль главного персонажа">
        <span className="dot" /> {av.name}: {money(av.money)}
      </button>
      <button className="archive-btn" onClick={onArchive} title="Архив идей">
        💡 Архив <b>{ideas}</b>
        {newIdeas > 0 && <span className="badge">{newIdeas}</span>}
      </button>
      <button className="icon-btn" onClick={onSettings} title="Настройки" aria-label="Настройки">
        ⚙
      </button>
      <span className={`save-dot${game.saving ? ' saving' : ''}${game.error ? ' err' : ''}`} title={game.error ?? (game.lastSavedAt ? `Сохранено ${new Date(game.lastSavedAt).toLocaleTimeString('ru-RU')} · ${game.storage.label}` : game.storage.label)} />
    </header>
  );
}
