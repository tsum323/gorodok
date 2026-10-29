// Статус подключения языковой модели.
// В текущей версии движок НЕ вызывает языковые модели: идеи, диалоги и объяснения
// строятся на правилах и шаблонах. Здесь только честно сообщается состояние, чтобы
// интерфейс не делал вид, что ИИ подключён. Точка расширения описана в README
// (интерфейс IdeaGenerator в src/sim/ideas/generator.ts).

export interface AiStatus {
  /** Используется ли языковая модель движком прямо сейчас. */
  active: boolean;
  mode: 'rules';
  /** Задан ли ключ в окружении (на будущее). */
  keyConfigured: boolean;
  note: string;
}

export function aiStatus(): AiStatus {
  const keyConfigured = !!process.env.LLM_API_KEY;
  return {
    active: false,
    mode: 'rules',
    keyConfigured,
    note: keyConfigured
      ? 'Ключ LLM_API_KEY найден, но интеграция с моделью в этой версии не реализована — работает генератор на правилах.'
      : 'Языковая модель не подключена. Идеи и диалоги создаются правилами и шаблонами.',
  };
}
