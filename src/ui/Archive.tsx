import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useGame } from '../app/useGame';
import { filterIdeas, ideaClipboardText, ideasToJson, ideasToMarkdown, STATUS_LABELS, STATUS_ORDER, type IdeaFilter, type IdeaSort } from '../archive/archive';
import type { Idea, IdeaStatus } from '../sim/types';
import { copyText, download, Modal, Stars, Tag } from './common';

export function Archive({ onClose, initialId, onSelect }: { onClose: () => void; initialId?: string; onSelect: (id: string) => void }) {
  const { game } = useGame();
  const all = game.allIdeas();
  const [filter, setFilter] = useState<IdeaFilter>({ status: 'all', sort: 'newest' });
  const [openId, setOpenId] = useState<string | undefined>(initialId);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const list = useMemo(() => filterIdeas(all, filter), [all, filter]);
  const open = all.find((i) => i.id === openId);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const toggle = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelected(s);
  };
  const exportSet = (): Idea[] => (selected.size ? list.filter((i) => selected.has(i.id)) : list);
  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <Modal title={<>💡 Архив идей <span className="muted small">— {game.world.characters.player_avatar.name}</span></>} onClose={onClose} wide className="archive">
      <div className="archive-layout">
        <div className="archive-list-col">
          <div className="filters">
            <input className="input" placeholder="Поиск по названию и содержанию…" value={filter.q ?? ''} onChange={(e) => setFilter({ ...filter, q: e.target.value })} aria-label="Поиск идей" />
            <div className="filter-row">
              <select className="input" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value as IdeaStatus | 'all' })} aria-label="Статус">
                <option value="all">Все статусы</option>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <select className="input" value={filter.sort} onChange={(e) => setFilter({ ...filter, sort: e.target.value as IdeaSort })} aria-label="Сортировка">
                <option value="newest">Сначала новые</option>
                <option value="oldest">Сначала старые</option>
                <option value="score">По оценке персонажа</option>
                <option value="rating">По моей оценке</option>
              </select>
            </div>
            <div className="filter-row">
              <label className="small">
                с <input className="input" type="date" value={filter.from ?? ''} onChange={(e) => setFilter({ ...filter, from: e.target.value || undefined })} />
              </label>
              <label className="small">
                по <input className="input" type="date" value={filter.to ?? ''} onChange={(e) => setFilter({ ...filter, to: e.target.value || undefined })} />
              </label>
              <label className="small row">
                <input type="checkbox" checked={!!filter.favoritesOnly} onChange={(e) => setFilter({ ...filter, favoritesOnly: e.target.checked })} /> ★ избранное
              </label>
            </div>
            <div className="filter-row export-row">
              <span className="small muted">{selected.size ? `Выбрано: ${selected.size}` : `Показано: ${list.length}`}</span>
              <button className="btn small" onClick={() => download(`ideas-${stamp}.md`, ideasToMarkdown(exportSet()), 'text/markdown')} disabled={!list.length}>
                ⬇ Markdown
              </button>
              <button className="btn small" onClick={() => download(`ideas-${stamp}.json`, ideasToJson(exportSet()), 'application/json')} disabled={!list.length}>
                ⬇ JSON
              </button>
              {selected.size > 0 && (
                <button className="btn small ghost" onClick={() => setSelected(new Set())}>
                  Снять выбор
                </button>
              )}
            </div>
          </div>
          <ul className="idea-list">
            {list.length === 0 && (
              <li className="muted pad">
                {all.length === 0 ? 'Архив пуст. Идеи появятся, когда персонаж накопит наблюдения и подумает о них.' : 'Ничего не найдено.'}
              </li>
            )}
            {list.map((i) => (
              <li key={i.id} className={`idea-row${openId === i.id ? ' open' : ''}`}>
                <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} aria-label="Выбрать для экспорта" />
                <button className="idea-main" onClick={() => setOpenId(i.id)}>
                  <span className="idea-title">
                    {i.favorite && <span className="fav">★ </span>}
                    {i.title}
                  </span>
                  <span className="idea-meta small muted">
                    {i.gameDate} · {i.avatarScore}/10 · <span className={`st st-${i.status}`}>{STATUS_LABELS[i.status]}</span>
                    {i.worldId !== game.world.worldId && ' · прошлый мир'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="archive-detail-col">
          {open ? <IdeaCard idea={open} onToast={setToast} onSelect={onSelect} /> : <p className="muted pad">Выберите идею слева, чтобы открыть полную карточку.</p>}
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </Modal>
  );
}

function IdeaCard({ idea, onToast, onSelect }: { idea: Idea; onToast: (s: string) => void; onSelect: (id: string) => void }) {
  const { game } = useGame();
  const w = game.world;
  const [notes, setNotes] = useState(idea.userNotes);
  useEffect(() => setNotes(idea.userNotes), [idea.id, idea.userNotes]);
  const dirty = notes !== idea.userNotes;
  const update = (patch: Parameters<typeof game.updateIdea>[1]) => void game.updateIdea(idea.id, patch);

  return (
    <article className="idea-card">
      <header>
        <h3>{idea.title}</h3>
        <div className="row wrap">
          <Tag tone="accent">Оценка персонажа: {idea.avatarScore}/10</Tag>
          <Tag tone="warn">Не проверена: спрос и конкуренты не исследовались</Tag>
          <Tag>{idea.generator === 'rules' ? 'Сгенерирована правилами' : 'Сгенерирована моделью'}</Tag>
        </div>
      </header>
      <div className="idea-controls">
        <label>
          Статус{' '}
          <select className="input" value={idea.status} onChange={(e) => update({ status: e.target.value as IdeaStatus })}>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <span>
          Моя оценка <Stars value={idea.userRating} onChange={(v) => update({ userRating: v })} />
        </span>
        <button className={`btn small${idea.favorite ? ' on' : ''}`} onClick={() => update({ favorite: !idea.favorite })}>
          {idea.favorite ? '★ В избранном' : '☆ В избранное'}
        </button>
        <button
          className="btn small"
          onClick={async () => onToast((await copyText(ideaClipboardText(idea))) ? 'Описание скопировано' : 'Не удалось скопировать')}
        >
          ⧉ Копировать
        </button>
      </div>
      <p className="avatar-quote">«{idea.avatarComment}» — {idea.authorName}</p>
      <Section title="Проблема">{idea.problem}</Section>
      <Section title="Целевая аудитория">{idea.audience}</Section>
      <Section title="Предлагаемое решение">{idea.solution}</Section>
      <Section title="Как можно реализовать">{idea.implementation}</Section>
      <Section title="Следующий практический шаг">
        <b>{idea.nextStep}</b>
      </Section>
      <Section title="Риски и неизвестные">
        <ul className="plain">
          {idea.risks.map((r, i) => (
            <li key={i}>• {r}</li>
          ))}
        </ul>
      </Section>
      <Section title="Почему возникла">{idea.reason}</Section>
      <Section title="Контекст">{idea.context}</Section>
      {idea.relatedCharacterIds.length > 0 && (
        <Section title="Связанные люди">
          {idea.relatedCharacterIds
            .filter((id) => w.characters[id])
            .map((id, i) => (
              <span key={id}>
                {i > 0 && ', '}
                <button className="link" onClick={() => onSelect(id)}>
                  {w.characters[id].name}
                </button>
              </span>
            ))}
        </Section>
      )}
      <Section title="Полное описание">{idea.description}</Section>
      <Section title="Что было дальше">
        <ul className="plain small">
          {idea.timeline.map((t, i) => (
            <li key={i}>• {t.text}</li>
          ))}
        </ul>
      </Section>
      <div className="dates small muted">
        Игровое время: {idea.gameDate} · Записана: {new Date(idea.createdAt).toLocaleString('ru-RU')} · ID: {idea.id}
      </div>
      <label className="notes">
        <span>Мои заметки</span>
        <textarea className="input" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Что думаю об этой идее, что проверить в реальной жизни…" />
      </label>
      <div className="row">
        <button className="btn" disabled={!dirty} onClick={() => update({ userNotes: notes })}>
          Сохранить заметки
        </button>
        {dirty && <span className="small muted">есть несохранённые изменения</span>}
      </div>
    </article>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="idea-sec">
      <h4>{title}</h4>
      <div>{children}</div>
    </section>
  );
}
