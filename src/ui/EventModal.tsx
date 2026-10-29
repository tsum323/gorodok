import { useGame } from '../app/useGame';
import { EVENT_TYPES } from '../sim/events';
import { getLocation } from '../sim/locations';
import { formatGameTime } from '../sim/time';
import type { WorldEvent } from '../sim/types';
import { Modal } from './common';
import { Portrait } from './Sprite';

export function EventModal({ event, onClose, onSelect, onArchive }: { event: WorldEvent; onClose: () => void; onSelect: (id: string) => void; onArchive: (ideaId?: string) => void }) {
  const { game } = useGame();
  const w = game.world;
  const info = EVENT_TYPES[event.type];
  const ideaId = event.relatedIds.find((id) => w.ideas[id] || game.pastIdeas.some((i) => i.id === id));
  const projectIds = event.relatedIds.filter((id) => w.projects[id]);
  return (
    <Modal
      title={
        <>
          {info.icon} {info.label}
        </>
      }
      onClose={onClose}
    >
      <p className="event-summary">{event.summary}</p>
      <dl className="kv">
        <dt>Когда</dt>
        <dd>{formatGameTime(w.startDate, event.time)}</dd>
        {event.locationId && (
          <>
            <dt>Где</dt>
            <dd>{getLocation(event.locationId).name}</dd>
          </>
        )}
        <dt>Причина</dt>
        <dd>{event.cause}</dd>
        {event.context && (
          <>
            <dt>Контекст</dt>
            <dd>{event.context}</dd>
          </>
        )}
        {event.changes.length > 0 && (
          <>
            <dt>Изменения</dt>
            <dd>
              <ul className="plain">
                {event.changes.map((c, i) => (
                  <li key={i}>• {c}</li>
                ))}
              </ul>
            </dd>
          </>
        )}
        {projectIds.length > 0 && (
          <>
            <dt>Проект</dt>
            <dd>{projectIds.map((id) => w.projects[id].name).join(', ')}</dd>
          </>
        )}
        <dt>ID</dt>
        <dd className="muted small">
          {event.id} · важность {Math.round(event.importance * 100)}%
        </dd>
      </dl>
      {event.dialogue && event.dialogue.length > 0 && (
        <div className="dialogue">
          {event.dialogue.map((l, i) => {
            const c = w.characters[l.speakerId];
            return (
              <div key={i} className={`line ${i % 2 ? 'right' : 'left'}`}>
                {c && <Portrait appearance={c.appearance} size={28} />}
                <span className="say">
                  <b>{c?.name.split(' ')[0]}:</b> {l.text}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {event.participants.length > 0 && (
        <div className="participants">
          <h4>Участники</h4>
          {event.participants.map((pid) => {
            const c = w.characters[pid];
            if (!c) return null;
            return (
              <button key={pid} className="participant" onClick={() => onSelect(pid)}>
                <Portrait appearance={c.appearance} size={32} />
                <span>
                  {c.name}
                  <span className="muted small"> — {c.profession}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {ideaId && (
        <button className="btn" onClick={() => onArchive(ideaId)}>
          💡 Открыть идею в архиве
        </button>
      )}
    </Modal>
  );
}
