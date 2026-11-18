import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { isUrl } from './util';

const PATHS: Record<string, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  bag: (<><path d="M6 8h12l-1 12H7z" /><path d="M9 8a3 3 0 0 1 6 0" /></>),
  note: (<><path d="M5 3h10l4 4v14H5z" /><path d="M9 12h6M9 16h6" /></>),
  clip: (<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 12l2 2 4-4" /></>),
  drop: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  search: (<><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>),
  plus: <path d="M12 5v14M5 12h14" />,
  bell: (<><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 20a2 2 0 0 0 4 0" /></>),
  camera: (<><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>),
  image: (<><rect x="4" y="4" width="16" height="16" rx="2" /><circle cx="9" cy="9" r="1.5" /><path d="m20 15-4-4-8 8" /></>),
  check: <path d="m5 12 5 5 9-10" />,
  back: <path d="m15 6-6 6 6 6" />,
  next: <path d="m9 6 6 6-6 6" />,
  gear: (<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>),
  clock: (<><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2" /></>),
  x: <path d="M6 6l12 12M18 6 6 18" />,
};

export function Icon({ name, size = 22, stroke = 1.8, color = 'currentColor' }: { name: string; size?: number; stroke?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

export function Star({ on, size = 18 }: { on?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill={on ? 'var(--star)' : 'none'} stroke={on ? 'var(--star)' : 'var(--line-strong)'} strokeWidth="1.8">
      <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
    </svg>
  );
}

export function StarButton({ on, onToggle }: { on?: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="star-btn" aria-label={on ? '중요 해제' : '중요 표시'} aria-pressed={!!on} onClick={(e) => { e.stopPropagation(); onToggle(); }}>
      <Star on={on} />
    </button>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="search">
      <Icon name="search" size={18} />
      <input type="search" value={value} placeholder={placeholder} aria-label="검색" onChange={(e) => onChange(e.target.value)} />
      {value && (
        <button type="button" className="search-clear" aria-label="검색어 지우기" onClick={() => onChange('')}>
          <Icon name="x" size={16} />
        </button>
      )}
    </label>
  );
}

export function Chips<T extends string>({ items, value, onChange }: { items: { key: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="chips">
      {items.map((it) => (
        <button key={it.key} type="button" className={'chip' + (it.key === value ? ' on' : '')} onClick={() => onChange(it.key)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Seg<T extends string>({ items, value, onChange, small }: { items: { key: T; label: string }[]; value: T; onChange: (v: T) => void; small?: boolean }) {
  return (
    <div className={'seg' + (small ? ' small' : '')} role="radiogroup">
      {items.map((it) => (
        <button key={it.key} type="button" role="radio" aria-checked={it.key === value} className={it.key === value ? 'on' : ''} onClick={() => onChange(it.key)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ open, onClose, children, full }: { open: boolean; onClose: () => void; children: ReactNode; full?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('locked');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('locked');
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className={'sheet' + (full ? ' full' : '')} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label className="lbl" htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

/** 두 번 눌러야 지워지는 삭제 버튼 */
export function DeleteButton({ onDelete }: { onDelete: () => void }) {
  const [ask, setAsk] = useState(false);
  return (
    <>
      <button type="button" className="btn-del" onClick={() => setAsk(true)}>삭제</button>
      {ask && (
        <div className="confirm-wrap" onClick={() => setAsk(false)}>
          <div className="confirm" role="alertdialog" aria-modal="true" aria-label="삭제 확인" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-title">삭제할까요?</div>
            <div className="confirm-body">지우면 되돌릴 수 없어요.</div>
            <div className="confirm-actions">
              <button type="button" className="btn-ghost grow" onClick={() => setAsk(false)}>취소</button>
              <button type="button" className="btn-danger grow" onClick={() => { setAsk(false); onDelete(); }}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** 링크면 눌러서 열리고, 아니면 그냥 글자 */
export function LinkText({ text }: { text?: string }) {
  if (!text) return null;
  if (isUrl(text)) {
    let host = text;
    try {
      host = new URL(text).hostname.replace(/^www\./, '');
    } catch { /* keep */ }
    return (
      <a className="linktext" href={text} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
        {host} ↗
      </a>
    );
  }
  return <span className="linktext">{text}</span>;
}

/** 상태 칩: 누르면 작은 메뉴로 바로 변경 */
export function StatusMenu<T extends string>({
  value, options, labels, tone, onChange,
}: { value: T; options: T[]; labels: Record<T, string>; tone: (v: T) => string; onChange: (v: T) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="status-wrap" onClick={(e) => e.stopPropagation()}>
      <button type="button" className={'status ' + tone(value)} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {labels[value]} ▾
      </button>
      {open && (
        <>
          <div className="menu-cover" onClick={() => setOpen(false)} />
          <div className="menu" role="menu">
            <div className="menu-title">상태 바로 바꾸기</div>
            {options.map((o) => (
              <button key={o} type="button" role="menuitem" className={'menu-item ' + tone(o) + (o === value ? ' cur' : '')} onClick={() => { setOpen(false); if (o !== value) onChange(o); }}>
                {labels[o]}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

export function Fab({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="fab" aria-label={label} onClick={onClick}>
      <Icon name="plus" size={26} stroke={2.2} />
    </button>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {body && <div className="empty-body">{body}</div>}
    </div>
  );
}

/* ── 토스트 ── */
interface ToastAction { label: string; run: () => void }
interface ToastMsg { id: number; text: string; actions?: ToastAction[] }
const ToastCtx = createContext<(text: string, actions?: ToastAction[], ms?: number) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<number>();
  const show = useCallback((text: string, actions?: ToastAction[], ms = 4000) => {
    window.clearTimeout(timer.current);
    setMsg({ id: Date.now(), text, actions });
    timer.current = window.setTimeout(() => setMsg(null), ms);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="toast" role="status" key={msg.id}>
          <Icon name="check" size={18} stroke={2.4} color="var(--toast-ok)" />
          <span className="toast-text">{msg.text}</span>
          {msg.actions?.map((a) => (
            <button key={a.label} type="button" className="toast-act" onClick={() => { setMsg(null); a.run(); }}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </ToastCtx.Provider>
  );
}
