// Типы состояния мира «Параллельной жизни».
// Всё состояние — простые сериализуемые объекты (JSON), чтобы его можно было
// сохранять в SQLite / localStorage и переносить между версиями через миграции.

export type CharacterId = string;
export type LocationId = string;
export type OrgId = string;

/** Номер игрового часа от начала мира. Один шаг симуляции = 1 час. */
export type GameTime = number;

export type TraitKey =
  | 'ambition'
  | 'caution'
  | 'sociability'
  | 'curiosity'
  | 'discipline'
  | 'impulsivity'
  | 'greed'
  | 'leisure'
  | 'empathy'
  | 'creativity';

/** Черты характера, 0..1. */
export type Traits = Record<TraitKey, number>;

export type SkillKey =
  | 'programming'
  | 'ai'
  | 'analytics'
  | 'management'
  | 'sales'
  | 'design'
  | 'communication'
  | 'finance'
  | 'service';

/** Навыки, 0..100. */
export type Skills = Record<SkillKey, number>;

/**
 * Профессиональная ступень. Это не единая лестница: богатство, репутация
 * и влияние хранятся отдельно и не выводятся из ранга.
 */
export type Rank =
  | 'none'
  | 'student'
  | 'intern'
  | 'specialist'
  | 'senior'
  | 'manager'
  | 'entrepreneur'
  | 'owner'
  | 'influencer';

export interface Needs {
  /** Бодрость, 0..100. Падает со временем, восстанавливается сном. */
  energy: number;
  /** Сытость, 0..100. */
  satiety: number;
  /** Потребность в общении (100 — насыщена). */
  social: number;
  /** Отдых и удовольствие (100 — насыщен). */
  fun: number;
}

export type ActivityState =
  | 'work'
  | 'rest'
  | 'talk'
  | 'walk'
  | 'think'
  | 'sleep'
  | 'eat'
  | 'study';

export interface Appearance {
  skin: string;
  hair: string;
  hairStyle: 'short' | 'long' | 'bun' | 'bald' | 'curly' | 'cap';
  shirt: string;
  pants: string;
  accessory?: 'glasses' | 'none';
}

export interface Job {
  orgId: OrgId;
  title: string;
  rank: Rank;
  /** Зарплата за месяц, в рублях. */
  salary: number;
  /** Начало и конец рабочего дня (часы). */
  startHour: number;
  endHour: number;
  /** Работает ли по выходным. */
  weekends: boolean;
  /** Эффективность на текущем месте, 0..100. */
  performance: number;
  hiredAt: GameTime;
  /** Часы, отработанные сегодня (сбрасываются в полночь). */
  hoursToday: number;
  /** Предупреждения о низкой эффективности. */
  warnings: number;
  skill: SkillKey;
}

export type GoalType =
  | 'get_job'
  | 'promotion'
  | 'start_project'
  | 'grow_project'
  | 'save_money'
  | 'learn_skill'
  | 'make_friends'
  | 'change_career'
  | 'free_time'
  | 'find_partner'
  | 'pay_debt'
  | 'explore_ideas';

export interface Goal {
  id: string;
  type: GoalType;
  label: string;
  /** Навык, сумма или проект, к которому относится цель. */
  target?: string;
  targetValue?: number;
  priority: number; // 0..1
  progress: number; // 0..100
  createdAt: GameTime;
  status: 'active' | 'done' | 'dropped';
  /** Долгосрочная (амбиция) или текущая цель. */
  horizon: 'long' | 'short';
}

export interface ShortTask {
  id: string;
  label: string;
  dueAt?: GameTime;
  relatedId?: string;
}

export interface Activity {
  actionId: string;
  label: string;
  state: ActivityState;
  locationId: LocationId;
  startedAt: GameTime;
  endsAt: GameTime;
  targetId?: string;
  projectId?: string;
  /** Иконка-индикатор действия для сцены. */
  icon: string;
  /** Пока персонаж в дороге — время прибытия на место действия. */
  arriveAt?: GameTime;
  /** Краткое объяснение выбора (для подробного режима наблюдения). */
  why?: string;
}

export type MemoryKind =
  | 'meeting'
  | 'decision'
  | 'agreement'
  | 'observation'
  | 'conflict'
  | 'failure'
  | 'success'
  | 'conversation';

export interface Memory {
  id: string;
  time: GameTime;
  kind: MemoryKind;
  text: string;
  importance: number; // 0..1
  relatedIds: string[];
}

export interface HistoryEntry {
  time: GameTime;
  text: string;
  eventId?: string;
  kind: 'event' | 'decision' | 'milestone';
}

export interface DecisionAlternative {
  label: string;
  score: number;
}

/** Значимое решение с кратким объяснением. */
export interface Decision {
  id: string;
  time: GameTime;
  choice: string;
  reason: string;
  alternatives: DecisionAlternative[];
  expected: string;
  outcome?: string;
  eventId?: string;
}

export interface Character {
  id: CharacterId;
  name: string;
  age: number;
  isAvatar: boolean;
  archetype: string;
  bio: string;
  appearance: Appearance;
  traits: Traits;
  skills: Skills;
  /** Профессия «по жизни» — может отличаться от текущей должности. */
  profession: string;
  rank: Rank;
  job: Job | null;
  /** Студент, фрилансер и т.п. — дополнительные источники занятости. */
  student: boolean;
  freelancer: boolean;
  money: number;
  debt: number;
  /** Траты на жизнь в месяц, кроме аренды. */
  livingCost: number;
  housing: { kind: 'parents' | 'room' | 'apartment' | 'loft'; rent: number; label: string };
  homeId: LocationId;
  reputation: number; // 0..100
  influence: number; // 0..100
  needs: Needs;
  mood: number; // 0..100
  satisfaction: number; // 0..100
  stress: number; // 0..100
  goals: Goal[];
  tasks: ShortTask[];
  locationId: LocationId;
  activity: Activity;
  memory: Memory[];
  history: HistoryEntry[];
  decisions: Decision[];
  projectIds: string[];
  /** Час, в который персонаж пересматривает свои планы (у каждого свой). */
  planningHour: number;
  lastPlannedDay: number;
  /** Счётчики для правил (кулдауны, ежедневные итоги). */
  counters: Record<string, number>;
  /** Последние данные для экономической сводки. */
  incomeLastMonth: number;
  expensesLastMonth: number;
  /** Признак «ищет работу» (активная заявка). */
  jobApplications: JobApplication[];
}

export interface JobApplication {
  orgId: OrgId;
  openingId: string;
  appliedAt: GameTime;
  decideAt: GameTime;
}

export type RelationKind =
  | 'stranger'
  | 'acquaintance'
  | 'colleague'
  | 'friend'
  | 'close_friend'
  | 'partner'
  | 'mentor'
  | 'rival'
  | 'conflict';

/** Отношение ОТ одного персонажа К другому. Отношения направленные. */
export interface Relation {
  from: CharacterId;
  to: CharacterId;
  familiarity: number; // 0..100
  affinity: number; // -100..100
  trust: number; // 0..100
  respect: number; // 0..100
  kind: RelationKind;
  metAt: GameTime;
  lastInteraction: GameTime;
  interactions: number;
  /** Деловая связь (совместный проект, договорённость). */
  business: boolean;
  /** Какой вид отношений уже был объявлен событием (защита от повторов). */
  announced?: RelationKind;
}

export interface Opening {
  id: string;
  title: string;
  rank: Rank;
  skill: SkillKey;
  minSkill: number;
  salary: number;
  createdAt: GameTime;
}

export interface Org {
  id: OrgId;
  name: string;
  kind: 'company' | 'cafe' | 'shop' | 'coworking' | 'university' | 'agency';
  locationId: LocationId;
  ownerId?: CharacterId;
  balance: number;
  /** Базовая дневная выручка от внешнего рынка при нормальной работе. */
  baseRevenue: number;
  /** Прочие дневные расходы (аренда, закупки). */
  baseCost: number;
  reputation: number;
  openings: Opening[];
  workHours: [number, number];
  weekends: boolean;
  /** Цена услуги для посетителей (кафе, магазин, коворкинг). */
  visitPrice: number;
  history: { time: GameTime; text: string }[];
}

export type ProjectStatus = 'planning' | 'active' | 'launched' | 'paused' | 'failed' | 'abandoned';

export interface Project {
  id: string;
  name: string;
  description: string;
  kind: 'app' | 'ai_tool' | 'service' | 'content' | 'consulting' | 'shop';
  ownerId: CharacterId;
  memberIds: CharacterId[];
  status: ProjectStatus;
  progress: number; // 0..100 до запуска
  quality: number; // 0..100
  /** Пользователи / клиенты после запуска. */
  users: number;
  spent: number;
  revenueTotal: number;
  /** Ожидаемая польза по оценке владельца (не проверенный факт). */
  expectedValue: number;
  createdAt: GameTime;
  launchedAt?: GameTime;
  ideaId?: string;
  agreementId?: string;
  skill: SkillKey;
  tasks: { id: string; label: string; assigneeId: CharacterId; done: boolean }[];
  history: { time: GameTime; text: string; eventId?: string }[];
  lastWorkedAt: GameTime;
}

export interface Agreement {
  id: string;
  kind: 'collaboration' | 'mentorship' | 'loan' | 'help';
  partyIds: CharacterId[];
  terms: string;
  createdAt: GameTime;
  dueAt?: GameTime;
  status: 'active' | 'fulfilled' | 'broken';
  projectId?: string;
  amount?: number;
}

export type EventType =
  | 'met'
  | 'conversation'
  | 'friendship'
  | 'conflict'
  | 'help'
  | 'hired'
  | 'fired'
  | 'quit'
  | 'promoted'
  | 'warning'
  | 'job_search'
  | 'project_started'
  | 'project_joined'
  | 'project_launched'
  | 'project_failed'
  | 'project_abandoned'
  | 'project_milestone'
  | 'collaboration'
  | 'agreement_broken'
  | 'idea'
  | 'goal_changed'
  | 'financial'
  | 'skill_up'
  | 'random'
  | 'business'
  | 'observation'
  | 'decision';

/** Единая запись события. Создаётся только движком. */
export interface WorldEvent {
  id: string;
  /** Порядковый номер — для инкрементального сохранения. */
  seq: number;
  time: GameTime;
  type: EventType;
  participants: CharacterId[];
  locationId?: LocationId;
  /** Краткое описание для ленты. */
  summary: string;
  /** Контекст: что происходило вокруг. */
  context: string;
  /** Причина возникновения. */
  cause: string;
  /** Изменения состояния мира. */
  changes: string[];
  importance: number; // 0..1
  relatedIds: string[];
  /** Короткий диалог, если событие — разговор. */
  dialogue?: { speakerId: CharacterId; text: string }[];
}

/** Наблюдаемая проблема — сырьё для идей. */
export interface Observation {
  id: string;
  problemId: string;
  observerId: CharacterId;
  sourceId?: CharacterId;
  time: GameTime;
  text: string;
  eventId?: string;
  used: boolean;
}

export type IdeaStatus = 'new' | 'interesting' | 'review' | 'in_progress' | 'postponed' | 'rejected';

export interface Idea {
  id: string;
  worldId: string;
  authorId: CharacterId;
  authorName: string;
  title: string;
  description: string;
  gameTime: GameTime;
  gameDate: string;
  createdAt: string; // ISO фактического времени
  reason: string;
  context: string;
  relatedEventIds: string[];
  relatedCharacterIds: string[];
  audience: string;
  problem: string;
  solution: string;
  implementation: string;
  nextStep: string;
  risks: string[];
  /** Оценка персонажа (1..10) — субъективная, не проверенный факт. */
  avatarScore: number;
  avatarComment: string;
  /** Статус внешней проверки. Без реального исследования — всегда not_validated. */
  validation: 'not_validated';
  status: IdeaStatus;
  userRating: number; // 0..5
  userNotes: string;
  favorite: boolean;
  /** Ключ для защиты от дубликатов. */
  signature: string;
  generator: 'rules' | 'llm';
  tags: string[];
  /** Что персонаж потом делал с идеей. */
  timeline: { time: GameTime; text: string }[];
  updatedAt: string;
}

export interface Settings {
  avatarName: string;
  /** Сколько игровых часов в секунду на «обычной» скорости. */
  autosaveEveryHours: number;
}

export interface WorldStats {
  ticks: number;
  eventsTotal: number;
  ideasTotal: number;
  /** Деньги, пришедшие извне (внешний рынок): зарплатный фонд компаний, клиенты. */
  externalIn: number;
  /** Деньги, ушедшие во внешний мир (аренда, еда, закупки). */
  externalOut: number;
}

export interface World {
  version: number;
  worldId: string;
  seed: number;
  rngState: number;
  time: GameTime;
  /** Дата начала мира (ISO, только для отображения календаря). */
  startDate: string;
  characters: Record<CharacterId, Character>;
  order: CharacterId[];
  relations: Record<string, Relation>;
  orgs: Record<OrgId, Org>;
  projects: Record<string, Project>;
  agreements: Record<string, Agreement>;
  /** Последние события (полная история — в хранилище). */
  events: WorldEvent[];
  observations: Observation[];
  /**
   * Идеи главного персонажа, созданные в этом мире. В снимок мира не входят:
   * хранятся в отдельной таблице архива и подмешиваются при загрузке.
   */
  ideas: Record<string, Idea>;
  /** Технологии, о которых в мире уже известно (открываются новостями). */
  technologies: string[];
  counters: Record<string, number>;
  settings: Settings;
  stats: WorldStats;
}

export interface Location {
  id: LocationId;
  name: string;
  kind: 'home' | 'office' | 'cafe' | 'coworking' | 'park' | 'university' | 'shop';
  /** Показывать ли на сцене. Квартиры объединены в «Жилой дом». */
  scene: string;
  description: string;
}
