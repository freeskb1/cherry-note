export const pad = (n: number) => String(n).padStart(2, '0');

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): string {
  return ymd(new Date());
}

export function hm(ts?: number | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function md(ts?: number | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** date(YYYY-MM-DD) + "HH:MM" → timestamp */
export function toTs(date: string, time: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h || 0, mi || 0).getTime();
}

export function remain(ts: number, now = Date.now()): string {
  const diff = ts - now;
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  const txt = h ? `${h}시간 ${m}분` : `${m}분`;
  return diff >= 0 ? `${txt} 남음` : `${txt} 지남`;
}

/** 검색: 항목의 모든 값(숫자, 상태 이름 포함)을 하나의 문자열로 합쳐 비교 */
export function matches(obj: object, q: string, extra: string[] = []): boolean {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = (Object.values(obj).flat().join(' ') + ' ' + extra.join(' ')).toLowerCase();
  const hayDigits = hay.replace(/,/g, '');
  return words.every((w) => hay.includes(w) || hayDigits.includes(w.replace(/,/g, '')));
}

export function isUrl(s?: string): boolean {
  return !!s && /^https?:\/\/\S+$/i.test(s.trim());
}

export function dday(due: string): { left: number; week: number; day: number } {
  const [y, m, d] = due.split('-').map(Number);
  const dueDate = new Date(y, m - 1, d);
  const t = new Date();
  const base = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const left = Math.round((dueDate.getTime() - base.getTime()) / 86400000);
  const passed = 280 - left;
  return { left, week: Math.floor(passed / 7), day: passed % 7 };
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

/** 푸시를 못 켠 경우 대비: 캘린더 알림(.ics) */
export function downloadIcs(title: string, at: number) {
  const f = (ts: number) => new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//cherry-note//KO',
    'BEGIN:VEVENT',
    `UID:${at}-${Math.random().toString(36).slice(2)}@cherry-note`,
    `DTSTAMP:${f(Date.now())}`,
    `DTSTART:${f(at)}`,
    `DTEND:${f(at + 10 * 60000)}`,
    `SUMMARY:${title}`,
    'BEGIN:VALARM',
    'TRIGGER:PT0M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${title}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  downloadBlob(new Blob([ics], { type: 'text/calendar' }), 'cherry-alarm.ics');
}

/** 30 → '30분', 90 → '1시간 30분' */
export function durLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h}시간` : '', m ? `${m}분` : ''].filter(Boolean).join(' ') || '0분';
}
