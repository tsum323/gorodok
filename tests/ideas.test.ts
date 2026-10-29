import { describe, expect, it } from 'vitest';
import { tryGenerateIdea, IDEA_COOLDOWN_HOURS, type IdeaGenerator } from '../src/sim/ideas/generator.ts';
import { observe } from '../src/sim/ideas/observe.ts';
import { tick } from '../src/sim/engine.ts';
import { freshWorld, simulateDays } from './helpers.ts';

const now = () => '2026-10-29T12:00:00.000Z';

describe('идеи', () => {
  it('идея строится из наблюдения и контекста персонажа', () => {
    const w = freshWorld();
    const av = w.characters.player_avatar;
    observe(w, av, 'support_repeat', 'Женя рассказал(а): в поддержку каждый день приходят одни и те же вопросы', 'zhenya');
    const idea = tryGenerateIdea(w, av, 'conversation', { now, ignoreCooldown: true })!;
    expect(idea).not.toBeNull();
    expect(idea.reason).toContain('Женя');
    expect(idea.problem).toMatch(/поддержк/i);
    expect(idea.relatedCharacterIds).toContain('zhenya');
    expect(idea.audience.length).toBeGreaterThan(3);
    expect(idea.solution.length).toBeGreaterThan(10);
    expect(idea.implementation.length).toBeGreaterThan(10);
    expect(idea.nextStep.length).toBeGreaterThan(10);
    expect(idea.risks.some((r) => /Спрос не проверен/.test(r))).toBe(true);
    expect(idea.validation).toBe('not_validated');
    expect(idea.status).toBe('new');
    expect(idea.avatarScore).toBeGreaterThanOrEqual(1);
    expect(idea.avatarScore).toBeLessThanOrEqual(10);
    expect(idea.createdAt).toBe(now());
    expect(idea.gameDate).toMatch(/2026/);
  });

  it('без наблюдений идея не возникает (нет случайных фраз)', () => {
    const w = freshWorld();
    expect(tryGenerateIdea(w, w.characters.player_avatar, 'reflection', { now, ignoreCooldown: true })).toBeNull();
  });

  it('идеи не дублируются', () => {
    const w = freshWorld();
    const av = w.characters.player_avatar;
    for (let i = 0; i < 60; i++) {
      observe(w, av, 'manual_reports', `наблюдение ${i}`, i % 2 ? 'olga' : undefined);
      w.time += 80;
      tryGenerateIdea(w, av, 'reflection', { now, ignoreCooldown: true });
    }
    const sigs = Object.values(w.ideas).map((i) => i.signature);
    expect(new Set(sigs).size).toBe(sigs.length);
    const titles = Object.values(w.ideas).map((i) => i.title.toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
    expect(sigs.filter((s) => s.startsWith('manual_reports:')).length).toBeLessThanOrEqual(2);
  });

  it('соблюдается пауза между идеями', () => {
    const w = freshWorld();
    const av = w.characters.player_avatar;
    observe(w, av, 'support_repeat', 'a');
    observe(w, av, 'manual_reports', 'b');
    expect(tryGenerateIdea(w, av, 'reflection', { now })).not.toBeNull();
    expect(tryGenerateIdea(w, av, 'reflection', { now })).toBeNull();
    w.time += IDEA_COOLDOWN_HOURS;
    expect(tryGenerateIdea(w, av, 'reflection', { now })).not.toBeNull();
  });

  it('ошибка генератора не ломает симуляцию', () => {
    const w = freshWorld();
    const av = w.characters.player_avatar;
    observe(w, av, 'support_repeat', 'a');
    const broken: IdeaGenerator = {
      name: 'llm',
      generate() {
        throw new Error('модель недоступна');
      },
    };
    const warn = console.warn;
    console.warn = () => undefined;
    expect(tryGenerateIdea(w, av, 'reflection', { generator: broken, ignoreCooldown: true })).toBeNull();
    console.warn = warn;
    expect(w.counters.ideaErrors).toBe(1);
    expect(() => tick(w)).not.toThrow();
  });

  it('главный персонаж сам формирует идеи в ходе жизни', () => {
    const w = simulateDays(freshWorld(51), 45);
    const ideas = Object.values(w.ideas);
    expect(ideas.length).toBeGreaterThan(0);
    for (const i of ideas) {
      expect(i.authorId).toBe('player_avatar');
      expect(i.reason).toMatch(/Наблюдение/);
    }
    expect(w.events.some((e) => e.type === 'idea')).toBe(true);
  });
});
