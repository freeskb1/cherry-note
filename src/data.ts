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

/* ───────────── 계정 · 가족 ───────────── */

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
const myEmail = () => auth.currentUser?.email || '';

/** 새 가족 만들기 + 영구 가족 코드(6자리). hid를 넘기면 그 id로 만듦 */
export async function createHousehold(name: string, fixedHid?: string): Promise<{ hid: string; code: string }> {
  const u = uid();
  const hid = fixedHid || newId();
  for (let i = 0; i < 6; i++) {
    const code = randomCode(6);
    const invRef = doc(db, 'invites', code);
    const ok = await runTransaction(db, async (tx) => {
      const s = await tx.get(invRef);
      if (s.exists()) return false;
      tx.set(doc(db, 'households', hid), {
        members: [u],
        names: { [u]: name },
        emails: { [u]: myEmail() },
        code,
        createdAt: Date.now(),
        createdBy: u,
      });
      tx.set(invRef, { householdId: hid, createdBy: u, createdAt: Date.now() });
      return true;
    });
    if (ok) return { hid, code };
  }
  throw new Error('가족 코드를 만들지 못했어요. 다시 시도해 주세요.');
}

export async function linkUser(hid: string, name: string) {
  await setDoc(doc(db, 'users', uid()), { householdId: hid, name, email: myEmail() }, { merge: true });
}

/** 가족 코드로 배우자 가족에 들어가기 */
export async function joinHousehold(code: string, name: string): Promise<string> {
  const u = uid();
  const inv = await getDoc(doc(db, 'invites', code));
  if (!inv.exists()) throw new Error('가족 코드를 찾을 수 없어요. 다시 확인해 주세요.');
  const hid = inv.get('householdId') as string;
  try {
    // 트랜잭션: 서버가 확인해야만 반영돼서, 화면이 먼저 넘어갔다가 되돌아오는 일이 없음
    await runTransaction(db, async (tx) => {
      await tx.get(doc(db, 'invites', code));
      tx.update(doc(db, 'households', hid), {
        members: arrayUnion(u),
        [`names.${u}`]: name,
        [`emails.${u}`]: myEmail(),
        joinedVia: code,
      });
      tx.set(doc(db, 'users', u), { householdId: hid, name, email: myEmail() }, { merge: true });
    });
  } catch (e: any) {
    // 이미 들어가 있는 경우(예: 앞에서 성공했는데 화면만 안 넘어간 경우)는 연결만 다시
    if (await isMemberOf(hid)) {
      await linkUser(hid, name);
      return hid;
    }
    if (String(e?.code || '').includes('permission')) throw new Error('이미 두 명이 모두 들어간 가족이거나, 쓸 수 없는 가족 코드예요.');
    throw new Error(`들어가지 못했어요 (${e?.code || e?.message || '알 수 없는 오류'})`);
  }
  return hid;
}

/** 가족 코드 미리보기 (초대 링크로 들어왔을 때 '누가 초대했는지') — 들어가기 전엔 이름을 볼 수 없어 코드만 확인 */
export async function checkFamilyCode(code: string): Promise<boolean> {
  try {
    return (await getDoc(doc(db, 'invites', code))).exists();
  } catch {
    return false;
  }
}

export async function renameMe(name: string) {
  const u = uid();
  await updateDoc(doc(db, 'households', session.hid), { [`names.${u}`]: name });
  await setDoc(doc(db, 'users', u), { name }, { merge: true });
}

/* ───────────── 기본 데이터 (용품·신청 목록, 상태·메모 제외) ───────────── */

type SeedItem = (typeof seed.items)[number];
type SeedAdmin = (typeof seed.admin)[number];
interface Template {
  items: Partial<SeedItem>[];
  admin: Partial<SeedAdmin>[];
  shopCategories: string[];
}

async function loadTemplate(): Promise<Template> {
  try {
    const s = await getDoc(doc(db, 'templates/default'));
    if (s.exists()) return s.data() as Template;
  } catch {
    /* 없으면 기본 엑셀 목록 */
  }
  return { items: seed.items, admin: seed.admin, shopCategories: seed.shopCategories };
}

/** 새 가족에 기본 데이터 넣기: 품목·카테고리·수량·우선순위만, 상태는 '살 것'/'할 일' */
export async function applyTemplate(hid: string) {
  const t = await loadTemplate();
  const now = Date.now();
  const base = `households/${hid}`;
  const batch = writeBatch(db);
  t.items.forEach((it, i) =>
    batch.set(doc(collection(db, `${base}/items`)), {
      name: it.name || '',
      category: it.category || '기타',
      sub: it.sub || '',
      qty: it.qty || '',
      priority: it.priority || '권장',
      status: 'todo',
      star: false,
      order: it.order ?? i + 1,
      createdAt: now,
      updatedAt: now,
      updatedBy: '',
    })
  );
  t.admin.forEach((it, i) =>
    batch.set(doc(collection(db, `${base}/admin`)), {
      title: it.title || '',
      period: it.period || 'before',
      place: it.place || '',
      priority: it.priority || '',
      status: 'todo',
      star: false,
      order: it.order ?? i + 1,
      createdAt: now,
      updatedAt: now,
      updatedBy: '',
    })
  );
  batch.set(doc(db, `${base}/meta/lists`), { shopCategories: t.shopCategories?.length ? t.shopCategories : seed.shopCategories, noteTags: seed.noteTags }, { merge: true });
  await batch.commit();
}

/** 관리자: 우리 가족의 지금 용품·신청 목록을 다른 가족용 기본 데이터로 저장 (상태·메모·가격·구매처·담당 제외) */
export async function saveTemplateFromMyFamily(): Promise<{ items: number; admin: number }> {
  const [items, admin, lists] = await Promise.all([
    getDocs(collection(db, hp('items'))),
    getDocs(collection(db, hp('admin'))),
    getDoc(doc(db, hp('meta/lists'))),
  ]);
  const order = (d: { get: (k: string) => unknown }) => Number(d.get('order') ?? 9e15);
  const t: Template = {
    items: items.docs
      .sort((a, b) => order(a) - order(b))
      .map((d, i) => ({ name: d.get('name'), category: d.get('category'), sub: d.get('sub') || '', qty: d.get('qty') || '', priority: d.get('priority') || '권장', order: i + 1 })),
    admin: admin.docs
      .sort((a, b) => order(a) - order(b))
      .map((d, i) => ({ title: d.get('title'), period: d.get('period'), place: d.get('place') || '', priority: d.get('priority') || '', order: i + 1 })),
    shopCategories: (lists.get('shopCategories') as string[]) || seed.shopCategories,
  };
  await setDoc(doc(db, 'templates/default'), { ...t, updatedAt: Date.now() });
  return { items: t.items.length, admin: t.admin.length };
}

/* ───────────── 관리자: 사용 중인 가족 ───────────── */

export interface FamilyRow {
  id: string;
  code: string;
  babyName: string;
  createdAt: number;
  people: { name: string; email: string }[];
}

export async function listFamilies(): Promise<FamilyRow[] | null> {
  try {
    const snap = await getDocs(collection(db, 'households'));
    const rows = await Promise.all(
      snap.docs.map(async (d) => {
        const h = d.data() as { members?: string[]; names?: Record<string, string>; emails?: Record<string, string>; code?: string; createdAt?: number };
        const st = await getDoc(doc(db, `households/${d.id}/meta/settings`)).catch(() => null);
        return {
          id: d.id,
          code: h.code || '',
          babyName: (st?.get('babyName') as string) || '',
          createdAt: h.createdAt || 0,
          people: (h.members || []).map((m) => ({ name: h.names?.[m] || '', email: h.emails?.[m] || '' })),
        };
      })
    );
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return null; // 관리자가 아니면 읽을 수 없음
  }
}

/* ───────────── 기존(공용) 기록 → 광배·민주 가족으로 자동 이전 ───────────── */

const LEGACY_COLS = ['items', 'notes', 'admin', 'sugar', 'photos'];
const LEGACY_BABY_NAME = '체리'; // 기존 기록에는 태명이 저장돼 있지 않아 처음 옮길 때 한 번만 넣음

/** 예전 버전에서 쓰던 이메일→이름 (Vercel 환경변수 VITE_USER_NAMES) */
function legacyName(): string {
  const map: Record<string, string> = {};
  String(import.meta.env.VITE_USER_NAMES || '')
    .split(',')
    .forEach((pair: string) => {
      const [e, n] = pair.split(':');
      if (e && n) map[e.trim().toLowerCase()] = n.trim();
    });
  return map[myEmail().toLowerCase()] || myEmail().split('@')[0];
}

async function copyLegacy(hid: string, onProgress: (msg: string) => void) {
  const base = `households/${hid}`;
  for (const col of LEGACY_COLS) {
    const snap = await getDocs(collection(db, col));
    onProgress(`기록 불러오는 중… (${col})`);
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
  const [settings, lists] = await Promise.all([getDoc(doc(db, 'meta/settings')), getDoc(doc(db, 'meta/lists'))]);
  await setDoc(doc(db, `${base}/meta/settings`), { ...DEFAULT_SETTINGS, ...(settings.data() || {}), babyName: LEGACY_BABY_NAME }, { merge: true });
  if (lists.exists()) await setDoc(doc(db, `${base}/meta/lists`), lists.data()!, { merge: true });
}

export type LegacyResult = 'none' | 'linked' | 'waiting';

/**
 * 광배·민주 계정이 처음 들어오면 자동으로:
 *  - 아무도 안 옮겼으면 → 가족을 만들고 기존 기록 전부(상태·혈당·사진 포함) 옮기기
 *  - 이미 옮겼으면 → 그 가족에 자동 합류
 *  - 다른 폰에서 옮기는 중이면 → 'waiting'
 */
export async function autoLegacy(onProgress: (msg: string) => void): Promise<LegacyResult> {
  try {
    const seedFlag = await getDoc(doc(db, 'meta/seed'));
    if (!seedFlag.exists()) return 'none';
  } catch {
    return 'none'; // 예전 기록을 읽을 수 없는 계정 = 새 사용자
  }
  const u = uid();
  const name = legacyName();
  const flagRef = doc(db, 'meta/migrated');

  // 누가 옮길지 정하기 (두 폰이 동시에 열어도 한 명만)
  const claimed = await runTransaction(db, async (tx) => {
    const f = await tx.get(flagRef);
    if (f.exists()) return f.data() as { householdId: string; done?: boolean; by?: string; at?: number };
    const hid = newId();
    tx.set(flagRef, { householdId: hid, done: false, by: u, at: Date.now() });
    return { householdId: hid, done: false, by: u, fresh: true } as { householdId: string; done?: boolean; by?: string; fresh?: boolean };
  });
  const hid = claimed.householdId;

  if (claimed.by === u && !claimed.done) {
    // 내가 옮기는 사람 (처음이거나 중간에 끊겼다가 다시)
    onProgress('체리 기록 불러오는 중…');
    if (!(await isMemberOf(hid))) await createHousehold(name, hid);
    session.hid = hid;
    await copyLegacy(hid, onProgress);
    await setDoc(flagRef, { done: true, doneAt: Date.now() }, { merge: true });
    await linkUser(hid, name);
    // 관리자 계정이면 우리 목록을 다른 가족용 기본 데이터로 저장
    saveTemplateFromMyFamily().catch(() => {});
    return 'linked';
  }
  if (!claimed.done) return 'waiting'; // 다른 폰에서 옮기는 중

  // 이미 옮겨짐 → 자동 합류
  if (!(await isMemberOf(hid))) {
    await updateDoc(doc(db, 'households', hid), {
      members: arrayUnion(u),
      [`names.${u}`]: name,
      [`emails.${u}`]: myEmail(),
    });
  }
  await linkUser(hid, name);
  return 'linked';
}

export async function isMemberOf(hid: string): Promise<boolean> {
  try {
    const s = await getDoc(doc(db, 'households', hid));
    return s.exists();
  } catch {
    return false;
  }
}
