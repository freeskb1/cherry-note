import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, User } from 'firebase/auth';
import { auth, nameOf } from './firebase';
import { seedOnce, useCollection, useLists, useSettings } from './data';
import { registerToken } from './push';
import { AdminTask, Item, Lists, Note, Settings } from './types';
import { Icon, ToastProvider } from './ui';
import Home from './screens/Home';
import Shop from './screens/Shop';
import Notes from './screens/Notes';
import Admin from './screens/Admin';
import SugarScreen from './screens/Sugar';
import SettingsScreen from './screens/Settings';

export type Tab = 'home' | 'shop' | 'notes' | 'admin' | 'sugar' | 'settings';

interface Store {
  items: Item[];
  notes: Note[];
  admin: AdminTask[];
  settings: Settings;
  lists: Lists;
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

function Login() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="login">
      <img src="/icon-192.png" alt="" width={72} height={72} />
      <h1>체리 준비노트</h1>
      <p className="sub">광배·민주 전용이에요. 한 번 로그인하면 계속 유지돼요.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr('');
          try {
            await signInWithEmailAndPassword(auth, email.trim(), pw);
          } catch {
            setErr('이메일이나 비밀번호가 맞지 않아요.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <input id="login-email" className="fld" type="email" autoComplete="username" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input id="login-pw" className="fld" type="password" autoComplete="current-password" placeholder="비밀번호" value={pw} onChange={(e) => setPw(e.target.value)} required />
        {err && <div className="err">{err}</div>}
        <button className="btn-primary" type="submit" disabled={busy}>{busy ? '로그인 중…' : '로그인'}</button>
      </form>
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

function Main() {
  const [route, setRoute] = useState(parseHash());
  const items = useCollection<Item>('items');
  const notes = useCollection<Note>('notes');
  const admin = useCollection<AdminTask>('admin');
  const settings = useSettings();
  const lists = useLists();
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    const on = () => {
      setRoute(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    seedOnce().catch((e) => {
      if (String(e?.code || e).includes('permission')) setDenied(true);
    });
    registerToken().catch(() => {});
  }, []);

  if (denied) {
    return (
      <div className="login">
        <h1>접근 권한이 없어요</h1>
        <p className="sub">{auth.currentUser?.email} 계정은 등록되어 있지 않아요.</p>
        <button className="btn-primary" type="button" onClick={() => auth.signOut()}>다른 계정으로 로그인</button>
      </div>
    );
  }

  const store: Store = {
    items: items.rows,
    notes: notes.rows,
    admin: admin.rows,
    settings,
    lists,
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

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  if (user === undefined) return <div className="boot" />;
  return <ToastProvider>{user ? <Main key={user.uid} /> : <Login />}</ToastProvider>;
}

export { nameOf };
