import { useState } from 'react';
import { useGame } from '../app/useGame';
import { EVENT_TYPES } from '../sim/events';
import { formatShort } from '../sim/time';
import type { WorldEvent } from '../sim/types';

type FeedFilter = 'important' | 'all' | 'avatar' | 'career' | 'social' | 'ideas';

const FILTERS: [FeedFilter, string][] = [
  ['important', 'Главное'],
  ['avatar', 'Даня'],
  ['social', 'Люди'],
  ['career', 'Работа и деньги'],
  ['ideas', 'Идеи и проекты'],
  ['all', 'Всё'],
];

const CAREER = new Set(['hired', 'fired', 'quit', 'promoted', 'warning', 'job_search', 'financial', 'business']);
const SOCIAL = new Set(['met', 'conversation', 'friendship', 'conflict', 'help', 'collaboration', 'agreement_broken']);
const IDEAS = new Set(['idea', 'project_started', 'project_joined', 'project_launched', 'project_failed', 'project_abandoned', 'project_milestone', 'collaboration']);

export function matchesFilter(e: WorldEvent, f: FeedFilter): boolean {
  switch (f) {
    case 'important':
      return e.importance >= 0.4 && EVENT_TYPES[e.type].feed;
    case 'avatar':
      return e.participants.includes('player_avatar') && e.importance >= 0.2;
    case 'career':
      return CAREER.has(e.type);
    case 'social':
      return SOCIAL.has(e.type) && e.importance >= 0.25;
    case 'ideas':
      return IDEAS.has(e.type);
    default:
      return true;
  }
}

export function EventFeed({ onOpen, onSelect }: { onOpen: (e: WorldEvent) => void; onSelect: (id: string) => void }) {
  const { game } = useGame();
  const [filter, setFilter] = useState<FeedFilter>('important');
  const w = game.world;
  const avatarName = w.characters.player_avatar.name.split(' ')[0];
  const list: WorldEvent[] = [];
  for (let i = w.events.length - 1; i >= 0 && list.length < 150; i--) if (matchesFilter(w.events[i], filter)) list.push(w.events[i]);

  return (
    <section className="panel feed" aria-label="Лента событий">
      <div className="panel-head">
        <h2>Лента событий</h2>
      </div>
      <div className="chips">
        {FILTERS.map(([id, label]) => (
          <button key={id} className={`chip${filter === id ? ' active' : ''}`} onClick={() => setFilter(id)}>
            {id === 'avatar' ? avatarName : label}
          </button>
        ))}
      </div>
      <ol className="feed-list">
        {list.length === 0 && <li className="muted pad">Пока тихо. Запустите время, чтобы мир ожил.</li>}
        {list.map((e) => {
          const info = EVENT_TYPES[e.type];
          return (
            <li key={e.id} className={`feed-item tone-${info.tone}${e.participants.includes('player_avatar') ? ' with-avatar' : ''}`}>
              <button className="feed-main" onClick={() => onOpen(e)}>
                <span className="feed-icon" aria-hidden="true">{info.icon}</span>
                <span className="feed-text">
                  <span className="feed-time">{formatShort(w.startDate, e.time)} · {info.label}</span>
                  <span className="feed-summary">{e.summary}</span>
                </span>
              </button>
              {e.participants.length > 0 && (
                <span className="feed-people">
                  {e.participants.slice(0, 3).map((pid) => {
                    const c = w.characters[pid];
                    return c ? (
                      <button key={pid} className="person-link" onClick={() => onSelect(pid)}>
                        {c.name.split(' ')[0]}
                      </button>
                    ) : null;
                  })}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
