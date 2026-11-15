import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, nameOf } from './firebase';
import seed from './seed.json';
import { DEFAULT_SETTINGS, Lists, Settings, Sugar } from './types';

export function me(): string {
  return nameOf(auth.currentUser?.email);
}

export function newId(): string {
  return doc(collection(db, '_')).id;
}

/** 컬렉션 전체 실시간 구독 */
export function useCollection<T>(name: string): { rows: T[]; ready: boolean } {
  const [state, setState] = useState<{ rows: T[]; ready: boolean }>({ rows: [], ready: false });
  useEffect(() => {
    return onSnapshot(
      collection(db, name),
      (snap) => setState({ rows: snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as T), ready: true }),
      () => setState((s) => ({ ...s, ready: true }))
    );
  }, [name]);
  return state;
}

export function useDocData<T>(path: string, fallback: T): T {
  const [data, setData] = useState<T>(fallback);
  useEffect(() => {
    return onSnapshot(doc(db, path), (snap) => {
      setData(snap.exists() ? ({ ...fallback, ...(snap.data() as object) } as T) : fallback);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  return data;
}

export function useSettings(): Settings {
  return useDocData<Settings>('meta/settings', DEFAULT_SETTINGS);
}

export function useLists(): Lists {
  return useDocData<Lists>('meta/lists', { shopCategories: seed.shopCategories, noteTags: seed.noteTags });
}

export async function saveSettings(patch: Partial<Settings>) {
  await setDoc(doc(db, 'meta/settings'), patch, { merge: true });
}

export async function saveLists(patch: Partial<Lists>) {
  await setDoc(doc(db, 'meta/lists'), patch, { merge: true });
}

/** 저장: id가 없으면 새로 만듦. 작성자/시간 자동 기록 */
export async function save(col: string, id: string | null, data: Record<string, unknown>): Promise<string> {
  const key = id || newId();
  const clean: Record<string, unknown> = {};
  Object.entries(data).forEach(([k, v]) => {
    if (k !== 'id' && v !== undefined) clean[k] = v;
  });
  const now = Date.now();
  await setDoc(
    doc(db, col, key),
    { ...clean, updatedBy: me(), updatedAt: now, ...(id ? {} : { createdAt: now }) },
    { merge: true }
  );
  return key;
}

export async function remove(col: string, id: string) {
  await deleteDoc(doc(db, col, id));
}

/** 혈당: 해당 월 구독 */
export function useSugarMonth(ym: string): Sugar[] {
  const [rows, setRows] = useState<Sugar[]>([]);
  useEffect(() => {
    const q = query(collection(db, 'sugar'), where('date', '>=', ym + '-01'), where('date', '<=', ym + '-31'));
    return onSnapshot(q, (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as Sugar)));
  }, [ym]);
  return rows;
}

/** 사진(압축된 dataURL) 저장/불러오기 */
const photoCache = new Map<string, string>();

export async function savePhoto(dataUrl: string): Promise<string> {
  const id = newId();
  await setDoc(doc(db, 'photos', id), { data: dataUrl, createdAt: Date.now(), by: me() });
  photoCache.set(id, dataUrl);
  return id;
}

export async function removePhoto(id?: string | null) {
  if (!id) return;
  photoCache.delete(id);
  await deleteDoc(doc(db, 'photos', id));
}

export function usePhoto(id?: string | null): string | null {
  const [url, setUrl] = useState<string | null>(id ? photoCache.get(id) || null : null);
  useEffect(() => {
    let alive = true;
    if (!id) {
      setUrl(null);
      return;
    }
    if (photoCache.has(id)) {
      setUrl(photoCache.get(id)!);
      return;
    }
    getDoc(doc(db, 'photos', id)).then((snap) => {
      const data = snap.exists() ? (snap.get('data') as string) : null;
      if (data) photoCache.set(id, data);
      if (alive) setUrl(data);
    });
    return () => {
      alive = false;
    };
  }, [id]);
  return url;
}

/** 알람 예약/취소 (Vercel 함수가 1분마다 확인해서 푸시 발송) */
export async function setAlarm(id: string, fireAt: number, title: string, body: string) {
  if (fireAt <= Date.now()) {
    await deleteDoc(doc(db, 'alarms', id));
    return;
  }
  await setDoc(doc(db, 'alarms', id), { fireAt, title, body, createdAt: Date.now() });
}

export async function cancelAlarm(id: string) {
  await deleteDoc(doc(db, 'alarms', id));
}

/** 처음 한 번만: 엑셀 체크리스트를 넣어둔다 (두 폰이 동시에 열어도 한 번만) */
export async function seedOnce() {
  const flag = doc(db, 'meta/seed');
  const first = await runTransaction(db, async (tx) => {
    const s = await tx.get(flag);
    if (s.exists()) return false;
    tx.set(flag, { at: Date.now(), by: me() });
    return true;
  });
  if (!first) return;
  const now = Date.now();
  const batch = writeBatch(db);
  seed.items.forEach((it) => batch.set(doc(collection(db, 'items')), { ...it, createdAt: now, updatedAt: now, updatedBy: '' }));
  seed.admin.forEach((it) => batch.set(doc(collection(db, 'admin')), { ...it, createdAt: now, updatedAt: now, updatedBy: '' }));
  batch.set(doc(db, 'meta/lists'), { shopCategories: seed.shopCategories, noteTags: seed.noteTags }, { merge: true });
  batch.set(doc(db, 'meta/settings'), DEFAULT_SETTINGS, { merge: true });
  await batch.commit();
}
