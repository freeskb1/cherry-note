/**
 * 폰 시계 앱으로 "진짜 알람" (무음에서도 울림)
 * - 아이폰: 단축어 '준비노트알람' 실행. 입력 = 측정까지 남은 분(예: "120") → 그만큼 타이머 시작
 * - 안드로이드: 시계 앱에 그 시각 알람 (기종에 따라 막힐 수 있음)
 * 모드는 폰마다 따로 저장 (localStorage)
 *   button: 사진 저장 안내·종 버튼에서 눌러서 맞춤 (기본)
 *   auto  : 사진을 찍으면 바로 맞춤
 */
import { isIOS } from './util';

export type AlarmMode = 'button' | 'auto';
export const SHORTCUT_NAME = '준비노트알람';
const KEY = 'cherry.alarmMode';

export function getAlarmMode(): AlarmMode {
  try {
    return localStorage.getItem(KEY) === 'auto' ? 'auto' : 'button';
  } catch {
    return 'button';
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

function shortcutUrl(minutes: number): string {
  return `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=${minutes}`;
}

export function phoneAlarmUrl(at: number, label: string): string | null {
  if (isIOS()) return shortcutUrl(Math.max(1, Math.ceil((at - Date.now()) / 60000)));
  if (isAndroid()) {
    const d = new Date(at);
    return (
      'intent:#Intent;action=android.intent.action.SET_ALARM;' +
      `i.android.intent.extra.alarm.HOUR=${d.getHours()};` +
      `i.android.intent.extra.alarm.MINUTES=${d.getMinutes()};` +
      `S.android.intent.extra.alarm.MESSAGE=${encodeURIComponent(label)};` +
      'B.android.intent.extra.alarm.SKIP_UI=true;end'
    );
  }
  return null;
}

/** 시계 앱 알람/타이머 맞추기. 지난 시각이면 아무것도 안 함 */
export function openPhoneAlarm(at: number, label = '혈당 측정'): boolean {
  if (at <= Date.now()) return false;
  const url = phoneAlarmUrl(at, label);
  if (!url) return false;
  window.location.href = url;
  return true;
}

/** 설정 화면 테스트: 1분 뒤 */
export function testPhoneAlarm(): boolean {
  return openPhoneAlarm(Date.now() + 60_000 + 1000, '알람 테스트');
}

const SETUP_KEY = 'cherry.shortcutReady';
export function isShortcutReady(): boolean {
  try {
    return localStorage.getItem(SETUP_KEY) === '1';
  } catch {
    return false;
  }
}
export function setShortcutReady(v: boolean) {
  try {
    if (v) localStorage.setItem(SETUP_KEY, '1');
    else localStorage.removeItem(SETUP_KEY);
  } catch {
    /* 무시 */
  }
}
