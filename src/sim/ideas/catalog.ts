import type { SkillKey } from '../types';

// Каталоги для генератора идей на правилах.
// Проблемы персонажи наблюдают в мире (на работе, в кафе, при поиске работы...).
// Технологии — то, о чём в мире известно (часть открывается новостями).

export interface ProblemDef {
  id: string;
  /** Короткая формулировка для диалогов: «…» */
  short: string;
  /** Развёрнутое описание проблемы. */
  statement: string;
  audience: string;
  audienceShort: string;
  /** Что должно делать решение (глагольная фраза). */
  action: string;
  goalNoun: string;
  tags: string[];
  severity: number; // 0..1, насколько больно по мнению персонажей
  /** Контексты, в которых проблему можно заметить. */
  contexts: string[];
  /** Готовность аудитории платить — субъективная оценка персонажа. */
  payHint: 'low' | 'mid' | 'high';
}

export const PROBLEMS: ProblemDef[] = [
  {
    id: 'meetings_overload', short: 'созвоны съедают половину дня',
    statement: 'Сотрудники тратят много времени на встречи, итоги которых теряются, а задачи из них никто не фиксирует.',
    audience: 'офисные команды 5–50 человек', audienceShort: 'офисных команд', action: 'автоматически превращает созвон в краткие итоги и список задач с ответственными',
    goalNoun: 'итоги встреч без ручной работы', tags: ['meetings', 'text', 'voice', 'productivity'], severity: 0.6,
    contexts: ['org:company', 'role:management', 'state:burnout'], payHint: 'mid',
  },
  {
    id: 'manual_reports', short: 'еженедельные отчёты собираются вручную из пяти таблиц',
    statement: 'Аналитики и менеджеры каждую неделю вручную сводят данные из разных таблиц в один отчёт, теряя часы и допуская ошибки.',
    audience: 'аналитики и руководители небольших компаний', audienceShort: 'аналитиков', action: 'собирает данные из нескольких таблиц и готовит отчёт с пояснениями человеческим языком',
    goalNoun: 'автоматические отчёты', tags: ['data', 'text', 'automation', 'productivity'], severity: 0.65,
    contexts: ['org:company', 'role:analytics', 'role:finance'], payHint: 'mid',
  },
  {
    id: 'support_repeat', short: 'в поддержку каждый день приходят одни и те же вопросы',
    statement: 'Служба поддержки отвечает на однотипные вопросы, которые уже есть в документации, а сложные обращения ждут в очереди.',
    audience: 'небольшие компании с собственной поддержкой', audienceShort: 'служб поддержки', action: 'отвечает на типовые вопросы по базе знаний и передаёт человеку только сложные случаи',
    goalNoun: 'ответы на типовые вопросы', tags: ['text', 'documents', 'service', 'chat'], severity: 0.7,
    contexts: ['org:company', 'role:service'], payHint: 'high',
  },
  {
    id: 'onboarding_chaos', short: 'новичкам никто толком не объясняет, где что лежит',
    statement: 'Новые сотрудники неделями разбираются во внутренних документах и отвлекают коллег одинаковыми вопросами.',
    audience: 'компании, которые часто нанимают', audienceShort: 'новых сотрудников', action: 'отвечает новичкам на вопросы по внутренним документам и ведёт по плану адаптации',
    goalNoun: 'быстрая адаптация', tags: ['documents', 'text', 'learning', 'knowledge'], severity: 0.5,
    contexts: ['event:hired', 'org:company'], payHint: 'mid',
  },
  {
    id: 'cafe_demand', short: 'никогда не знаешь, сколько гостей придёт завтра',
    statement: 'Небольшие кафе не могут предсказать загрузку: то не хватает выпечки и персонала, то продукты списываются.',
    audience: 'владельцы небольших кафе и кофеен', audienceShort: 'кофеен', action: 'прогнозирует загрузку и закупки по дням недели, погоде и истории продаж',
    goalNoun: 'прогноз загрузки и закупок', tags: ['data', 'forecast', 'small_business', 'service'], severity: 0.65,
    contexts: ['org:cafe', 'loc:cafe'], payHint: 'mid',
  },
  {
    id: 'cafe_queue', short: 'в обед очередь, а потом пусто',
    statement: 'В часы пик гости уходят из-за очереди, а в остальное время кафе простаивает.',
    audience: 'кафе и точки быстрого питания', audienceShort: 'кафе', action: 'принимает предзаказы и распределяет гостей по менее загруженным часам с помощью персональных предложений',
    goalNoun: 'ровная загрузка без очередей', tags: ['scheduling', 'small_business', 'chat', 'service'], severity: 0.5,
    contexts: ['loc:cafe', 'org:cafe'], payHint: 'mid',
  },
  {
    id: 'shop_inventory', short: 'учёт товара до сих пор в тетрадке',
    statement: 'Магазины у дома ведут учёт остатков вручную, не видят, что заканчивается, и теряют деньги на просрочке.',
    audience: 'владельцы магазинов у дома', audienceShort: 'магазинов у дома', action: 'ведёт учёт остатков по фото накладных и напоминает, что пора дозаказать',
    goalNoun: 'учёт товара без тетрадки', tags: ['data', 'small_business', 'forecast', 'counting', 'retail'], severity: 0.6,
    contexts: ['org:shop', 'loc:shop'], payHint: 'low',
  },
  {
    id: 'shop_delivery', short: 'покупатели уходят в доставку из больших сетей',
    statement: 'Маленьким магазинам сложно конкурировать с доставкой крупных сетей, хотя у них есть лояльные соседи-покупатели.',
    audience: 'небольшие магазины и их постоянные покупатели', audienceShort: 'соседских магазинов', action: 'позволяет соседям заказать продукты в местном магазине через мессенджер и забрать по пути домой',
    goalNoun: 'заказы у соседского магазина', tags: ['chat', 'small_business', 'retail', 'marketplace'], severity: 0.55,
    contexts: ['org:shop', 'loc:shop'], payHint: 'low',
  },
  {
    id: 'freelance_invoicing', short: 'фрилансеры забывают выставить счёт и напомнить об оплате',
    statement: 'Фрилансеры тратят время на счета, договоры и напоминания клиентам, а часть денег приходит с опозданием.',
    audience: 'фрилансеры и самозанятые', audienceShort: 'фрилансеров', action: 'формирует счета и акты, отслеживает оплаты и вежливо напоминает клиентам',
    goalNoun: 'счета и оплаты без хаоса', tags: ['finance', 'automation', 'text', 'freelance'], severity: 0.55,
    contexts: ['freelancer', 'loc:coworking'], payHint: 'mid',
  },
  {
    id: 'freelance_clients', short: 'найти стабильных клиентов почти невозможно',
    statement: 'Фрилансерам сложно находить постоянных клиентов: заказы приходят волнами, а время уходит на поиск.',
    audience: 'начинающие фрилансеры', audienceShort: 'фрилансеров', action: 'подбирает подходящие заказы и помогает составить персональный отклик',
    goalNoun: 'поток заказов', tags: ['text', 'sales', 'marketplace', 'freelance'], severity: 0.6,
    contexts: ['freelancer', 'loc:coworking'], payHint: 'low',
  },
  {
    id: 'job_search_pain', short: 'на отклики не отвечают, и непонятно, что не так с резюме',
    statement: 'Соискатели рассылают десятки откликов без ответа и не понимают, как адаптировать резюме под конкретную вакансию.',
    audience: 'люди в поиске работы', audienceShort: 'соискателей', action: 'разбирает вакансию, подсказывает, как адаптировать резюме, и тренирует собеседование',
    goalNoun: 'отклики, на которые отвечают', tags: ['text', 'learning', 'career'], severity: 0.7,
    contexts: ['event:job_reject', 'state:unemployed'], payHint: 'low',
  },
  {
    id: 'career_switch', short: 'при смене профессии непонятно, как собрать портфолио без опыта',
    statement: 'Люди, меняющие профессию, не знают, какие проекты сделать для портфолио и как показать перенос старого опыта.',
    audience: 'люди, меняющие профессию', audienceShort: 'тех, кто меняет профессию', action: 'предлагает учебные проекты на реальных задачах и помогает оформить их в портфолио',
    goalNoun: 'портфолио без опыта', tags: ['learning', 'career', 'text'], severity: 0.6,
    contexts: ['goal:change_career'], payHint: 'mid',
  },
  {
    id: 'student_overload', short: 'студенты тонут в дедлайнах и материалах',
    statement: 'Студенты не успевают разбирать материалы курсов и не понимают, на чём сосредоточиться перед сессией.',
    audience: 'студенты', audienceShort: 'студентов', action: 'составляет персональный план подготовки и объясняет сложные темы на примерах',
    goalNoun: 'подготовка без паники', tags: ['learning', 'text', 'documents', 'knowledge'], severity: 0.5,
    contexts: ['student', 'loc:university'], payHint: 'low',
  },
  {
    id: 'research_data', short: 'на чистку данных для исследований уходят недели',
    statement: 'Преподаватели и исследователи тратят большую часть времени на подготовку и чистку данных, а не на анализ.',
    audience: 'исследователи и аналитики', audienceShort: 'исследователей', action: 'находит ошибки и пропуски в данных и предлагает исправления с объяснениями',
    goalNoun: 'чистые данные быстрее', tags: ['data', 'automation', 'knowledge'], severity: 0.45,
    contexts: ['loc:university', 'role:analytics'], payHint: 'mid',
  },
  {
    id: 'budget_chaos', short: 'деньги куда-то утекают, а куда — непонятно',
    statement: 'Многие не видят структуру своих расходов, пока не оказываются в долгах.',
    audience: 'молодые специалисты с нестабильным доходом', audienceShort: 'тех, кто хочет навести порядок в деньгах', action: 'разбирает траты по выпискам и заранее предупреждает о кассовых разрывах',
    goalNoun: 'понятный личный бюджет', tags: ['finance', 'data', 'forecast'], severity: 0.55,
    contexts: ['state:debt', 'state:low_money'], payHint: 'low',
  },
  {
    id: 'burnout', short: 'работа съедает всё время, и никак не выключиться',
    statement: 'Люди перерабатывают, не замечая, как растёт усталость, пока не наступает выгорание.',
    audience: 'офисные сотрудники и фрилансеры', audienceShort: 'перегруженных специалистов', action: 'отслеживает нагрузку по календарю и подсказывает, что можно делегировать или отменить',
    goalNoun: 'нагрузка без выгорания', tags: ['scheduling', 'productivity'], severity: 0.5,
    contexts: ['state:burnout', 'goal:free_time'], payHint: 'mid',
  },
  {
    id: 'mvp_no_demand', short: 'сделали продукт, а он никому не нужен',
    statement: 'Начинающие предприниматели месяцами строят продукт и только потом выясняют, что спрос не подтверждается.',
    audience: 'начинающие предприниматели', audienceShort: 'начинающих основателей', action: 'помогает за неделю проверить спрос: интервью, лендинг и простые метрики до написания кода',
    goalNoun: 'проверка спроса до разработки', tags: ['learning', 'sales', 'data', 'text'], severity: 0.6,
    contexts: ['event:project_failed', 'event:project_abandoned'], payHint: 'mid',
  },
  {
    id: 'smb_social_media', short: 'у малого бизнеса нет времени вести соцсети',
    statement: 'Владельцы малого бизнеса понимают, что соцсети нужны, но не успевают регулярно готовить публикации.',
    audience: 'малый бизнес без маркетолога', audienceShort: 'малого бизнеса', action: 'готовит план публикаций и черновики постов на основе фото и событий заведения',
    goalNoun: 'регулярные публикации', tags: ['text', 'small_business', 'content', 'automation'], severity: 0.5,
    contexts: ['org:agency', 'org:cafe', 'org:shop', 'freelancer'], payHint: 'mid',
  },
  {
    id: 'find_partner', short: 'трудно найти сооснователя с нужными навыками',
    statement: 'Люди с идеями не могут найти партнёров с дополняющими навыками и доверием.',
    audience: 'начинающие предприниматели и инженеры', audienceShort: 'будущих сооснователей', action: 'подбирает возможных партнёров по навыкам и целям и предлагает маленький совместный тест-проект',
    goalNoun: 'поиск сооснователя', tags: ['marketplace', 'career'], severity: 0.45,
    contexts: ['goal:find_partner', 'loc:coworking'], payHint: 'low',
  },
  {
    id: 'coworking_empty', short: 'днём в коворкинге половина мест пустует',
    statement: 'Коворкинги и небольшие офисы не заполнены в будни, хотя рядом есть люди, которым нужно место на пару часов.',
    audience: 'коворкинги и люди, работающие удалённо', audienceShort: 'коворкингов', action: 'продаёт свободные места почасово и подбирает соседей по интересам',
    goalNoun: 'почасовая загрузка мест', tags: ['scheduling', 'marketplace', 'small_business'], severity: 0.45,
    contexts: ['org:coworking', 'loc:coworking'], payHint: 'mid',
  },
  {
    id: 'info_overload', short: 'новостей об ИИ так много, что непонятно, что полезно',
    statement: 'Специалисты не успевают следить за новыми инструментами и не понимают, что из этого применимо в их работе.',
    audience: 'специалисты, которые хотят применять ИИ в работе', audienceShort: 'занятых специалистов', action: 'собирает новости и инструменты под профессию человека и показывает пример применения на его задаче',
    goalNoun: 'полезные новости без шума', tags: ['text', 'learning', 'knowledge'], severity: 0.4,
    contexts: ['explore'], payHint: 'low',
  },
  {
    id: 'doc_paperwork', short: 'договоры и бумажная работа отнимают выходные',
    statement: 'Небольшие компании и самозанятые тратят много времени на типовые документы и проверку договоров.',
    audience: 'малый бизнес и самозанятые', audienceShort: 'малого бизнеса', action: 'заполняет типовые документы и подсвечивает рискованные пункты в договорах для проверки юристом',
    goalNoun: 'документы без рутины', tags: ['documents', 'text', 'finance', 'automation'], severity: 0.5,
    contexts: ['role:finance', 'freelancer', 'org:agency'], payHint: 'mid',
  },
];

export interface TechDef {
  id: string;
  name: string;
  /** Как называется продукт на этой технологии. */
  product: string;
  /** Начало описания решения: «… который …» */
  how: string;
  tags: string[];
  skill: SkillKey;
  /** Сложность реализации, 0..100 (сравнивается с навыками персонажа). */
  difficulty: number;
  stack: string;
  lightStack: string;
  risks: string[];
  /** Доступна с начала или открывается новостью. */
  base: boolean;
}

export const TECHNOLOGIES: TechDef[] = [
  {
    id: 'llm_assistant', name: 'языковые модели', product: 'ИИ-ассистент', how: 'Веб-ассистент на основе языковой модели, который',
    tags: ['text', 'documents', 'learning', 'knowledge', 'career', 'content', 'service', 'sales'], skill: 'ai', difficulty: 40,
    stack: 'API языковой модели + простой веб-интерфейс + шаблоны промптов', lightStack: 'готовый конструктор чат-ассистентов',
    risks: ['Модель может ошибаться и выдумывать факты — нужна проверка человеком', 'Стоимость запросов к модели при росте пользователей'], base: true,
  },
  {
    id: 'chatbot', name: 'чат-боты в мессенджерах', product: 'Телеграм-бот', how: 'Бот в мессенджере, который',
    tags: ['chat', 'small_business', 'service', 'retail', 'scheduling', 'freelance'], skill: 'programming', difficulty: 30,
    stack: 'бот-фреймворк + небольшая база данных', lightStack: 'конструктор ботов без кода',
    risks: ['Пользователи могут не захотеть ещё одного бота', 'Зависимость от правил платформы мессенджера'], base: true,
  },
  {
    id: 'automation', name: 'автоматизация и no-code', product: 'Автоматизация', how: 'Набор автоматизаций (скрипты и no-code сценарии), который',
    tags: ['automation', 'data', 'finance', 'productivity', 'documents', 'freelance'], skill: 'programming', difficulty: 25,
    stack: 'скрипты на Python + планировщик задач', lightStack: 'no-code сервисы автоматизации и таблицы',
    risks: ['Сценарии ломаются при изменении форматов данных', 'Сложно масштабировать как продукт — похоже на услугу'], base: true,
  },
  {
    id: 'dashboard', name: 'дашборды и аналитика', product: 'Сервис-дашборд', how: 'Небольшой веб-сервис с дашбордом, который',
    tags: ['data', 'forecast', 'finance', 'small_business', 'productivity'], skill: 'analytics', difficulty: 35,
    stack: 'веб-приложение + база данных + графики', lightStack: 'BI-инструмент поверх таблиц',
    risks: ['Пользователи не готовы регулярно вносить данные', 'Качество выводов зависит от качества исходных данных'], base: true,
  },
  {
    id: 'forecasting', name: 'простое прогнозирование', product: 'Прогнозист', how: 'Сервис прогнозирования на исторических данных, который',
    tags: ['forecast', 'data', 'small_business', 'retail'], skill: 'analytics', difficulty: 45,
    stack: 'Python + простая модель временных рядов + веб-отчёт', lightStack: 'таблица с формулами и сезонностью',
    risks: ['На маленьких данных прогноз будет неточным', 'Нужна история продаж, которой может не быть'], base: true,
  },
  {
    id: 'marketplace', name: 'площадки-посредники', product: 'Площадка', how: 'Площадка, которая',
    tags: ['marketplace', 'freelance', 'career', 'scheduling', 'retail'], skill: 'sales', difficulty: 50,
    stack: 'веб-приложение с профилями и откликами', lightStack: 'сообщество в мессенджере + таблица заявок',
    risks: ['Проблема курицы и яйца: нужны обе стороны одновременно', 'Сложно удержать сделки на площадке'], base: true,
  },
  {
    id: 'speech', name: 'распознавание речи', product: 'Голосовой помощник', how: 'Сервис распознавания речи с ИИ-обработкой, который',
    tags: ['voice', 'meetings', 'text', 'productivity'], skill: 'ai', difficulty: 45,
    stack: 'API распознавания речи + языковая модель для выжимки', lightStack: 'готовый сервис расшифровки + шаблоны',
    risks: ['Конфиденциальность записей разговоров', 'Качество на шумных записях'], base: false,
  },
  {
    id: 'vision', name: 'компьютерное зрение', product: 'Камера-помощник', how: 'Приложение с распознаванием изображений, которое',
    tags: ['counting', 'retail', 'small_business', 'documents'], skill: 'ai', difficulty: 60,
    stack: 'мобильное приложение + модель распознавания изображений', lightStack: 'готовое API распознавания текста на фото',
    risks: ['Ошибки распознавания на реальных фото', 'Нужно оборудование или привычка фотографировать'], base: false,
  },
  {
    id: 'rag', name: 'поиск по документам с ИИ', product: 'Умный поиск', how: 'Поиск по документам с языковой моделью, который',
    tags: ['documents', 'knowledge', 'service', 'learning', 'text'], skill: 'ai', difficulty: 50,
    stack: 'векторный поиск + языковая модель + загрузка документов', lightStack: 'готовый сервис «чат с документами»',
    risks: ['Документы бывают устаревшими — ответы тоже', 'Безопасность внутренних данных компании'], base: false,
  },
  {
    id: 'agents', name: 'ИИ-агенты', product: 'ИИ-агент', how: 'ИИ-агент, который сам выполняет цепочку шагов и',
    tags: ['automation', 'productivity', 'sales', 'finance', 'text', 'scheduling'], skill: 'ai', difficulty: 65,
    stack: 'языковая модель с инструментами + интеграции с сервисами пользователя', lightStack: 'готовая платформа агентов + ручной контроль',
    risks: ['Агент может совершить ошибочное действие — нужен контроль', 'Технология быстро меняется'], base: false,
  },
];

export const BASE_TECHNOLOGIES = TECHNOLOGIES.filter((t) => t.base).map((t) => t.id);

export const problemById = new Map(PROBLEMS.map((p) => [p.id, p]));
export const techById = new Map(TECHNOLOGIES.map((t) => [t.id, t]));
