/**
 * 폰 시계 앱에 "진짜 알람" 맞추기
 * - 아이폰: 단축어 '체리알람'을 실행 (입력: "HH:MM")
 * - 안드로이드: 시계 앱 알람 설정 인텐트 (기종에 따라 막힐 수 있음)
 * 설정은 폰마다 따로 저장 (localStorage)
 */
import { isIOS } from './util';

export type AlarmMode = 'off' | 'button' | 'auto';
export const SHORTCUT_NAME = '체리알람';
const KEY = 'cherry.alarmMode';

export function getAlarmMode(): AlarmMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'button' || v === 'auto' ? v : 'off';
  } catch {
    return 'off';
  }
}

export function setAlarmMode(m: AlarmMode) {
  try {
    localStorage.setItem(KEY, m);
  } catch {
    /* 저장 안 돼도 이번 세션만 영향 */
  }
}

export function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

export function phoneAlarmSupported(): boolean {
  return isIOS() || isAndroid();
}

export function phoneAlarmUrl(at: number, label: string): string | null {
  const d = new Date(at);
  const h = d.getHours();
  const m = d.getMinutes();
  const hhmm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  if (isIOS()) {
    return `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(hhmm)}`;
  }
  if (isAndroid()) {
    return (
      'intent:#Intent;action=android.intent.action.SET_ALARM;' +
      `i.android.intent.extra.alarm.HOUR=${h};` +
      `i.android.intent.extra.alarm.MINUTES=${m};` +
      `S.android.intent.extra.alarm.MESSAGE=${encodeURIComponent(label)};` +
      'B.android.intent.extra.alarm.SKIP_UI=true;end'
    );
  }
  return null;
}

/** 시계 앱 알람 맞추기. 지난 시각이면 아무것도 안 함 */
export function openPhoneAlarm(at: number, label = '체리 혈당 측정'): boolean {
  if (at <= Date.now()) return false;
  const url = phoneAlarmUrl(at, label);
  if (!url) return false;
  window.location.href = url;
  return true;
}
