import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';
import { app, db } from './firebase';
import { me } from './data';
import { session } from './session';
import { isIOS, isStandalone } from './util';

export type PushState = 'on' | 'off' | 'denied' | 'unsupported' | 'need-install';

export async function pushState(): Promise<PushState> {
  if (isIOS() && !isStandalone()) return 'need-install';
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  if (!(await isSupported().catch(() => false))) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'granted') return 'on';
  return 'off';
}

async function tokenId(token: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 알림 허용 요청 + 토큰 등록. 버튼 클릭 안에서 불러야 함 */
export async function enablePush(): Promise<PushState> {
  const st = await pushState();
  if (st === 'need-install' || st === 'unsupported' || st === 'denied') return st;
  if (Notification.permission !== 'granted') {
    const p = await Notification.requestPermission();
    if (p !== 'granted') return p === 'denied' ? 'denied' : 'off';
  }
  await registerToken();
  return 'on';
}

/** 이미 허용된 경우 앱 열 때마다 조용히 토큰 갱신 */
export async function registerToken() {
  if ((await pushState()) !== 'on') return;
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: reg,
  });
  if (!token) return;
  if (!session.hid) return;
  await setDoc(doc(db, 'tokens', await tokenId(token)), {
    token,
    householdId: session.hid,
    uid: session.uid,
    user: me(),
    ua: navigator.userAgent.slice(0, 160),
    updatedAt: Date.now(),
  });
}

/** 설정 화면 '알림 테스트': 이 폰에서 바로 알림이 뜨는지 확인 */
export async function testLocalNotification() {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!reg) return false;
  await reg.showNotification('출산 준비노트', { body: '알림이 잘 와요', icon: '/icon-192.png' });
  return true;
}
