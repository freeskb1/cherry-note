import { useEffect, useState } from 'react';
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import seed from './seed.json';
import { hp, randomCode, session } from './session';
import { DEFAULT_SETTINGS, Lists, Settings, Sugar } from './types';

export function me(): string {
  return session.name;
}

export function newId(): string {
  return doc(collection(db, '_')).id;
}

/** 집 안 컬렉션 전체 실시간 구독 */
export function useCollection<T>(name: string): { rows: T[]; ready: boolean } {
  const [state, setState] = useState<{ rows: T[]; ready: boolean }>({ rows: [], ready: false });
  useEffect(() => {
    return onSnapshot(
      collection(db, hp(name)),
      (snap) => setState({ rows: snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as T), ready: true }),
      () => setState((s) => ({ ...s, ready: true }))
    );
  }, [name]);
  return state;
}

export function useDocData<T>(path: string, fallback: T): T {
  const [data, setData] = useState<T>(fallback);
  useEffect(() => {
    return onSnapshot(doc(db, hp(path)), (snap) => {
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
  await setDoc(doc(db, hp('meta/settings')), patch, { merge: true });
}

export async function saveLists(patch: Partial<Lists>) {
  await setDoc(doc(db, hp('meta/lists')), patch, { merge: true });
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
    doc(db, hp(col), key),
    { ...clean, updatedBy: me(), updatedAt: now, ...(id ? {} : { createdAt: now }) },
    { merge: true }
  );
  return key;
}

export async function remove(col: string, id: string) {
  await deleteDoc(doc(db, hp(col), id));
}

/** 혈당: 해당 월 구독 */
export function useSugarMonth(ym: string): Sugar[] {
  const [rows, setRows] = useState<Sugar[]>([]);
  useEffect(() => {
    const q = query(collection(db, hp('sugar')), where('date', '>=', ym + '-01'), where('date', '<=', ym + '-31'));
    return onSnapshot(q, (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as Sugar)));
  }, [ym]);
  return rows;
}

/** 사진(압축된 dataURL) 저장/불러오기 */
const photoCache = new Map<string, string>();

export async function savePhoto(dataUrl: string): Promise<string> {
  const id = newId();
  await setDoc(doc(db, hp('photos'), id), { data: dataUrl, createdAt: Date.now(), by: me() });
  photoCache.set(id, dataUrl);
  return id;
}

export async function removePhoto(id?: string | null) {
  if (!id) return;
  photoCache.delete(id);
  await deleteDoc(doc(db, hp('photos'), id));
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
    getDoc(doc(db, hp('photos'), id)).then((snap) => {
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

/** 알람 예약/취소 (Vercel 함수가 1분마다 확인해서 그 집 폰으로만 푸시 발송) */
const alarmId = (id: string) => `${session.hid}_${id}`;

export async function setAlarm(id: string, fireAt: number, title: string, body: string) {
  if (fireAt <= Date.now()) {
    await cancelAlarm(id);
    return;
  }
  await setDoc(doc(db, 'alarms', alarmId(id)), { householdId: session.hid, fireAt, title, body, createdAt: Date.now() });
}

export async function cancelAlarm(id: string) {
  await deleteDoc(doc(db, 'alarms', alarmId(id))).catch(() => {});
}

/** 처음 한 번만: 기본 체크리스트를 넣어둔다 (부부 폰이 동시에 열어도 한 번만) */
export async function seedOnce() {
  const flag = doc(db, hp('meta/seed'));
  const first = await runTransaction(db, async (tx) => {
    const s = await tx.get(flag);
    if (s.exists()) return false;
    tx.set(flag, { at: Date.now(), by: me() });
    return true;
  });
  if (!first) return;
  const now = Date.now();
  const batch = writeBatch(db);
  seed.items.forEach((it) => batch.set(doc(collection(db, hp('items'))), { ...it, star: false, createdAt: now, updatedAt: now, updatedBy: '' }));
  seed.admin.forEach((it) => batch.set(doc(collection(db, hp('admin'))), { ...it, star: false, createdAt: now, updatedAt: now, updatedBy: '' }));
  batch.set(doc(db, hp('meta/lists')), { shopCategories: seed.shopCategories, noteTags: seed.noteTags }, { merge: true });
  // 태명·예정일은 가입할 때 따로 저장하므로 덮어쓰지 않음
  const { babyName: _b, dueDate: _d, ...rest } = DEFAULT_SETTINGS;
  batch.set(doc(db, hp('meta/settings')), rest, { merge: true });
  await batch.commit();
}

/* ───────────── 계정 · 집 ───────────── */

export interface UserDoc {
  householdId?: string;
  name?: string;
  email?: string;
}

function uid(): string {
  const u = auth.currentUser;
  if (!u) throw new Error('로그인이 필요해요');
  return u.uid;
}

/** 가입 코드 확인: 있고 아직 안 쓴 코드인지 */
export async function checkSignupCode(code: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'signupCodes', code));
  return snap.exists() && snap.get('usedBy') == null;
}

/** 새 집 만들기. code가 없으면(기존 사용자 이전용) 가입 코드 없이 */
export async function createHousehold(name: string, code: string | null, opts: { linkUser: boolean }): Promise<string> {
  const u = uid();
  const hid = newId();
  const now = Date.now();
  const batch = writeBatch(db);
  batch.set(doc(db, 'households', hid), { members: [u], names: { [u]: name }, createdAt: now, createdBy: u, signupCode: code });
  if (code) {
    batch.update(doc(db, 'signupCodes', code), { usedBy: u, usedAt: now, householdId: hid, usedEmail: auth.currentUser?.email || '' });
  }
  if (opts.linkUser) batch.set(doc(db, 'users', u), { householdId: hid, name, email: auth.currentUser?.email || '' }, { merge: true });
  await batch.commit();
  return hid;
}

export async function linkUser(hid: string, name: string) {
  await setDoc(doc(db, 'users', uid()), { householdId: hid, name, email: auth.currentUser?.email || '' }, { merge: true });
}

/** 초대 코드로 배우자 집에 들어가기 */
export async function joinHousehold(code: string, name: string): Promise<string> {
  const u = uid();
  const inv = await getDoc(doc(db, 'invites', code));
  if (!inv.exists()) throw new Error('초대 코드를 찾을 수 없어요. 다시 확인해 주세요.');
  if ((inv.get('expiresAt') as number) < Date.now()) throw new Error('만료된 초대 코드예요. 새 초대 링크를 받아주세요.');
  const hid = inv.get('householdId') as string;
  const batch = writeBatch(db);
  batch.update(doc(db, 'households', hid), { members: arrayUnion(u), [`names.${u}`]: name, joinedVia: code });
  batch.set(doc(db, 'users', u), { householdId: hid, name, email: auth.currentUser?.email || '' }, { merge: true });
  try {
    await batch.commit();
  } catch (e: any) {
    if (String(e?.code || '').includes('permission')) throw new Error('이미 두 명이 들어가 있거나, 쓸 수 없는 초대 코드예요.');
    throw e;
  }
  await deleteDoc(doc(db, 'invites', code)).catch(() => {});
  return hid;
}

/** 배우자 초대 코드 만들기 (72시간 유효) */
export async function createInvite(): Promise<{ code: string; expiresAt: number }> {
  const expiresAt = Date.now() + 72 * 3600 * 1000;
  for (let i = 0; i < 5; i++) {
    const code = randomCode(6);
    const ref = doc(db, 'invites', code);
    const ok = await runTransaction(db, async (tx) => {
      const s = await tx.get(ref);
      if (s.exists()) return false;
      tx.set(ref, { householdId: session.hid, createdBy: session.uid, createdAt: Date.now(), expiresAt });
      return true;
    });
    if (ok) {
      await setDoc(doc(db, hp('meta/invite')), { code, expiresAt });
      return { code, expiresAt };
    }
  }
  throw new Error('초대 코드를 만들지 못했어요. 다시 시도해 주세요.');
}

export async function myInvites(): Promise<{ code: string; expiresAt: number }[]> {
  const s = await getDoc(doc(db, hp('meta/invite')));
  if (!s.exists()) return [];
  const inv = { code: s.get('code') as string, expiresAt: s.get('expiresAt') as number };
  if (inv.expiresAt <= Date.now()) return [];
  // 이미 쓰인(배우자가 들어온) 코드는 지워져 있음
  const live = await getDoc(doc(db, 'invites', inv.code));
  return live.exists() ? [inv] : [];
}

export async function renameMe(name: string) {
  const u = uid();
  await updateDoc(doc(db, 'households', session.hid), { [`names.${u}`]: name });
  await setDoc(doc(db, 'users', u), { name }, { merge: true });
}

/* ───────────── 관리자: 가입 코드 ───────────── */

export interface SignupCode {
  code: string;
  createdAt: number;
  memo?: string;
  usedBy?: string | null;
  usedEmail?: string;
  usedAt?: number;
}

export async function listSignupCodes(): Promise<SignupCode[] | null> {
  try {
    const snap = await getDocs(collection(db, 'signupCodes'));
    return snap.docs
      .map((d) => ({ code: d.id, ...(d.data() as Omit<SignupCode, 'code'>) }))
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return null; // 관리자가 아니면 읽을 수 없음
  }
}

export async function createSignupCode(memo: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = randomCode(8);
    const ref = doc(db, 'signupCodes', code);
    const ok = await runTransaction(db, async (tx) => {
      const s = await tx.get(ref);
      if (s.exists()) return false;
      tx.set(ref, { createdAt: Date.now(), memo, usedBy: null });
      return true;
    });
    if (ok) return code;
  }
  throw new Error('코드를 만들지 못했어요');
}

export async function deleteSignupCode(code: string) {
  await deleteDoc(doc(db, 'signupCodes', code));
}

/* ───────────── 기존(공용) 데이터 → 우리 집으로 이전 ───────────── */

const LEGACY_COLS = ['items', 'notes', 'admin', 'sugar', 'photos'];

export interface LegacyState {
  available: boolean; // 기존 데이터를 읽을 수 있는 계정인지
  migratedTo?: string;
  done?: boolean;
}

export async function legacyState(): Promise<LegacyState> {
  try {
    const seedFlag = await getDoc(doc(db, 'meta/seed'));
    if (!seedFlag.exists()) return { available: false };
    const m = await getDoc(doc(db, 'meta/migrated'));
    if (!m.exists()) return { available: true };
    return { available: true, migratedTo: m.get('householdId'), done: !!m.get('done') };
  } catch {
    return { available: false };
  }
}

export async function isMemberOf(hid: string): Promise<boolean> {
  try {
    const s = await getDoc(doc(db, 'households', hid));
    return s.exists();
  } catch {
    return false;
  }
}

/** 기존 데이터를 집으로 복사. 중간에 끊겨도 다시 실행하면 이어서 됨 */
export async function migrateLegacy(hid: string, babyName: string, onProgress: (msg: string) => void) {
  await setDoc(doc(db, 'meta/migrated'), { householdId: hid, done: false, at: Date.now(), by: auth.currentUser?.email || '' });
  const base = `households/${hid}`;
  // 기본 체크리스트가 다시 들어가지 않게 먼저 표시
  await setDoc(doc(db, `${base}/meta/seed`), { at: Date.now(), by: 'migration' });

  for (const col of LEGACY_COLS) {
    const snap = await getDocs(collection(db, col));
    onProgress(`${col} ${snap.size}개 옮기는 중…`);
    let batch = writeBatch(db);
    let ops = 0;
    let bytes = 0;
    for (const d of snap.docs) {
      const data = d.data();
      const size = JSON.stringify(data).length;
      if (ops >= 400 || bytes + size > 8_000_000) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
        bytes = 0;
      }
      batch.set(doc(db, `${base}/${col}/${d.id}`), data);
      ops++;
      bytes += size;
    }
    if (ops) await batch.commit();
  }

  onProgress('설정 옮기는 중…');
  const [settings, lists] = await Promise.all([getDoc(doc(db, 'meta/settings')), getDoc(doc(db, 'meta/lists'))]);
  await setDoc(doc(db, `${base}/meta/settings`), { ...DEFAULT_SETTINGS, ...(settings.data() || {}), babyName }, { merge: true });
  if (lists.exists()) await setDoc(doc(db, `${base}/meta/lists`), lists.data()!, { merge: true });
  await setDoc(doc(db, 'meta/migrated'), { done: true, doneAt: Date.now() }, { merge: true });
}
