import { useCallback, useEffect, useState } from 'react';
import { useGame } from './app/useGame';
import { TopBar } from './ui/TopBar';
import { Scene } from './ui/Scene';
import { EventFeed } from './ui/EventFeed';
import { PeopleList } from './ui/PeopleList';
import { Profile } from './ui/Profile';
import { Archive } from './ui/Archive';
import { EventModal } from './ui/EventModal';
import { Settings } from './ui/Settings';
import { Meter } from './ui/common';
import { Portrait } from './ui/Sprite';
import { sceneOf, getLocation } from './sim/locations';
import { money } from './sim/util';
import type { WorldEvent } from './sim/types';

type MobileTab = 'scene' | 'feed' | 'people';

export function App() {
  const { game, version } = useGame();
  const w = game.world;
  const [scene, setScene] = useState(() => sceneOf(w.characters.player_avatar.locationId));
  const [follow, setFollow] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [event, setEvent] = useState<WorldEvent | null>(null);
  const [archive, setArchive] = useState<{ id?: string } | null>(null);
  const [settings, setSettings] = useState(false);
  const [tab, setTab] = useState<MobileTab>('scene');

  const av = w.characters.player_avatar;
  const avScene = sceneOf(av.locationId);
  useEffect(() => {
    if (follow && avScene !== scene) setScene(avScene);
  }, [follow, avScene, scene]);

  const select = useCallback((id: string) => {
    setSelected(id);
    setEvent(null);
  }, []);
  const openArchive = useCallback((id?: string) => {
    setArchive({ id });
    setEvent(null);
  }, []);

  const latestIdea = Object.values(w.ideas).sort((a, b) => b.gameTime - a.gameTime)[0];

  return (
    <div className="app">
      <TopBar onArchive={() => openArchive()} onSettings={() => setSettings(true)} onAvatar={() => select('player_avatar')} />
      {game.error && (
        <div className="error-bar" role="alert">
          {game.error}
          <button className="link" onClick={() => { game.error = null; game.setSpeed(game.speed); }}>
            скрыть
          </button>
        </div>
      )}
      <main className={`layout tab-${tab}`}>
        <div className="col col-people">
          <PeopleList onSelect={select} selectedId={selected} />
        </div>
        <div className="col col-scene">
          <Scene
            world={w}
            version={version}
            scene={scene}
            onScene={(s) => {
              setScene(s);
              setFollow(s === avScene);
            }}
            onSelect={select}
            selectedId={selected}
          />
          <div className="avatar-card">
            <button className="avatar-card-main" onClick={() => select('player_avatar')}>
              <Portrait appearance={av.appearance} size={48} />
              <span>
                <b>{av.name}</b> <span className="muted small">— ваша виртуальная версия</span>
                <br />
                <span className="small">
                  {av.activity.arriveAt !== undefined ? '🚶 идёт: ' : `${av.activity.icon} `}
                  {av.activity.label} · {getLocation(av.activity.locationId).name}
                </span>
                {av.activity.why && <span className="small muted block">{av.activity.why}</span>}
              </span>
            </button>
            <div className="avatar-card-stats">
              <Meter label="Энергия" value={av.needs.energy} />
              <Meter label="Настроение" value={av.mood} />
              <span className="small">💰 {money(av.money)}{av.debt > 0 ? ` · долг ${money(av.debt)}` : ''}</span>
            </div>
            <div className="avatar-card-actions">
              <label className="small row">
                <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Камера следует за {av.name.split(' ')[0]}
              </label>
              {latestIdea && (
                <button className="link small" onClick={() => openArchive(latestIdea.id)}>
                  💡 Последняя идея: {latestIdea.title}
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="col col-feed">
          <EventFeed onOpen={setEvent} onSelect={select} />
        </div>
      </main>
      <nav className="mobile-tabs" aria-label="Разделы">
        {(
          [
            ['scene', '🏙', 'Сцена'],
            ['feed', '📰', 'Лента'],
            ['people', '👥', 'Люди'],
          ] as [MobileTab, string, string][]
        ).map(([t, icon, label]) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            <span aria-hidden="true">{icon}</span> {label}
          </button>
        ))}
        <button onClick={() => openArchive()}>
          <span aria-hidden="true">💡</span> Архив
        </button>
      </nav>
      {selected && (
        <>
          <div className="drawer-backdrop" onClick={() => setSelected(null)} />
          <Profile id={selected} onClose={() => setSelected(null)} onSelect={select} onOpenEvent={setEvent} onArchive={openArchive} />
        </>
      )}
      {event && <EventModal event={event} onClose={() => setEvent(null)} onSelect={select} onArchive={openArchive} />}
      {archive && (
        <Archive
          initialId={archive.id}
          onClose={() => setArchive(null)}
          onSelect={(id) => {
            setArchive(null);
            select(id);
          }}
        />
      )}
      {settings && <Settings onClose={() => setSettings(false)} />}
    </div>
  );
}
