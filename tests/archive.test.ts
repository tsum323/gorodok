import { describe, expect, it } from 'vitest';
import { filterIdeas, ideaToMarkdown, ideasToJson, ideaClipboardText } from '../src/archive/archive.ts';
import type { Idea } from '../src/sim/types.ts';

function idea(p: Partial<Idea>): Idea {
  return {
    id: 'i1', worldId: 'w', authorId: 'player_avatar', authorName: 'Даня', title: 'Идея', description: 'Описание',
    gameTime: 10, gameDate: 'Пн, 7 сен 2026, 10:00', createdAt: '2026-10-01T10:00:00.000Z', reason: 'Наблюдение', context: 'Контекст',
    relatedEventIds: [], relatedCharacterIds: [], audience: 'аудитория', problem: 'проблема', solution: 'решение', implementation: 'MVP',
    nextStep: 'интервью', risks: ['Спрос не проверен'], avatarScore: 6, avatarComment: 'норм', validation: 'not_validated', status: 'new',
    userRating: 0, userNotes: '', favorite: false, signature: 'cafe:bot', generator: 'rules', tags: ['chat'], timeline: [], updatedAt: '2026-10-01T10:00:00.000Z',
    ...p,
  };
}

const list = [
  idea({ id: 'a', title: 'Бот для кофеен', description: 'Описание про кофе', status: 'new', createdAt: '2026-10-01T10:00:00.000Z', avatarScore: 6 }),
  idea({ id: 'b', title: 'Дашборд для магазинов', description: 'учёт товара', problem: 'просрочка', status: 'interesting', favorite: true, createdAt: '2026-10-05T10:00:00.000Z', avatarScore: 8, userRating: 4 }),
  idea({ id: 'c', title: 'Помощник для соискателей', description: 'резюме', problem: 'отказы', status: 'rejected', userNotes: 'слишком много конкурентов', createdAt: '2026-10-10T10:00:00.000Z', avatarScore: 3 }),
];

describe('архив идей', () => {
  it('поиск по названию и содержанию (включая заметки)', () => {
    expect(filterIdeas(list, { q: 'кофе' }).map((i) => i.id)).toEqual(['a']);
    expect(filterIdeas(list, { q: 'учёт товара' }).map((i) => i.id)).toEqual(['b']);
    expect(filterIdeas(list, { q: 'конкурентов' }).map((i) => i.id)).toEqual(['c']);
  });

  it('фильтры по статусу, избранному и дате', () => {
    expect(filterIdeas(list, { status: 'rejected' }).map((i) => i.id)).toEqual(['c']);
    expect(filterIdeas(list, { favoritesOnly: true }).map((i) => i.id)).toEqual(['b']);
    expect(filterIdeas(list, { from: '2026-10-02', to: '2026-10-06' }).map((i) => i.id)).toEqual(['b']);
  });

  it('сортировка', () => {
    expect(filterIdeas(list, {}).map((i) => i.id)).toEqual(['c', 'b', 'a']);
    expect(filterIdeas(list, { sort: 'oldest' }).map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(filterIdeas(list, { sort: 'score' }).map((i) => i.id)).toEqual(['b', 'a', 'c']);
    expect(filterIdeas(list, { sort: 'rating' })[0].id).toBe('b');
  });

  it('экспорт в Markdown содержит все разделы и оговорку о проверке', () => {
    const md = ideaToMarkdown(list[1]);
    for (const h of ['Проблема', 'Целевая аудитория', 'Решение', 'Как реализовать', 'Следующий практический шаг', 'Риски', 'Почему возникла', 'Контекст']) {
      expect(md).toContain(h);
    }
    expect(md).toContain('не проводилась');
    expect(md).toContain('★★★★☆');
  });

  it('экспорт в JSON читается обратно', () => {
    const parsed = JSON.parse(ideasToJson(list));
    expect(parsed.ideas).toHaveLength(3);
    expect(parsed.ideas[0].id).toBe('a');
  });

  it('текст для буфера обмена', () => {
    expect(ideaClipboardText(list[0])).toContain('Бот для кофеен');
  });
});
