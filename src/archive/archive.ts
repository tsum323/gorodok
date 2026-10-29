import type { Idea, IdeaStatus } from '../sim/types';

// Архив идей: фильтрация, поиск и экспорт. Чистые функции — используются
// интерфейсом и покрыты тестами.

export const STATUS_LABELS: Record<IdeaStatus, string> = {
  new: 'Новая',
  interesting: 'Интересная',
  review: 'На проверке',
  in_progress: 'В реализации',
  postponed: 'Отложена',
  rejected: 'Отклонена',
};

export const STATUS_ORDER: IdeaStatus[] = ['new', 'interesting', 'review', 'in_progress', 'postponed', 'rejected'];

export type IdeaSort = 'newest' | 'oldest' | 'score' | 'rating';

export interface IdeaFilter {
  q?: string;
  status?: IdeaStatus | 'all';
  favoritesOnly?: boolean;
  /** Даты фактического создания (YYYY-MM-DD), включительно. */
  from?: string;
  to?: string;
  sort?: IdeaSort;
}

function haystack(i: Idea): string {
  return [i.title, i.description, i.problem, i.solution, i.audience, i.implementation, i.nextStep, i.reason, i.context, i.userNotes, i.tags.join(' ')]
    .join(' ')
    .toLowerCase();
}

export function filterIdeas(ideas: Idea[], f: IdeaFilter): Idea[] {
  const words = (f.q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  let out = ideas.filter((i) => {
    if (f.status && f.status !== 'all' && i.status !== f.status) return false;
    if (f.favoritesOnly && !i.favorite) return false;
    const day = i.createdAt.slice(0, 10);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    if (words.length) {
      const h = haystack(i);
      if (!words.every((w) => h.includes(w))) return false;
    }
    return true;
  });
  const sort = f.sort ?? 'newest';
  out = out.slice().sort((a, b) => {
    switch (sort) {
      case 'oldest':
        return a.createdAt.localeCompare(b.createdAt) || a.gameTime - b.gameTime;
      case 'score':
        return b.avatarScore - a.avatarScore || b.createdAt.localeCompare(a.createdAt);
      case 'rating':
        return b.userRating - a.userRating || b.avatarScore - a.avatarScore;
      default:
        return b.createdAt.localeCompare(a.createdAt) || b.gameTime - a.gameTime;
    }
  });
  return out;
}

export function ideaToMarkdown(i: Idea): string {
  const lines = [
    `## ${i.title}`,
    '',
    `- **ID:** ${i.id}`,
    `- **Автор:** ${i.authorName} (персонаж симуляции)`,
    `- **Игровая дата:** ${i.gameDate}`,
    `- **Создана:** ${new Date(i.createdAt).toLocaleString('ru-RU')}`,
    `- **Статус:** ${STATUS_LABELS[i.status]}${i.favorite ? ' · ★ избранное' : ''}`,
    `- **Оценка персонажа:** ${i.avatarScore}/10 — ${i.avatarComment}`,
    `- **Моя оценка:** ${i.userRating ? '★'.repeat(i.userRating) + '☆'.repeat(5 - i.userRating) : 'нет'}`,
    `- **Проверка:** не проводилась (идея сгенерирована симуляцией; спрос, доход и конкуренты не подтверждены)`,
    '',
    `### Описание`,
    i.description,
    '',
    `### Проблема`,
    i.problem,
    '',
    `### Целевая аудитория`,
    i.audience,
    '',
    `### Решение`,
    i.solution,
    '',
    `### Как реализовать`,
    i.implementation,
    '',
    `### Следующий практический шаг`,
    i.nextStep,
    '',
    `### Риски и неизвестные`,
    ...i.risks.map((r) => `- ${r}`),
    '',
    `### Почему возникла`,
    i.reason,
    '',
    `### Контекст`,
    i.context,
  ];
  if (i.userNotes.trim()) lines.push('', '### Мои заметки', i.userNotes.trim());
  if (i.timeline.length > 1) lines.push('', '### История', ...i.timeline.map((t) => `- ${t.text}`));
  return lines.join('\n');
}

export function ideasToMarkdown(ideas: Idea[]): string {
  return [`# Архив идей — «Параллельная жизнь»`, '', `Экспортировано: ${new Date().toLocaleString('ru-RU')}. Идей: ${ideas.length}.`, '', ...ideas.map((i) => ideaToMarkdown(i) + '\n\n---\n')].join('\n');
}

export function ideasToJson(ideas: Idea[]): string {
  return JSON.stringify({ format: 'parallel-life-ideas', exportedAt: new Date().toISOString(), ideas }, null, 2);
}

/** Короткий текст для буфера обмена. */
export function ideaClipboardText(i: Idea): string {
  return `${i.title}\n\nПроблема: ${i.problem}\nРешение: ${i.solution}\nАудитория: ${i.audience}\nКак начать: ${i.implementation}\nСледующий шаг: ${i.nextStep}\nРиски: ${i.risks.join('; ')}`;
}
