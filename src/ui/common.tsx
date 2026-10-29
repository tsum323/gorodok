import { useEffect, type ReactNode } from 'react';

export function Meter({ value, max = 100, label, tone }: { value: number; max?: number; label: string; tone?: 'good' | 'warn' | 'bad' | 'accent' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const t = tone ?? (pct > 60 ? 'good' : pct > 30 ? 'warn' : 'bad');
  return (
    <div className="meter" title={`${label}: ${Math.round(value)}`}>
      <span className="meter-label">{label}</span>
      <span className="meter-track">
        <span className={`meter-fill tone-${t}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="meter-val">{Math.round(value)}</span>
    </div>
  );
}

export function Modal({ title, onClose, children, wide, className }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; className?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <div className={`modal${wide ? ' modal-wide' : ''} ${className ?? ''}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Tag({ children, tone }: { children: ReactNode; tone?: string }) {
  return <span className={`tag${tone ? ` tag-${tone}` : ''}`}>{children}</span>;
}

export function Stars({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <span className="stars" role={onChange ? 'radiogroup' : undefined} aria-label="Оценка">
      {[1, 2, 3, 4, 5].map((v) => (
        <button
          key={v}
          type="button"
          className={`star${v <= value ? ' on' : ''}`}
          disabled={!onChange}
          onClick={() => onChange?.(v === value ? 0 : v)}
          aria-label={`${v} из 5`}
        >
          ★
        </button>
      ))}
    </span>
  );
}

export function download(filename: string, content: string, type = 'text/plain'): void {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
