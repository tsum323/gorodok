import { useEffect, useState } from 'react';
import { useGame } from '../app/useGame';
import { RANK_LABEL } from '../sim/career';
import { getLocation } from '../sim/locations';
import { relationLabel, relationsOf, skillName, getRelation } from '../sim/social';
import { formatShort, formatGameTime } from '../sim/time';
import { money } from '../sim/util';
import { monthlyExpenses, runwayMonths } from '../sim/economy';
import { EVENT_TYPES } from '../sim/events';
import { problemById } from '../sim/ideas/catalog';
import { STATUS_LABELS } from '../archive/archive';
import type { Character, SkillKey, TraitKey, WorldEvent } from '../sim/types';
import { Meter, Tag } from './common';
import { Sprite } from './Sprite';

const TRAIT_LABELS: Record<TraitKey, string> = {
  ambition: 'Амбициозность',
  caution: 'Осторожность',
  sociability: 'Общительность',
  curiosity: 'Любознательность',
  discipline: 'Дисциплина',
  impulsivity: 'Импульсивность',
  greed: 'Ориентация на деньги',
  leisure: 'Ценит свободное время',
  empathy: 'Эмпатия',
  creativity: 'Креативность',
};

type Tab = 'overview' | 'relations' | 'history' | 'decisions' | 'projects' | 'memory';

export function Profile({ id, onClose, onSelect, onOpenEvent, onArchive }: { id: string; onClose: () => void; onSelect: (id: string) => void; onOpenEvent: (e: WorldEvent) => void; onArchive: (ideaId?: string) => void }) {
  const { game } = useGame();
  const w = game.world;
  const c = w.characters[id];
  const [tab, setTab] = useState<Tab>('overview');
  useEffect(() => setTab('overview'), [id]);
  if (!c) return null;

  const tabs: [Tab, string][] = [
    ['overview', 'Обзор'],
    ['relations', 'Отношения'],
    ['history', 'История'],
    ['decisions', c.isAvatar ? 'Журнал решений' : 'Решения'],
    ['projects', c.isAvatar ? 'Проекты и идеи' : 'Проекты'],
    ['memory', 'Память'],
  ];

  return (
    <aside className={`drawer${c.isAvatar ? ' avatar-mode' : ''}`} aria-label={`Профиль: ${c.name}`}>
      <header className="drawer-head">
        <div className="drawer-sprite">
          <Sprite appearance={c.appearance} pose={c.activity.state === 'sleep' ? 'stand' : 'stand'} size={4} highlight={c.isAvatar} />
        </div>
        <div className="drawer-title">
          <h2>{c.name}</h2>
          <div className="muted">
            {c.age} лет · {c.profession}
          </div>
          <div className="tags">
            <Tag tone="accent">{RANK_LABEL[c.rank]}</Tag>
            <Tag>{c.archetype}</Tag>
            {c.isAvatar && <Tag tone="avatar">Ваша виртуальная версия</Tag>}
          </div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Закрыть профиль">
          ✕
        </button>
      </header>
      <div className="now-card">
        <span className="now-icon" aria-hidden="true">{c.activity.arriveAt !== undefined ? '🚶' : c.activity.icon}</span>
        <div>
          <div>
            <b>{c.activity.arriveAt !== undefined ? 'Идёт → ' : ''}{c.activity.label}</b> · {getLocation(c.activity.locationId).name}
          </div>
          {c.activity.why && <div className="muted small">Почему: {c.activity.why}</div>}
          <div className="muted small">до {formatShort(w.startDate, c.activity.endsAt)}</div>
        </div>
      </div>
      <nav className="tabs" role="tablist">
        {tabs.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="drawer-body">
        {tab === 'overview' && <Overview c={c} />}
        {tab === 'relations' && <Relations c={c} onSelect={onSelect} />}
        {tab === 'history' && <History c={c} onOpenEvent={onOpenEvent} />}
        {tab === 'decisions' && <Decisions c={c} onOpenEvent={onOpenEvent} />}
        {tab === 'projects' && <Projects c={c} onArchive={onArchive} onSelect={onSelect} />}
        {tab === 'memory' && <MemoryTab c={c} />}
      </div>
    </aside>
  );
}

function Overview({ c }: { c: Character }) {
  const { game } = useGame();
  const w = game.world;
  const org = c.job ? w.orgs[c.job.orgId] : undefined;
  const goals = c.goals.filter((g) => g.status === 'active').sort((a, b) => b.priority - a.priority);
  const done = c.goals.filter((g) => g.status !== 'active').slice(-4);
  return (
    <div className="stack">
      <p className="bio">{c.bio}</p>
      <div className="grid2">
        <div className="card">
          <h3>Состояние</h3>
          <Meter label="Энергия" value={c.needs.energy} />
          <Meter label="Сытость" value={c.needs.satiety} />
          <Meter label="Общение" value={c.needs.social} />
          <Meter label="Отдых" value={c.needs.fun} />
          <Meter label="Настроение" value={c.mood} />
          <Meter label="Довольство жизнью" value={c.satisfaction} tone="accent" />
          <Meter label="Стресс" value={c.stress} tone={c.stress > 60 ? 'bad' : c.stress > 35 ? 'warn' : 'good'} />
        </div>
        <div className="card">
          <h3>Работа и деньги</h3>
          <dl className="kv">
            <dt>Работа</dt>
            <dd>{c.job ? `${c.job.title}, «${org?.name}»` : c.student ? 'Студент(ка)' : c.freelancer ? 'Фриланс' : 'Нет'}</dd>
            {c.job && (
              <>
                <dt>Зарплата</dt>
                <dd>{c.job.salary ? `${money(c.job.salary)}/мес.` : 'Прибыль бизнеса'}</dd>
                <dt>Эффективность</dt>
                <dd>{Math.round(c.job.performance)}/100{c.job.warnings ? ` · ⚠ ${c.job.warnings}` : ''}</dd>
                <dt>График</dt>
                <dd>
                  {c.job.startHour}:00–{c.job.endHour}:00{c.job.weekends ? ', без выходных' : ''}
                </dd>
              </>
            )}
            <dt>Баланс</dt>
            <dd>{money(c.money)}</dd>
            {c.debt > 0 && (
              <>
                <dt>Долг</dt>
                <dd className="bad">{money(c.debt)}</dd>
              </>
            )}
            <dt>Расходы</dt>
            <dd>{money(monthlyExpenses(c))}/мес. (жильё {money(c.housing.rent)})</dd>
            <dt>Запас</dt>
            <dd>{runwayMonths(c).toFixed(1)} мес.</dd>
            <dt>За прошлый месяц</dt>
            <dd>
              +{money(c.incomeLastMonth)} / −{money(c.expensesLastMonth)}
            </dd>
            <dt>Жильё</dt>
            <dd>{c.housing.label}</dd>
            <dt>Репутация</dt>
            <dd>{Math.round(c.reputation)}/100</dd>
            <dt>Влияние</dt>
            <dd>{Math.round(c.influence)}/100</dd>
          </dl>
        </div>
      </div>
      <div className="card">
        <h3>Цели</h3>
        {goals.length === 0 && <p className="muted">Нет активных целей.</p>}
        <ul className="goals">
          {goals.map((g) => (
            <li key={g.id}>
              <span className={`horizon h-${g.horizon}`}>{g.horizon === 'long' ? 'Амбиция' : 'Текущая'}</span>
              <span className="goal-label">{g.label}</span>
              <span className="goal-bar">
                <span style={{ width: `${g.progress}%` }} />
              </span>
            </li>
          ))}
        </ul>
        {done.length > 0 && (
          <p className="muted small">
            Завершённые/отброшенные: {done.map((g) => `${g.label} (${g.status === 'done' ? '✓' : '✗'})`).join('; ')}
          </p>
        )}
      </div>
      <div className="card">
        <h3>Планы на ближайшее время</h3>
        <ul className="plain">
          {c.tasks.map((t) => (
            <li key={t.id}>• {t.label}</li>
          ))}
          {c.tasks.length === 0 && <li className="muted">Планы появятся после утреннего обдумывания дня.</li>}
        </ul>
      </div>
      <div className="grid2">
        <div className="card">
          <h3>Характер</h3>
          {(Object.keys(TRAIT_LABELS) as TraitKey[]).map((k) => (
            <Meter key={k} label={TRAIT_LABELS[k]} value={c.traits[k] * 100} tone="accent" />
          ))}
        </div>
        <div className="card">
          <h3>Навыки</h3>
          {(Object.keys(c.skills) as SkillKey[])
            .sort((a, b) => c.skills[b] - c.skills[a])
            .map((k) => (
              <Meter key={k} label={skillName(k)} value={c.skills[k]} tone="accent" />
            ))}
        </div>
      </div>
    </div>
  );
}

function Relations({ c, onSelect }: { c: Character; onSelect: (id: string) => void }) {
  const { game } = useGame();
  const w = game.world;
  const rels = relationsOf(w, c.id).sort((a, b) => b.familiarity + b.affinity - (a.familiarity + a.affinity));
  if (rels.length === 0) return <p className="muted">Пока ни с кем не знаком(а).</p>;
  return (
    <ul className="rel-list">
      {rels.map((r) => {
        const other = w.characters[r.to];
        const back = getRelation(w, r.to, c.id);
        return (
          <li key={r.to}>
            <button className="rel-row" onClick={() => onSelect(r.to)}>
              <span className="rel-name">{other.name}</span>
              <Tag tone={r.kind === 'conflict' || r.kind === 'rival' ? 'bad' : r.kind.includes('friend') ? 'good' : undefined}>{relationLabel(r.kind)}</Tag>
              {r.business && <Tag tone="accent">дело</Tag>}
              <span className="rel-nums small">
                симпатия {Math.round(r.affinity)} · доверие {Math.round(r.trust)} · уважение {Math.round(r.respect)}
              </span>
              {back && (
                <span className="rel-back small muted">
                  взаимно: {relationLabel(back.kind)}, симпатия {Math.round(back.affinity)}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function History({ c, onOpenEvent }: { c: Character; onOpenEvent: (e: WorldEvent) => void }) {
  const { game } = useGame();
  const w = game.world;
  const [full, setFull] = useState<WorldEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const recent = c.history.slice().reverse();
  const load = async () => {
    setLoading(true);
    try {
      await game.save();
      setFull(await game.loadCharacterHistory(c.id));
    } finally {
      setLoading(false);
    }
  };
  const findEvent = (id?: string) => (id ? w.events.find((e) => e.id === id) : undefined);
  return (
    <div className="stack">
      <div className="row">
        <span className="muted small">Значимые события (последние {recent.length}).</span>
        <button className="btn small" onClick={load} disabled={loading}>
          {loading ? 'Загрузка…' : 'Полная история из хранилища'}
        </button>
      </div>
      {full ? (
        <ol className="timeline">
          {full.map((e) => (
            <li key={e.id}>
              <button className="tl-item" onClick={() => onOpenEvent(e)}>
                <span className="tl-time">{formatShort(w.startDate, e.time)}</span>
                <span>
                  {EVENT_TYPES[e.type].icon} {e.summary}
                </span>
              </button>
            </li>
          ))}
          {full.length === 0 && <li className="muted">В хранилище пока нет событий.</li>}
        </ol>
      ) : (
        <ol className="timeline">
          {recent.map((h, i) => {
            const ev = findEvent(h.eventId);
            return (
              <li key={i} className={`tl-${h.kind}`}>
                <button className="tl-item" onClick={() => ev && onOpenEvent(ev)} disabled={!ev}>
                  <span className="tl-time">{formatShort(w.startDate, h.time)}</span>
                  <span>{h.text}</span>
                </button>
              </li>
            );
          })}
          {recent.length === 0 && <li className="muted">История только начинается.</li>}
        </ol>
      )}
    </div>
  );
}

function Decisions({ c, onOpenEvent }: { c: Character; onOpenEvent: (e: WorldEvent) => void }) {
  const { game } = useGame();
  const w = game.world;
  const [importantOnly, setImportantOnly] = useState(!c.isAvatar ? false : false);
  const list = c.decisions.filter((d) => !importantOnly || d.eventId).slice().reverse();
  return (
    <div className="stack">
      {c.isAvatar && (
        <label className="row small">
          <input type="checkbox" checked={importantOnly} onChange={(e) => setImportantOnly(e.target.checked)} /> Только важные решения
        </label>
      )}
      {list.length === 0 && <p className="muted">Значимых решений пока не было.</p>}
      <ol className="decisions">
        {list.map((d) => {
          const ev = d.eventId ? w.events.find((e) => e.id === d.eventId) : undefined;
          return (
            <li key={d.id} className={`decision${d.eventId ? ' important' : ''}`}>
              <div className="dec-head">
                <span className="tl-time">{formatShort(w.startDate, d.time)}</span>
                <b>{d.choice}</b>
                {ev && (
                  <button className="link small" onClick={() => onOpenEvent(ev)}>
                    событие
                  </button>
                )}
              </div>
              <div className="small">Почему: {d.reason}</div>
              {d.alternatives.length > 1 && (
                <div className="small muted">
                  Рассматривал(а):{' '}
                  {d.alternatives.map((a, i) => (
                    <span key={i} className={i === 0 ? 'alt chosen' : 'alt'}>
                      {a.label} ({a.score.toFixed(1)})
                    </span>
                  ))}
                </div>
              )}
              <div className="small">Ожидание: {d.expected}</div>
              {d.outcome && <div className="small outcome">Итог: {d.outcome}</div>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Projects({ c, onArchive, onSelect }: { c: Character; onArchive: (ideaId?: string) => void; onSelect: (id: string) => void }) {
  const { game } = useGame();
  const w = game.world;
  const projects = c.projectIds.map((id) => w.projects[id]).filter(Boolean);
  const ideas = c.isAvatar ? Object.values(w.ideas).sort((a, b) => b.gameTime - a.gameTime) : [];
  const observations = c.isAvatar ? w.observations.filter((o) => o.observerId === c.id && !o.used).slice(-8).reverse() : [];
  const STATUS: Record<string, string> = { planning: 'план', active: 'в работе', launched: 'запущен', paused: 'пауза', failed: 'провал', abandoned: 'заброшен' };
  return (
    <div className="stack">
      {projects.length === 0 && <p className="muted">Проектов нет.</p>}
      {projects.map((p) => (
        <div key={p.id} className="card">
          <h3>
            🚀 {p.name} <Tag tone={p.status === 'launched' ? 'good' : p.status === 'failed' || p.status === 'abandoned' ? 'bad' : 'accent'}>{STATUS[p.status]}</Tag>
          </h3>
          <p className="small">{p.description}</p>
          <Meter label="Готовность" value={p.progress} tone="accent" />
          <Meter label="Качество" value={p.quality} tone="accent" />
          <dl className="kv small">
            <dt>Владелец</dt>
            <dd>
              <button className="link" onClick={() => onSelect(p.ownerId)}>
                {w.characters[p.ownerId]?.name}
              </button>
            </dd>
            <dt>Участники</dt>
            <dd>
              {p.memberIds.map((m) => (
                <button key={m} className="link" onClick={() => onSelect(m)}>
                  {w.characters[m]?.name.split(' ')[0]}{' '}
                </button>
              ))}
            </dd>
            <dt>Пользователи</dt>
            <dd>{p.users}</dd>
            <dt>Затраты / выручка</dt>
            <dd>
              {money(p.spent)} / {money(p.revenueTotal)}
            </dd>
            <dt>Начат</dt>
            <dd>{formatGameTime(w.startDate, p.createdAt, false)}</dd>
          </dl>
          {p.tasks.length > 0 && (
            <ul className="plain small">
              {p.tasks.map((t) => (
                <li key={t.id}>
                  {t.done ? '✓' : '○'} {t.label} — {w.characters[t.assigneeId]?.name.split(' ')[0]}
                </li>
              ))}
            </ul>
          )}
          <details>
            <summary className="small">История проекта</summary>
            <ul className="plain small">
              {p.history
                .slice()
                .reverse()
                .map((h, i) => (
                  <li key={i}>
                    {formatShort(w.startDate, h.time)} — {h.text}
                  </li>
                ))}
            </ul>
          </details>
          {p.ideaId && (
            <button className="btn small" onClick={() => onArchive(p.ideaId)}>
              Открыть исходную идею
            </button>
          )}
        </div>
      ))}
      {c.isAvatar && (
        <>
          <div className="card">
            <div className="row">
              <h3>💡 Идеи ({ideas.length})</h3>
              <button className="btn small" onClick={() => onArchive()}>
                Открыть архив
              </button>
            </div>
            <ul className="plain">
              {ideas.slice(0, 10).map((i) => (
                <li key={i.id}>
                  <button className="link" onClick={() => onArchive(i.id)}>
                    {i.title}
                  </button>{' '}
                  <span className="muted small">
                    {i.avatarScore}/10 · {STATUS_LABELS[i.status]}
                  </span>
                </li>
              ))}
              {ideas.length === 0 && <li className="muted">Идей пока нет — персонаж собирает наблюдения.</li>}
            </ul>
          </div>
          <div className="card">
            <h3>👁 Наблюдения, ждущие осмысления</h3>
            <ul className="plain small">
              {observations.map((o) => (
                <li key={o.id}>
                  • {o.text} <span className="muted">({problemById.get(o.problemId)?.audienceShort})</span>
                </li>
              ))}
              {observations.length === 0 && <li className="muted">Нет свежих наблюдений.</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function MemoryTab({ c }: { c: Character }) {
  const { game } = useGame();
  const w = game.world;
  const KIND: Record<string, string> = { meeting: '🤝', decision: '🧭', agreement: '📝', observation: '👁', conflict: '⚡', failure: '✗', success: '✓', conversation: '💬' };
  const list = c.memory.slice().sort((a, b) => b.time - a.time);
  return (
    <ul className="plain memory">
      {list.map((m) => (
        <li key={m.id} style={{ opacity: 0.55 + m.importance * 0.45 }}>
          <span className="tl-time">{formatShort(w.startDate, m.time)}</span> {KIND[m.kind]} {m.text}
        </li>
      ))}
      {list.length === 0 && <li className="muted">Память пока пуста.</li>}
    </ul>
  );
}
