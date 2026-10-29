import { useRef, useState } from 'react';
import { useGame } from '../app/useGame';
import { DEFAULT_AVATAR, type AvatarConfig } from '../sim/seed';
import { skillName } from '../sim/social';
import type { SkillKey, TraitKey } from '../sim/types';
import { isSaveFile } from '../storage/saveFile';
import { download, Modal } from './common';

const TRAITS: [TraitKey, string][] = [
  ['curiosity', 'Любознательность'],
  ['ambition', 'Амбициозность'],
  ['caution', 'Осторожность'],
  ['impulsivity', 'Импульсивность'],
  ['discipline', 'Дисциплина'],
  ['sociability', 'Общительность'],
  ['creativity', 'Креативность'],
  ['greed', 'Ориентация на деньги'],
  ['leisure', 'Ценит свободное время'],
  ['empathy', 'Эмпатия'],
];

export function Settings({ onClose }: { onClose: () => void }) {
  const { game } = useGame();
  const w = game.world;
  const [name, setName] = useState(w.characters.player_avatar.name);
  const [cfg, setCfg] = useState<AvatarConfig>(() => structuredClone({ ...DEFAULT_AVATAR, name: w.settings.avatarName }));
  const [seed, setSeed] = useState(String(Math.floor(Math.random() * 1_000_000)));
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const ai = game.storage.ai;

  const doExport = async () => {
    const save = await game.exportSave();
    if (!save) return setMsg('Нечего экспортировать');
    download(`parallel-life-save-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(save), 'application/json');
  };
  const doImport = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      if (!isSaveFile(data)) throw new Error('Файл не похож на сохранение «Параллельной жизни»');
      await game.importSave(data);
      setMsg('Сохранение загружено. Время на паузе.');
    } catch (e) {
      setMsg(`Ошибка импорта: ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <Modal title="⚙ Настройки" onClose={onClose} wide>
      <div className="settings">
        <section className="card">
          <h3>Главный персонаж</h3>
          <div className="row">
            <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Имя персонажа" />
            <button className="btn" onClick={() => { game.renameAvatar(name); setMsg('Имя изменено'); }} disabled={!name.trim()}>
              Переименовать
            </button>
          </div>
          <p className="small muted">Имя меняется сразу в текущем мире. Стартовые черты и навыки задаются при создании нового мира (ниже).</p>
        </section>

        <section className="card">
          <h3>Хранилище и сохранения</h3>
          <p className="small">
            Сейчас: <b>{game.storage.label}</b>
            {game.lastSavedAt && <> · последнее сохранение {new Date(game.lastSavedAt).toLocaleTimeString('ru-RU')}</>}
          </p>
          {game.storage.kind === 'browser' && (
            <p className="small warn-text">
              Сервер не найден, данные хранятся в localStorage этого браузера (полная история событий ограничена). Для SQLite запустите приложение командой <code>npm run dev</code> или <code>npm start</code>.
            </p>
          )}
          <p className="small muted">
            Мир: {w.worldId} · seed {w.seed} · шаг {w.stats.ticks}
          </p>
          <div className="row wrap">
            <button className="btn" onClick={() => void game.save().then(() => setMsg('Сохранено'))}>
              Сохранить сейчас
            </button>
            <button className="btn" onClick={doExport}>
              ⬇ Экспорт сохранения
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              ⬆ Импорт сохранения
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && void doImport(e.target.files[0])} />
          </div>
        </section>

        <section className="card">
          <h3>Искусственный интеллект</h3>
          <p className="small">
            {ai?.note ?? 'Языковая модель не подключена. Идеи, диалоги и объяснения создаются правилами и шаблонами.'}
          </p>
          <p className="small muted">Как подключить модель в будущем — см. раздел «ИИ» в README.</p>
        </section>

        <section className="card">
          <h3>Новый мир</h3>
          <p className="small muted">
            Текущий мир и его история событий будут удалены. Архив идей сохранится. Одинаковый seed и одинаковые стартовые параметры дают одинаковое развитие мира.
          </p>
          <div className="row wrap">
            <label className="small">
              Имя <input className="input" value={cfg.name} onChange={(e) => setCfg({ ...cfg, name: e.target.value })} />
            </label>
            <label className="small">
              Возраст <input className="input num" type="number" min={16} max={70} value={cfg.age} onChange={(e) => setCfg({ ...cfg, age: Number(e.target.value) })} />
            </label>
            <label className="small">
              Сбережения <input className="input num" type="number" min={0} step={10000} value={cfg.money} onChange={(e) => setCfg({ ...cfg, money: Number(e.target.value) })} />
            </label>
            <label className="small">
              Seed <input className="input num" value={seed} onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))} />
            </label>
          </div>
          <div className="grid2">
            <div>
              <h4>Черты (0–100)</h4>
              {TRAITS.map(([k, label]) => (
                <label key={k} className="slider">
                  <span>{label}</span>
                  <input type="range" min={0} max={100} value={Math.round(cfg.traits[k] * 100)} onChange={(e) => setCfg({ ...cfg, traits: { ...cfg.traits, [k]: Number(e.target.value) / 100 } })} />
                  <span className="num">{Math.round(cfg.traits[k] * 100)}</span>
                </label>
              ))}
            </div>
            <div>
              <h4>Навыки (0–100)</h4>
              {(Object.keys(cfg.skills) as SkillKey[]).map((k) => (
                <label key={k} className="slider">
                  <span>{skillName(k)}</span>
                  <input type="range" min={0} max={100} value={Math.round(cfg.skills[k])} onChange={(e) => setCfg({ ...cfg, skills: { ...cfg.skills, [k]: Number(e.target.value) } })} />
                  <span className="num">{Math.round(cfg.skills[k])}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="row wrap">
            <button className="btn ghost" onClick={() => setCfg(structuredClone({ ...DEFAULT_AVATAR, name: cfg.name }))}>
              Сбросить к значениям по умолчанию
            </button>
            {!confirmReset ? (
              <button className="btn danger" onClick={() => setConfirmReset(true)}>
                Создать новый мир…
              </button>
            ) : (
              <>
                <span className="small warn-text">Точно? Текущий мир будет удалён.</span>
                <button
                  className="btn danger"
                  onClick={async () => {
                    await game.newWorld({ seed: Number(seed) || 1, avatar: { ...cfg, name: cfg.name.trim() || 'Даня' } });
                    setConfirmReset(false);
                    setMsg('Новый мир создан');
                  }}
                >
                  Да, создать
                </button>
                <button className="btn ghost" onClick={() => setConfirmReset(false)}>
                  Отмена
                </button>
              </>
            )}
          </div>
        </section>
        {msg && <div className="toast inline">{msg}</div>}
      </div>
    </Modal>
  );
}
