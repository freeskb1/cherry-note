import { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  User,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { seedOnce, useCollection, useLists, useSettings, UserDoc } from './data';
import { registerToken } from './push';
import { getPendingInvite, session, setPendingInvite } from './session';
import { AdminTask, Household, Item, Lists, Note, Settings } from './types';
import { Icon, ToastProvider } from './ui';
import Home from './screens/Home';
import Shop from './screens/Shop';
import Notes from './screens/Notes';
import Admin from './screens/Admin';
import SugarScreen from './screens/Sugar';
import SettingsScreen from './screens/Settings';
import Onboarding from './screens/Onboarding';

export type Tab = 'home' | 'shop' | 'notes' | 'admin' | 'sugar' | 'settings';

interface Store {
  items: Item[];
  notes: Note[];
  admin: AdminTask[];
  settings: Settings;
  lists: Lists;
  household: Household;
  ready: boolean;
  go: (tab: Tab, openId?: string) => void;
  openId: string | null;
  clearOpen: () => void;
}
const StoreCtx = createContext<Store>(null as unknown as Store);
export const useStore = () => useContext(StoreCtx);

function parseHash(): { tab: Tab; id: string | null } {
  const [, tab, id] = (location.hash || '#/home').split('/');
  const t = (['home', 'shop', 'notes', 'admin', 'sugar', 'settings'].includes(tab) ? tab : 'home') as Tab;
  return { tab: t, id: id || null };
}

/** 초대 링크(#/join/CODE)로 들어오면 코드를 기억해 둠 */
function captureInviteFromHash() {
  const m = location.hash.match(/^#\/join\/([A-Za-z0-9]{6})/);
  if (m) {
    setPendingInvite(m[1].toUpperCase());
    history.replaceState(null, '', '#/home');
  }
}
captureInviteFromHash();

const AUTH_ERR: Record<string, string> = {
  'auth/invalid-credential': '이메일이나 비밀번호가 맞지 않아요.',
  'auth/wrong-password': '이메일이나 비밀번호가 맞지 않아요.',
  'auth/user-not-found': '가입되지 않은 이메일이에요.',
  'auth/email-already-in-use': '이미 가입된 이메일이에요. 로그인해 주세요.',
  'auth/weak-password': '비밀번호는 6자 이상으로 해주세요.',
  'auth/invalid-email': '이메일 형식이 맞지 않아요.',
  'auth/admin-restricted-operation': '지금은 새 가입을 받지 않고 있어요. 관리자에게 문의해 주세요.',
  'auth/operation-not-allowed': '지금은 새 가입을 받지 않고 있어요. 관리자에게 문의해 주세요.',
  'auth/too-many-requests': '시도가 너무 많아요. 잠시 후 다시 해주세요.',
};

function AuthScreen() {
  const invited = !!getPendingInvite();
  const [mode, setMode] = useState<'login' | 'signup'>(invited ? 'signup' : 'login');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr('');
    setInfo('');
    try {
      if (mode === 'signup') {
        if (pw !== pw2) throw { code: 'mismatch' };
        await createUserWithEmailAndPassword(auth, email.trim(), pw);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), pw);
      }
    } catch (e: any) {
      setErr(e?.code === 'mismatch' ? '비밀번호가 서로 달라요.' : AUTH_ERR[e?.code] || '문제가 생겼어요. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setErr('');
    if (!email.trim()) {
      setErr('비밀번호를 재설정할 이메일을 먼저 입력해 주세요.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo('비밀번호 재설정 메일을 보냈어요. 메일함(스팸함 포함)을 확인해 주세요.');
    } catch (e: any) {
      setErr(AUTH_ERR[e?.code] || '메일을 보내지 못했어요.');
    }
  };

  return (
    <div className="login">
      <img src="/icon-192.png" alt="" width={72} height={72} />
      <h1>출산 준비노트</h1>
      <p className="sub">{invited ? '배우자에게 초대받았어요. 가입하면 같은 공간에 들어가요.' : '부부 둘이 함께 쓰는 출산 준비 기록'}</p>
      <div className="seg auth-seg" role="radiogroup">
        <button type="button" role="radio" aria-checked={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>로그인</button>
        <button type="button" role="radio" aria-checked={mode === 'signup'} className={mode === 'signup' ? 'on' : ''} onClick={() => setMode('signup')}>회원가입</button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input id="login-email" className="fld" type="email" autoComplete="username" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input id="login-pw" className="fld" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder={mode === 'signup' ? '비밀번호 (6자 이상)' : '비밀번호'} value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} />
        {mode === 'signup' && (
          <input id="login-pw2" className="fld" type="password" autoComplete="new-password" placeholder="비밀번호 확인" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={6} />
        )}
        {err && <div className="err">{err}</div>}
        {info && <div className="hint">{info}</div>}
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? '잠시만요…' : mode === 'signup' ? '가입하기' : '로그인'}
        </button>
      </form>
      {mode === 'login' && <button type="button" className="link-btn center" onClick={reset}>비밀번호를 잊었어요</button>}
      {mode === 'signup' && <div className="hint center">비밀번호를 잊으면 재설정 메일로 바꿀 수 있게, 실제로 쓰는 이메일로 가입해 주세요.</div>}
    </div>
  );
}

const NAV: { tab: Tab; label: string; icon: string }[] = [
  { tab: 'home', label: '홈', icon: 'home' },
  { tab: 'shop', label: '용품', icon: 'bag' },
  { tab: 'notes', label: '노트', icon: 'note' },
  { tab: 'admin', label: '신청', icon: 'clip' },
  { tab: 'sugar', label: '혈당', icon: 'drop' },
];

function Main({ household }: { household: Household }) {
  const [route, setRoute] = useState(parseHash());
  const items = useCollection<Item>('items');
  const notes = useCollection<Note>('notes');
  const admin = useCollection<AdminTask>('admin');
  const settings = useSettings();
  const lists = useLists();
  session.babyName = settings.babyName;

  useEffect(() => {
    const on = () => {
      captureInviteFromHash();
      setRoute(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    seedOnce().catch(() => {});
    registerToken().catch(() => {});
    setPendingInvite(null); // 이미 집이 있으면 남은 초대 코드는 버림
  }, []);

  const store: Store = {
    items: items.rows,
    notes: notes.rows,
    admin: admin.rows,
    settings,
    lists,
    household,
    ready: items.ready && notes.ready && admin.ready,
    go: (tab, openId) => {
      location.hash = `#/${tab}${openId ? '/' + openId : ''}`;
    },
    openId: route.id,
    clearOpen: () => history.replaceState(null, '', `#/${route.tab}`),
  };

  return (
    <StoreCtx.Provider value={store}>
      <main className="screen">
        {route.tab === 'home' && <Home />}
        {route.tab === 'shop' && <Shop />}
        {route.tab === 'notes' && <Notes />}
        {route.tab === 'admin' && <Admin />}
        {route.tab === 'sugar' && <SugarScreen />}
        {route.tab === 'settings' && <SettingsScreen />}
      </main>
      <nav className="nav">
        {NAV.map((n) => (
          <a key={n.tab} href={`#/${n.tab}`} className={'tab' + (route.tab === n.tab ? ' on' : '')} aria-current={route.tab === n.tab ? 'page' : undefined}>
            <Icon name={n.icon} />
            {n.label}
          </a>
        ))}
      </nav>
    </StoreCtx.Provider>
  );
}

/** 로그인한 사람의 집을 찾아서 연결 */
function Signed({ user }: { user: User }) {
  const [userDoc, setUserDoc] = useState<UserDoc | null | undefined>(undefined);
  const [household, setHousehold] = useState<Household | null | undefined>(undefined);

  useEffect(() => {
    session.uid = user.uid;
    return onSnapshot(
      doc(db, 'users', user.uid),
      (s) => setUserDoc(s.exists() ? (s.data() as UserDoc) : null),
      () => setUserDoc(null)
    );
  }, [user.uid]);

  const hid = userDoc?.householdId;
  useEffect(() => {
    if (userDoc === undefined) return;
    if (!hid) {
      setHousehold(null);
      return;
    }
    return onSnapshot(
      doc(db, 'households', hid),
      (s) => setHousehold(s.exists() ? ({ id: s.id, ...(s.data() as Omit<Household, 'id'>) } as Household) : null),
      () => setHousehold(null)
    );
  }, [hid, userDoc]);

  if (userDoc === undefined || household === undefined) return <div className="boot" />;
  if (!household) return <Onboarding />;

  session.hid = household.id;
  session.name = household.names?.[user.uid] || userDoc?.name || (user.email || '').split('@')[0];
  return <Main key={household.id} household={household} />;
}

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        if (!u) {
          session.uid = '';
          session.hid = '';
          session.name = '';
        }
        setUser(u);
      }),
    []
  );
  if (user === undefined) return <div className="boot" />;
  return <ToastProvider>{user ? <Signed key={user.uid} user={user} /> : <AuthScreen />}</ToastProvider>;
}
