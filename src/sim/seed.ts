import type {
  Appearance,
  Character,
  Goal,
  GoalType,
  Job,
  Org,
  Rank,
  Relation,
  RelationKind,
  SkillKey,
  Skills,
  Traits,
  World,
} from './types';
import { CURRENT_WORLD_VERSION } from './migrate';
import { BASE_TECHNOLOGIES } from './ideas/catalog';
import { relationKey, recomputeKind } from './social';

// Стартовый мир: 20 жителей + виртуальная версия пользователя (player_avatar).

export const AVATAR_ID = 'player_avatar';

export interface AvatarConfig {
  name: string;
  age: number;
  traits: Traits;
  skills: Skills;
  money: number;
}

export const DEFAULT_AVATAR: AvatarConfig = {
  name: 'Даня',
  age: 27,
  traits: {
    ambition: 0.65,
    caution: 0.4,
    sociability: 0.55,
    curiosity: 0.9,
    discipline: 0.5,
    impulsivity: 0.45,
    greed: 0.5,
    leisure: 0.55,
    empathy: 0.55,
    creativity: 0.75,
  },
  skills: {
    programming: 35,
    ai: 42,
    analytics: 45,
    management: 15,
    sales: 15,
    design: 22,
    communication: 40,
    finance: 25,
    service: 20,
  },
  money: 60000,
};

const T0: Traits = {
  ambition: 0.5,
  caution: 0.5,
  sociability: 0.5,
  curiosity: 0.5,
  discipline: 0.5,
  impulsivity: 0.4,
  greed: 0.5,
  leisure: 0.5,
  empathy: 0.5,
  creativity: 0.4,
};

const S0: Skills = {
  programming: 5,
  ai: 5,
  analytics: 10,
  management: 10,
  sales: 10,
  design: 5,
  communication: 30,
  finance: 15,
  service: 15,
};

const ORGS: Org[] = [
  {
    id: 'org_nordcode',
    name: 'Северный Код',
    kind: 'company',
    locationId: 'office',
    ownerId: 'arkady',
    balance: 4_000_000,
    baseRevenue: 62000,
    baseCost: 14000,
    reputation: 70,
    openings: [],
    workHours: [9, 18],
    weekends: false,
    visitPrice: 0,
    history: [],
  },
  {
    id: 'org_fintrust',
    name: 'ФинТраст',
    kind: 'company',
    locationId: 'office',
    ownerId: undefined,
    balance: 3_000_000,
    baseRevenue: 46000,
    baseCost: 12000,
    reputation: 60,
    openings: [],
    workHours: [9, 18],
    weekends: false,
    visitPrice: 0,
    history: [],
  },
  {
    id: 'org_cafe',
    name: 'Кафе «Зерно»',
    kind: 'cafe',
    locationId: 'cafe',
    ownerId: 'marina',
    balance: 250_000,
    baseRevenue: 9000,
    baseCost: 6000,
    reputation: 55,
    openings: [],
    workHours: [8, 22],
    weekends: true,
    visitPrice: 450,
    history: [],
  },
  {
    id: 'org_shop',
    name: 'Магазин «Рядом»',
    kind: 'shop',
    locationId: 'shop',
    ownerId: 'rustam',
    balance: 300_000,
    baseRevenue: 9500,
    baseCost: 6500,
    reputation: 50,
    openings: [],
    workHours: [8, 21],
    weekends: true,
    visitPrice: 900,
    history: [],
  },
  {
    id: 'org_hive',
    name: 'Коворкинг «Улей»',
    kind: 'coworking',
    locationId: 'coworking',
    ownerId: 'igor',
    balance: 400_000,
    baseRevenue: 7000,
    baseCost: 5500,
    reputation: 60,
    openings: [],
    workHours: [9, 21],
    weekends: true,
    visitPrice: 350,
    history: [],
  },
  {
    id: 'org_pixel',
    name: 'Агентство «Пиксель»',
    kind: 'agency',
    locationId: 'coworking',
    ownerId: 'vera',
    balance: 600_000,
    baseRevenue: 17000,
    baseCost: 4500,
    reputation: 55,
    openings: [],
    workHours: [10, 19],
    weekends: false,
    visitPrice: 0,
    history: [],
  },
  {
    id: 'org_uni',
    name: 'Городской университет',
    kind: 'university',
    locationId: 'university',
    ownerId: undefined,
    balance: 2_000_000,
    baseRevenue: 16000,
    baseCost: 9000,
    reputation: 75,
    openings: [],
    workHours: [9, 17],
    weekends: false,
    visitPrice: 0,
    history: [],
  },
];

interface CharSpec {
  id: string;
  name: string;
  age: number;
  archetype: string;
  bio: string;
  profession: string;
  look: Appearance;
  traits: Partial<Traits>;
  skills: Partial<Skills>;
  money: number;
  housing: Character['housing'];
  homeId: string;
  job?: { orgId: string; title: string; rank: Rank; salary: number; skill: SkillKey; performance?: number };
  student?: boolean;
  freelancer?: boolean;
  reputation: number;
  influence: number;
  goals: [GoalType, string, number, string?][];
  livingCost?: number;
  debt?: number;
}

const ROOM = (rent = 22000): Character['housing'] => ({ kind: 'room', rent, label: 'Комната в квартире' });
const FLAT = (rent = 45000): Character['housing'] => ({ kind: 'apartment', rent, label: 'Однокомнатная квартира' });
const LOFT = (rent = 90000): Character['housing'] => ({ kind: 'loft', rent, label: 'Лофт у набережной' });
const PARENTS: Character['housing'] = { kind: 'parents', rent: 0, label: 'Живёт с родителями' };
const DORM: Character['housing'] = { kind: 'room', rent: 4000, label: 'Комната в общежитии' };

const SPECS: CharSpec[] = [
  {
    id: 'arkady', name: 'Аркадий Волков', age: 52, archetype: 'Влиятельный основатель',
    bio: 'Основал «Северный Код» пятнадцать лет назад. Ценит статус, связи и контроль.',
    profession: 'Основатель IT-компании',
    look: { skin: '#e8b892', hair: '#9a9a9a', hairStyle: 'short', shirt: '#2b3a55', pants: '#1c1c24', accessory: 'glasses' },
    traits: { ambition: 0.85, caution: 0.6, sociability: 0.6, greed: 0.8, leisure: 0.25, discipline: 0.8, empathy: 0.3 },
    skills: { management: 85, sales: 70, finance: 70, programming: 40, communication: 75, analytics: 50 },
    money: 3_500_000, housing: LOFT(120000), homeId: 'home_lofts',
    job: { orgId: 'org_nordcode', title: 'Владелец', rank: 'owner', salary: 0, skill: 'management', performance: 75 },
    reputation: 80, influence: 85,
    goals: [['grow_project', 'Удвоить выручку «Северного Кода»', 0.8], ['make_friends', 'Укреплять полезные связи', 0.5]],
  },
  {
    id: 'olga', name: 'Ольга Миронова', age: 41, archetype: 'Осторожный руководитель',
    bio: 'Руководит аналитикой в «ФинТрасте». Избегает риска, строит карьеру шаг за шагом.',
    profession: 'Руководитель аналитики',
    look: { skin: '#f0c8a8', hair: '#5a3a22', hairStyle: 'bun', shirt: '#6b4a7a', pants: '#2a2a35' },
    traits: { ambition: 0.6, caution: 0.85, discipline: 0.85, impulsivity: 0.1, greed: 0.55, leisure: 0.35, empathy: 0.5 },
    skills: { analytics: 78, management: 70, finance: 65, communication: 60, ai: 20 },
    money: 900_000, housing: FLAT(55000), homeId: 'home_flats',
    job: { orgId: 'org_fintrust', title: 'Руководитель отдела аналитики', rank: 'manager', salary: 230000, skill: 'management', performance: 72 },
    reputation: 65, influence: 50,
    goals: [['save_money', 'Накопить подушку на два года', 0.6, '2000000'], ['promotion', 'Стать директором по данным', 0.4]],
  },
  {
    id: 'kirill', name: 'Кирилл Савин', age: 29, archetype: 'Амбициозный импульсивный разработчик',
    bio: 'Сильный программист. Мечтает о своём стартапе и часто бросается в новое, не досчитав риски.',
    profession: 'Старший разработчик',
    look: { skin: '#e9c09a', hair: '#1f1a17', hairStyle: 'curly', shirt: '#2f6b4f', pants: '#22303a' },
    traits: { ambition: 0.9, impulsivity: 0.8, caution: 0.2, curiosity: 0.7, creativity: 0.7, greed: 0.6, discipline: 0.45 },
    skills: { programming: 78, ai: 45, analytics: 40, design: 25, communication: 40, management: 25 },
    money: 380_000, housing: FLAT(48000), homeId: 'home_flats',
    job: { orgId: 'org_nordcode', title: 'Старший разработчик', rank: 'senior', salary: 170000, skill: 'programming', performance: 70 },
    reputation: 55, influence: 25,
    goals: [['start_project', 'Запустить собственный продукт', 0.8], ['find_partner', 'Найти сооснователя', 0.5]],
  },
  {
    id: 'lena', name: 'Лена Ковалёва', age: 24, archetype: 'Ценит свободное время',
    bio: 'Пишет код аккуратно, но строго до 18:00. Важнее всего — жизнь вне работы.',
    profession: 'Разработчик',
    look: { skin: '#f3d2b5', hair: '#c8763a', hairStyle: 'long', shirt: '#7aa5c9', pants: '#30343f' },
    traits: { ambition: 0.3, leisure: 0.9, sociability: 0.7, caution: 0.55, discipline: 0.6, greed: 0.3, empathy: 0.7 },
    skills: { programming: 58, design: 35, communication: 50, ai: 25 },
    money: 140_000, housing: ROOM(26000), homeId: 'home_flats',
    job: { orgId: 'org_nordcode', title: 'Разработчик', rank: 'specialist', salary: 110000, skill: 'programming', performance: 65 },
    reputation: 45, influence: 15,
    goals: [['free_time', 'Работать меньше, жить больше', 0.8], ['make_friends', 'Больше видеться с друзьями', 0.6]],
  },
  {
    id: 'timur', name: 'Тимур Ахметов', age: 22, archetype: 'Голодный до роста стажёр',
    bio: 'Стажёр в «Северном Коде». Готов работать допоздна, чтобы быстрее вырасти.',
    profession: 'Стажёр-разработчик',
    look: { skin: '#d9a77f', hair: '#14110f', hairStyle: 'short', shirt: '#c9a227', pants: '#2b2b2b' },
    traits: { ambition: 0.9, discipline: 0.75, leisure: 0.2, greed: 0.6, curiosity: 0.6, caution: 0.4 },
    skills: { programming: 38, ai: 22, analytics: 20, communication: 30 },
    money: 35_000, housing: DORM, homeId: 'home_dorm',
    job: { orgId: 'org_nordcode', title: 'Стажёр', rank: 'intern', salary: 45000, skill: 'programming', performance: 60 },
    reputation: 25, influence: 5,
    goals: [['promotion', 'Получить позицию специалиста', 0.9], ['learn_skill', 'Подтянуть программирование', 0.6, 'programming']],
  },
  {
    id: 'marina', name: 'Марина Белова', age: 38, archetype: 'Владелица небольшого бизнеса',
    bio: 'Держит кафе «Зерно». Знает всех постоянных гостей по имени, но выручка нестабильна.',
    profession: 'Владелица кафе',
    look: { skin: '#f1c6a2', hair: '#3b2416', hairStyle: 'bun', shirt: '#a0453a', pants: '#3a2f2a' },
    traits: { empathy: 0.85, sociability: 0.8, caution: 0.5, discipline: 0.7, ambition: 0.5, leisure: 0.3 },
    skills: { service: 80, management: 50, sales: 45, finance: 35, communication: 70 },
    money: 160_000, housing: FLAT(42000), homeId: 'home_flats',
    job: { orgId: 'org_cafe', title: 'Владелица', rank: 'owner', salary: 0, skill: 'service', performance: 70 },
    reputation: 60, influence: 35,
    goals: [['grow_project', 'Сделать кафе стабильно прибыльным', 0.8]],
  },
  {
    id: 'rustam', name: 'Рустам Каримов', age: 47, archetype: 'Осторожный лавочник',
    bio: 'Двадцать лет держит магазин у дома. Не доверяет новомодным сервисам.',
    profession: 'Владелец магазина',
    look: { skin: '#c99872', hair: '#2a2420', hairStyle: 'bald', shirt: '#4f6a3a', pants: '#2a2a2a' },
    traits: { caution: 0.9, discipline: 0.8, curiosity: 0.2, impulsivity: 0.1, greed: 0.6, sociability: 0.45 },
    skills: { service: 65, finance: 50, sales: 55, management: 40 },
    money: 420_000, housing: FLAT(40000), homeId: 'home_flats',
    job: { orgId: 'org_shop', title: 'Владелец', rank: 'owner', salary: 0, skill: 'sales', performance: 65 },
    reputation: 55, influence: 30,
    goals: [['save_money', 'Отложить на ремонт магазина', 0.7, '700000']],
  },
  {
    id: 'vera', name: 'Вера Лисицына', age: 34, archetype: 'Энергичная предпринимательница',
    bio: 'Основала маркетинговое агентство «Пиксель». Всегда ищет новых клиентов и партнёров.',
    profession: 'Основательница агентства',
    look: { skin: '#f4cfb0', hair: '#111111', hairStyle: 'long', shirt: '#d0567a', pants: '#1f1f2a' },
    traits: { ambition: 0.85, sociability: 0.9, greed: 0.7, impulsivity: 0.5, caution: 0.35, creativity: 0.7 },
    skills: { sales: 75, communication: 80, management: 55, design: 45, ai: 30 },
    money: 520_000, housing: FLAT(60000), homeId: 'home_lofts',
    job: { orgId: 'org_pixel', title: 'Основательница', rank: 'entrepreneur', salary: 0, skill: 'sales', performance: 72 },
    reputation: 65, influence: 55,
    goals: [['grow_project', 'Вырастить агентство до 10 клиентов', 0.8], ['find_partner', 'Найти технического партнёра', 0.5]],
  },
  {
    id: 'max', name: 'Макс Орлов', age: 31, archetype: 'Свободный дизайнер',
    bio: 'Дизайнер-фрилансер. Работает из коворкинга или кафе, дорожит свободой больше денег.',
    profession: 'Дизайнер-фрилансер',
    look: { skin: '#e6b58f', hair: '#d8c06a', hairStyle: 'long', shirt: '#4a4a7a', pants: '#3a3a3a', accessory: 'glasses' },
    traits: { leisure: 0.75, creativity: 0.9, curiosity: 0.7, sociability: 0.6, greed: 0.3, discipline: 0.4 },
    skills: { design: 80, communication: 55, sales: 35, ai: 30 },
    money: 210_000, housing: ROOM(30000), homeId: 'home_flats', freelancer: true,
    reputation: 50, influence: 25,
    goals: [['free_time', 'Работать на своих условиях', 0.7], ['save_money', 'Отложить на путешествие', 0.4, '300000']],
  },
  {
    id: 'sonya', name: 'Соня Петрова', age: 26, archetype: 'Фрилансер-маркетолог',
    bio: 'Пишет тексты и ведёт соцсети для малого бизнеса. Мечтает о стабильных клиентах.',
    profession: 'Маркетолог-фрилансер',
    look: { skin: '#f6d7bd', hair: '#a8432e', hairStyle: 'curly', shirt: '#e0a33b', pants: '#2e3440' },
    traits: { sociability: 0.75, ambition: 0.6, caution: 0.45, creativity: 0.65, greed: 0.5 },
    skills: { sales: 55, communication: 65, design: 30, ai: 28 },
    money: 70_000, housing: ROOM(24000), homeId: 'home_flats', freelancer: true,
    reputation: 40, influence: 20,
    goals: [['save_money', 'Выйти на стабильный доход', 0.7, '200000'], ['make_friends', 'Нетворкинг с владельцами бизнеса', 0.5]],
  },
  {
    id: 'igor', name: 'Игорь Зуев', age: 45, archetype: 'Хозяин коворкинга и связей',
    bio: 'Держит коворкинг «Улей». Любит сводить людей и знать, кто чем занят.',
    profession: 'Владелец коворкинга',
    look: { skin: '#e2b38d', hair: '#5c5c5c', hairStyle: 'short', shirt: '#7a5a2a', pants: '#2b2b33' },
    traits: { sociability: 0.9, empathy: 0.7, ambition: 0.55, caution: 0.55, curiosity: 0.6 },
    skills: { management: 60, communication: 80, sales: 55, finance: 45 },
    money: 380_000, housing: FLAT(50000), homeId: 'home_lofts',
    job: { orgId: 'org_hive', title: 'Владелец', rank: 'owner', salary: 0, skill: 'management', performance: 68 },
    reputation: 70, influence: 60,
    goals: [['make_friends', 'Собрать сильное сообщество', 0.7], ['grow_project', 'Заполнить коворкинг', 0.6]],
  },
  {
    id: 'natasha', name: 'Наташа Егорова', age: 36, archetype: 'Меняет профессию',
    bio: 'Бухгалтер в «ФинТрасте». Устала от рутины и по вечерам учится анализу данных.',
    profession: 'Бухгалтер',
    look: { skin: '#f2cbb0', hair: '#7a5232', hairStyle: 'bun', shirt: '#5f7f8f', pants: '#2c2c36', accessory: 'glasses' },
    traits: { caution: 0.7, discipline: 0.75, curiosity: 0.6, ambition: 0.55, impulsivity: 0.2 },
    skills: { finance: 70, analytics: 32, communication: 45, ai: 10 },
    money: 260_000, housing: FLAT(40000), homeId: 'home_flats',
    job: { orgId: 'org_fintrust', title: 'Бухгалтер', rank: 'specialist', salary: 95000, skill: 'finance', performance: 66 },
    reputation: 45, influence: 15,
    goals: [['change_career', 'Перейти в аналитику данных', 0.8, 'analytics'], ['learn_skill', 'Освоить аналитику', 0.7, 'analytics']],
  },
  {
    id: 'dmitry', name: 'Дмитрий Соколов', age: 39, archetype: 'Ищет работу',
    bio: 'Опытный продажник. Компанию закрыли, и он уже месяц ищет новую работу.',
    profession: 'Менеджер по продажам',
    look: { skin: '#dcae88', hair: '#3a2b20', hairStyle: 'short', shirt: '#8a8f99', pants: '#24242c' },
    traits: { sociability: 0.65, ambition: 0.55, caution: 0.5, greed: 0.65, discipline: 0.55 },
    skills: { sales: 70, communication: 65, management: 40, finance: 30 },
    money: 85_000, housing: FLAT(38000), homeId: 'home_flats', debt: 40_000,
    reputation: 40, influence: 20,
    goals: [['get_job', 'Найти работу в продажах', 1], ['pay_debt', 'Закрыть кредит', 0.6]],
  },
  {
    id: 'anya', name: 'Аня Рябова', age: 19, archetype: 'Любопытная студентка',
    bio: 'Учится на информатике. Пробует всё подряд — от нейросетей до игр.',
    profession: 'Студентка (информатика)',
    look: { skin: '#f7d9c2', hair: '#2b2b6b', hairStyle: 'short', shirt: '#9b5de5', pants: '#2c2c3a' },
    traits: { curiosity: 0.9, creativity: 0.7, ambition: 0.6, leisure: 0.5, sociability: 0.6, impulsivity: 0.5 },
    skills: { programming: 30, ai: 30, analytics: 15, design: 20 },
    money: 12_000, housing: DORM, homeId: 'home_dorm', student: true,
    reputation: 20, influence: 5,
    goals: [['learn_skill', 'Разобраться в машинном обучении', 0.8, 'ai'], ['get_job', 'Найти стажировку', 0.5]],
  },
  {
    id: 'gleb', name: 'Глеб Морозов', age: 21, archetype: 'Хочет быстро разбогатеть',
    bio: 'Студент-экономист. Верит в быстрые деньги и спорит с теми, кто осторожничает.',
    profession: 'Студент (экономика)',
    look: { skin: '#eebd96', hair: '#e0c070', hairStyle: 'short', shirt: '#c43c3c', pants: '#1e1e26' },
    traits: { greed: 0.9, impulsivity: 0.85, ambition: 0.8, caution: 0.15, sociability: 0.65, empathy: 0.3 },
    skills: { finance: 30, sales: 35, communication: 45 },
    money: 25_000, housing: PARENTS, homeId: 'home_dorm', student: true,
    reputation: 20, influence: 10,
    goals: [['start_project', 'Запустить своё дело до диплома', 0.7], ['save_money', 'Заработать первый миллион', 0.6, '1000000']],
  },
  {
    id: 'lidia', name: 'Лидия Зайцева', age: 58, archetype: 'Профессор-наставник',
    bio: 'Преподаёт анализ данных. Любит находить талантливых студентов и помогать им.',
    profession: 'Преподаватель',
    look: { skin: '#f0cdb4', hair: '#cfcfcf', hairStyle: 'bun', shirt: '#3d5a80', pants: '#2a2a2a', accessory: 'glasses' },
    traits: { empathy: 0.85, discipline: 0.8, curiosity: 0.75, ambition: 0.3, caution: 0.6, greed: 0.2 },
    skills: { analytics: 85, ai: 50, communication: 75, programming: 45 },
    money: 450_000, housing: FLAT(0), homeId: 'home_lofts',
    job: { orgId: 'org_uni', title: 'Доцент', rank: 'senior', salary: 95000, skill: 'analytics', performance: 75 },
    reputation: 75, influence: 45,
    goals: [['make_friends', 'Найти студентов для исследования', 0.6]],
  },
  {
    id: 'artem', name: 'Артём Никитин', age: 28, archetype: 'Нацелен на деньги и статус',
    bio: 'Аналитик в «ФинТрасте». Считает каждую ступень карьеры и не любит, когда его обгоняют.',
    profession: 'Аналитик',
    look: { skin: '#e8bb98', hair: '#20180f', hairStyle: 'short', shirt: '#1f4e79', pants: '#1a1a20' },
    traits: { greed: 0.85, ambition: 0.85, empathy: 0.3, discipline: 0.75, caution: 0.55, sociability: 0.5 },
    skills: { analytics: 60, finance: 50, communication: 45, programming: 25, ai: 20 },
    money: 230_000, housing: FLAT(50000), homeId: 'home_flats',
    job: { orgId: 'org_fintrust', title: 'Аналитик', rank: 'specialist', salary: 115000, skill: 'analytics', performance: 72 },
    reputation: 50, influence: 20,
    goals: [['promotion', 'Стать старшим аналитиком к весне', 0.9], ['save_money', 'Купить машину', 0.5, '900000']],
  },
  {
    id: 'yulia', name: 'Юля Смирнова', age: 30, archetype: 'Из учителей в UX',
    bio: 'Восемь лет работала учительницей. Уволилась, чтобы стать UX-дизайнером, и учится по курсам.',
    profession: 'Начинающий UX-дизайнер',
    look: { skin: '#f5d0b5', hair: '#8b5a3c', hairStyle: 'long', shirt: '#6ab187', pants: '#33333f' },
    traits: { empathy: 0.8, discipline: 0.7, caution: 0.6, curiosity: 0.65, ambition: 0.55 },
    skills: { design: 30, communication: 70, analytics: 20, service: 40 },
    money: 110_000, housing: ROOM(22000), homeId: 'home_dorm',
    reputation: 30, influence: 10,
    goals: [['change_career', 'Стать UX-дизайнером', 0.9, 'design'], ['get_job', 'Найти первую работу в дизайне', 0.7]],
  },
  {
    id: 'oleg', name: 'Олег Фёдоров', age: 44, archetype: 'Выгоревший менеджер',
    bio: 'Менеджер проектов в «Северном Коде». Устал от гонки и всё чаще думает о дауншифтинге.',
    profession: 'Менеджер проектов',
    look: { skin: '#e3b28d', hair: '#4a3a2a', hairStyle: 'short', shirt: '#7d7d5a', pants: '#2a2a2a' },
    traits: { leisure: 0.75, ambition: 0.3, caution: 0.6, empathy: 0.6, discipline: 0.55, greed: 0.4 },
    skills: { management: 72, communication: 65, analytics: 40, programming: 30 },
    money: 700_000, housing: FLAT(52000), homeId: 'home_lofts',
    job: { orgId: 'org_nordcode', title: 'Менеджер проектов', rank: 'manager', salary: 210000, skill: 'management', performance: 58 },
    reputation: 55, influence: 30,
    goals: [['free_time', 'Вернуть баланс работы и жизни', 0.8]],
  },
  {
    id: 'zhenya', name: 'Женя Кравец', age: 33, archetype: 'Офисный сотрудник поддержки',
    bio: 'Работает в поддержке клиентов «Северного Кода». Каждый день видит одни и те же вопросы.',
    profession: 'Специалист поддержки',
    look: { skin: '#eac4a4', hair: '#3a1f1f', hairStyle: 'curly', shirt: '#5a6e8f', pants: '#26262e' },
    traits: { empathy: 0.7, caution: 0.6, sociability: 0.55, ambition: 0.4, discipline: 0.6 },
    skills: { service: 60, communication: 60, analytics: 20, programming: 10 },
    money: 75_000, housing: ROOM(25000), homeId: 'home_dorm',
    job: { orgId: 'org_nordcode', title: 'Специалист поддержки', rank: 'specialist', salary: 70000, skill: 'service', performance: 64 },
    reputation: 35, influence: 10,
    goals: [['promotion', 'Возглавить поддержку', 0.5], ['save_money', 'Накопить на отпуск', 0.5, '150000']],
  },
];

function mkGoal(i: number, ownerId: string, [type, label, priority, target]: [GoalType, string, number, string?]): Goal {
  const numeric = target !== undefined && /^\d+$/.test(target);
  return {
    id: `goal_${ownerId}_${i}`,
    type,
    label,
    target: numeric ? undefined : target,
    targetValue: numeric ? Number(target) : undefined,
    priority,
    progress: 0,
    createdAt: 0,
    status: 'active',
    horizon: priority >= 0.7 ? 'long' : 'short',
  };
}

function mkJob(spec: NonNullable<CharSpec['job']>, org: Org): Job {
  return {
    orgId: spec.orgId,
    title: spec.title,
    rank: spec.rank,
    salary: spec.salary,
    startHour: org.workHours[0],
    endHour: org.workHours[1],
    weekends: org.weekends && (spec.rank === 'owner' || org.kind === 'cafe' || org.kind === 'shop'),
    performance: spec.performance ?? 60,
    hiredAt: -24 * 200,
    hoursToday: 0,
    warnings: 0,
    skill: spec.skill,
  };
}

function baseCharacter(spec: CharSpec, orgs: Record<string, Org>, idx: number): Character {
  const job = spec.job ? mkJob(spec.job, orgs[spec.job.orgId]) : null;
  const rank: Rank = job ? job.rank : spec.student ? 'student' : 'none';
  return {
    id: spec.id,
    name: spec.name,
    age: spec.age,
    isAvatar: false,
    archetype: spec.archetype,
    bio: spec.bio,
    appearance: { accessory: 'none', ...spec.look },
    traits: { ...T0, ...spec.traits },
    skills: { ...S0, ...spec.skills },
    profession: spec.profession,
    rank,
    job,
    student: !!spec.student,
    freelancer: !!spec.freelancer,
    money: spec.money,
    debt: spec.debt ?? 0,
    livingCost: spec.livingCost ?? (spec.housing.kind === 'loft' ? 60000 : spec.student ? 14000 : 26000),
    housing: spec.housing,
    homeId: spec.homeId,
    reputation: spec.reputation,
    influence: spec.influence,
    needs: { energy: 80, satiety: 70, social: 60, fun: 60 },
    mood: 60,
    satisfaction: 55,
    stress: 25,
    goals: spec.goals.map((g, i) => mkGoal(i, spec.id, g)),
    tasks: [],
    locationId: spec.homeId,
    activity: {
      actionId: 'wake',
      label: 'Просыпается',
      state: 'rest',
      locationId: spec.homeId,
      startedAt: 0,
      endsAt: 0,
      icon: '☀',
    },
    memory: [],
    history: [],
    decisions: [],
    projectIds: [],
    planningHour: 7 + (idx % 3),
    lastPlannedDay: -1,
    counters: { groceries: 3 },
    incomeLastMonth: 0,
    expensesLastMonth: 0,
    jobApplications: [],
  };
}

export function createAvatar(cfg: AvatarConfig, orgs: Record<string, Org>): Character {
  const spec: CharSpec = {
    id: AVATAR_ID,
    name: cfg.name,
    age: cfg.age,
    archetype: 'Виртуальная версия пользователя',
    bio:
      'Интересуется ИИ и новыми технологиями, хочет больше самостоятельности и собственных проектов. ' +
      'Предпочитает практику теории и сначала пробует несколько вариантов. Стартовые параметры настраиваются ' +
      'и не являются психологическим портретом реального человека.',
    profession: 'Младший аналитик данных',
    look: { skin: '#eec39e', hair: '#3b2a1e', hairStyle: 'short', shirt: '#e07a2f', pants: '#2d3142', accessory: 'none' },
    traits: cfg.traits,
    skills: cfg.skills,
    money: cfg.money,
    housing: ROOM(25000),
    homeId: 'home_flats',
    job: { orgId: 'org_fintrust', title: 'Младший аналитик', rank: 'specialist', salary: 90000, skill: 'analytics', performance: 60 },
    reputation: 30,
    influence: 10,
    goals: [
      ['explore_ideas', 'Найти идею собственного проекта', 0.8],
      ['learn_skill', 'Прокачать навыки в ИИ', 0.6, 'ai'],
      ['save_money', 'Создать запас на полгода самостоятельности', 0.5, '400000'],
    ],
  };
  const c = baseCharacter(spec, orgs, 1);
  c.isAvatar = true;
  return c;
}

/** Начальные знакомства: [a, b, вид, симпатия a→b, симпатия b→a]. */
const INITIAL_RELATIONS: [string, string, RelationKind, number, number][] = [
  ['arkady', 'oleg', 'colleague', 20, 30],
  ['arkady', 'kirill', 'colleague', 30, 10],
  ['arkady', 'lena', 'colleague', 10, 5],
  ['arkady', 'timur', 'colleague', 15, 40],
  ['arkady', 'zhenya', 'colleague', 5, 10],
  ['arkady', 'igor', 'acquaintance', 35, 40],
  ['arkady', 'olga', 'acquaintance', 25, 30],
  ['kirill', 'lena', 'friend', 55, 50],
  ['kirill', 'timur', 'colleague', 25, 55],
  ['kirill', 'oleg', 'colleague', 15, 20],
  ['lena', 'zhenya', 'colleague', 30, 35],
  ['lena', 'timur', 'colleague', 20, 30],
  ['oleg', 'zhenya', 'colleague', 25, 30],
  ['oleg', 'timur', 'colleague', 15, 25],
  ['olga', 'artem', 'colleague', 25, 35],
  ['olga', 'natasha', 'colleague', 35, 30],
  ['olga', AVATAR_ID, 'colleague', 20, 25],
  ['artem', 'natasha', 'colleague', 10, 20],
  ['artem', AVATAR_ID, 'rival', 0, 5],
  ['natasha', AVATAR_ID, 'colleague', 30, 30],
  [AVATAR_ID, 'max', 'friend', 60, 55],
  [AVATAR_ID, 'kirill', 'acquaintance', 20, 15],
  ['marina', 'rustam', 'acquaintance', 30, 25],
  ['marina', 'igor', 'acquaintance', 30, 35],
  ['anya', 'gleb', 'friend', 40, 50],
  ['lidia', 'anya', 'mentor', 45, 55],
  ['lidia', 'gleb', 'acquaintance', 0, 10],
  ['igor', 'vera', 'friend', 55, 50],
  ['igor', 'max', 'acquaintance', 35, 40],
  ['igor', 'sonya', 'acquaintance', 30, 40],
  ['vera', 'sonya', 'colleague', 35, 45],
  ['vera', 'max', 'acquaintance', 30, 25],
  ['max', 'sonya', 'friend', 45, 50],
  ['dmitry', 'rustam', 'acquaintance', 30, 25],
  ['dmitry', 'marina', 'acquaintance', 20, 25],
  ['yulia', 'max', 'acquaintance', 25, 15],
  ['yulia', 'lidia', 'acquaintance', 30, 35],
  ['lena', 'max', 'acquaintance', 25, 25],
];

function initialRelation(from: string, to: string, kind: RelationKind, affinity: number): Relation {
  const fam = kind === 'friend' || kind === 'mentor' ? 70 : kind === 'colleague' ? 50 : kind === 'rival' ? 45 : 30;
  const r: Relation = {
    from,
    to,
    familiarity: fam,
    affinity,
    trust: Math.max(10, Math.min(80, 25 + affinity * 0.6)),
    respect: 40 + (kind === 'mentor' ? 25 : 0),
    kind,
    metAt: -24 * 100,
    lastInteraction: -24,
    interactions: 10,
    business: false,
  };
  recomputeKind(r, kind === 'colleague');
  if (r.kind === 'friend' || r.kind === 'close_friend') r.announced = r.kind;
  if (kind === 'rival') r.kind = 'rival';
  if (kind === 'mentor') r.kind = 'mentor';
  return r;
}

export interface NewWorldOptions {
  seed?: number;
  avatar?: Partial<AvatarConfig>;
  worldId?: string;
}

export function createWorld(opts: NewWorldOptions = {}): World {
  const seed = (opts.seed ?? 20260907) >>> 0;
  const orgs: Record<string, Org> = {};
  for (const o of ORGS) orgs[o.id] = structuredClone(o);

  const avatarCfg: AvatarConfig = {
    ...DEFAULT_AVATAR,
    ...opts.avatar,
    traits: { ...DEFAULT_AVATAR.traits, ...opts.avatar?.traits },
    skills: { ...DEFAULT_AVATAR.skills, ...opts.avatar?.skills },
  };

  const characters: Record<string, Character> = {};
  const order: string[] = [];
  const avatar = createAvatar(avatarCfg, orgs);
  characters[avatar.id] = avatar;
  order.push(avatar.id);
  SPECS.forEach((s, i) => {
    const c = baseCharacter(s, orgs, i + 2);
    characters[c.id] = c;
    order.push(c.id);
  });

  const relations: Record<string, Relation> = {};
  for (const [a, b, kind, ab, ba] of INITIAL_RELATIONS) {
    relations[relationKey(a, b)] = initialRelation(a, b, kind, ab);
    relations[relationKey(b, a)] = initialRelation(b, a, kind === 'mentor' ? 'acquaintance' : kind, ba);
  }

  // Стартовые вакансии.
  orgs.org_cafe.openings.push({ id: 'open_4', title: 'Бариста', rank: 'specialist', skill: 'service', minSkill: 20, salary: 48000, createdAt: 0 });
  orgs.org_pixel.openings.push({ id: 'open_1', title: 'Менеджер по работе с клиентами', rank: 'specialist', skill: 'sales', minSkill: 50, salary: 95000, createdAt: 0 });
  orgs.org_nordcode.openings.push({ id: 'open_2', title: 'Стажёр-аналитик', rank: 'intern', skill: 'analytics', minSkill: 15, salary: 45000, createdAt: 0 });
  orgs.org_fintrust.openings.push({ id: 'open_3', title: 'Дизайнер интерфейсов', rank: 'specialist', skill: 'design', minSkill: 40, salary: 100000, createdAt: 0 });

  return {
    version: CURRENT_WORLD_VERSION,
    worldId: opts.worldId ?? `world_${seed.toString(36)}_${Date.now().toString(36)}`,
    seed,
    rngState: seed,
    time: 7, // понедельник, 07:00
    startDate: '2026-09-07T00:00:00.000Z',
    characters,
    order,
    relations,
    orgs,
    projects: {},
    agreements: {},
    events: [],
    observations: [],
    ideas: {},
    technologies: [...BASE_TECHNOLOGIES],
    counters: { open: 4 },
    settings: { avatarName: avatarCfg.name, autosaveEveryHours: 6 },
    stats: { ticks: 0, eventsTotal: 0, ideasTotal: 0, externalIn: 0, externalOut: 0 },
  };
}
