import { useState } from 'react';
import { useGame } from '../app/useGame';
import { RANK_LABEL } from '../sim/career';
import { getLocation } from '../sim/locations';
import { money } from '../sim/util';
import type { Character, Rank } from '../sim/types';
import { Portrait } from './Sprite';

type SortKey = 'name' | 'money' | 'mood' | 'reputation' | 'influence';

const STATE_LABEL: Record<string, string> = {
  work: 'работает',
  rest: 'отдыхает',
  talk: 'общается',
  walk: 'в пути',
  think: 'размышляет',
  sleep: 'спит',
  eat: 'ест',
  study: 'учится',
};

export function stateOf(c: Character): string {
  if (c.activity.arriveAt !== undefined) return 'walk';
  return c.activity.state;
}

export function PeopleList({ onSelect, selectedId }: { onSelect: (id: string) => void; selectedId: string | null }) {
  const { game } = useGame();
  const w = game.world;
  const [q, setQ] = useState('');
  const [rank, setRank] = useState<Rank | 'all'>('all');
  const [state, setState] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('name');

  const ranks = [...new Set(w.order.map((id) => w.characters[id].rank))];
  const people = w.order
    .map((id) => w.characters[id])
    .filter((c) => {
      if (rank !== 'all' && c.rank !== rank) return false;
      if (state !== 'all' && stateOf(c) !== state) return false;
      if (q) {
        const h = `${c.name} ${c.profession} ${c.job?.title ?? ''} ${c.archetype}`.toLowerCase();
        if (!h.includes(q.toLowerCase())) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.isAvatar !== b.isAvatar) return a.isAvatar ? -1 : 1;
      switch (sort) {
        case 'money':
          return b.money - a.money;
        case 'mood':
          return b.mood - a.mood;
        case 'reputation':
          return b.reputation - a.reputation;
        case 'influence':
          return b.influence - a.influence;
        default:
          return a.name.localeCompare(b.name, 'ru');
      }
    });

  return (
    <section className="panel people" aria-label="Жители">
      <div className="panel-head">
        <h2>Жители</h2>
        <span className="muted">{people.length}/{w.order.length}</span>
      </div>
      <div className="filters">
        <input className="input" placeholder="Поиск: имя, профессия…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск персонажей" />
        <div className="filter-row">
          <select className="input" value={rank} onChange={(e) => setRank(e.target.value as Rank | 'all')} aria-label="Статус">
            <option value="all">Любой статус</option>
            {ranks.map((r) => (
              <option key={r} value={r}>
                {RANK_LABEL[r]}
              </option>
            ))}
          </select>
          <select className="input" value={state} onChange={(e) => setState(e.target.value)} aria-label="Занятие">
            <option value="all">Любое занятие</option>
            {Object.entries(STATE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select className="input" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Сортировка">
            <option value="name">По имени</option>
            <option value="money">По деньгам</option>
            <option value="mood">По настроению</option>
            <option value="reputation">По репутации</option>
            <option value="influence">По влиянию</option>
          </select>
        </div>
      </div>
      <ul className="people-list">
        {people.map((c) => (
          <li key={c.id}>
            <button className={`person-row${selectedId === c.id ? ' selected' : ''}${c.isAvatar ? ' is-avatar' : ''}`} onClick={() => onSelect(c.id)}>
              <Portrait appearance={c.appearance} size={36} />
              <span className="person-main">
                <span className="person-name">
                  {c.name}
                  {c.isAvatar && <span className="you">это вы*</span>}
                </span>
                <span className="person-sub">
                  {c.job ? c.job.title : RANK_LABEL[c.rank]} · {RANK_LABEL[c.rank]}
                </span>
                <span className="person-act">
                  <span className={`state-dot st-${stateOf(c)}`} /> {c.activity.label}
                  <span className="muted"> · {getLocation(c.activity.locationId).name}</span>
                </span>
              </span>
              <span className="person-side">
                <span title="Деньги">{money(c.money)}</span>
                <span className={`mood ${c.mood > 60 ? 'good' : c.mood > 35 ? 'warn' : 'bad'}`} title="Настроение">
                  {c.mood > 60 ? '☺' : c.mood > 35 ? '😐' : '☹'}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="footnote">* виртуальная версия пользователя — живёт по тем же правилам, что и остальные.</p>
    </section>
  );
}
