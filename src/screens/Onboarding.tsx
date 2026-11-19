import { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import {
  checkSignupCode,
  createHousehold,
  isMemberOf,
  joinHousehold,
  legacyState,
  LegacyState,
  linkUser,
  migrateLegacy,
} from '../data';
import { getPendingInvite, session, setPendingInvite } from '../session';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

type Mode = 'choose' | 'join' | 'create' | 'legacy';

/** 로그인은 했지만 아직 집이 없는 사람: 초대받아 들어가기 / 새로 시작하기 / 기존 데이터 이전 */
export default function Onboarding() {
  const pending = getPendingInvite();
  const [mode, setMode] = useState<Mode>(pending ? 'join' : 'choose');
  const [name, setName] = useState('');
  const [invite, setInvite] = useState(pending || '');
  const [code, setCode] = useState('');
  const [babyName, setBabyName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [legacy, setLegacy] = useState<LegacyState | null>(null);
  const [legacyMember, setLegacyMember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    legacyState().then(async (st) => {
      setLegacy(st);
      if (st.migratedTo) setLegacyMember(await isMemberOf(st.migratedTo));
    });
  }, []);

  const run = async (fn: () => Promise<void>) => {
    if (!name.trim()) {
      setErr('앱에서 보일 내 이름을 입력해 주세요.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await fn();
    } catch (e: any) {
      setErr(e?.message || '문제가 생겼어요. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  const doJoin = () =>
    run(async () => {
      const c = invite.trim().toUpperCase();
      if (c.length < 6) throw new Error('초대 코드 6자리를 입력해 주세요.');
      await joinHousehold(c, name.trim());
      setPendingInvite(null);
    });

  const doCreate = () =>
    run(async () => {
      const c = code.trim().toUpperCase();
      if (!(await checkSignupCode(c))) throw new Error('가입 코드가 맞지 않거나 이미 사용된 코드예요.');
      const hid = await createHousehold(name.trim(), c, { linkUser: false });
      session.hid = hid;
      const settings: Record<string, string> = {};
      if (babyName.trim()) settings.babyName = babyName.trim();
      if (dueDate) settings.dueDate = dueDate;
      if (Object.keys(settings).length) await setDoc(doc(db, `households/${hid}/meta/settings`), settings, { merge: true });
      await linkUser(hid, name.trim());
    });

  const doLegacy = () =>
    run(async () => {
      let hid = legacy?.migratedTo && legacyMember ? legacy.migratedTo : null;
      if (!hid) hid = await createHousehold(name.trim(), null, { linkUser: false });
      session.hid = hid;
      await migrateLegacy(hid, babyName.trim() || '체리', setProgress);
      await linkUser(hid, name.trim());
    });

  const nameField = (
    <label className="field">
      <span className="lbl">앱에서 보일 내 이름</span>
      <input id="ob-name" className="fld" placeholder="예: 광배, 민주, 엄마, 아빠" value={name} onChange={(e) => setName(e.target.value)} maxLength={12} />
    </label>
  );

  // 기존 데이터를 다른 사람이 이미 옮겼고, 나는 그 집 사람이 아님 → 초대 받아야 함
  const legacyTaken = !!legacy?.migratedTo && legacy.done && !legacyMember;
  const canLegacy = !!legacy?.available && !legacyTaken;

  return (
    <div className="login">
      <img src="/icon-192.png" alt="" width={64} height={64} />
      <h1>환영해요</h1>
      <p className="sub">{auth.currentUser?.email}</p>

      {mode === 'choose' && (
        <div className="ob-choices">
          <button type="button" className="ob-card" onClick={() => setMode('join')}>
            <b>배우자에게 초대받았어요</b>
            <span>초대 링크나 6자리 코드로 같은 공간에 들어가요</span>
          </button>
          <button type="button" className="ob-card" onClick={() => setMode('create')}>
            <b>새로 시작할게요</b>
            <span>가입 코드로 우리 집 공간을 만들고, 배우자를 초대해요</span>
          </button>
          {canLegacy && (
            <button type="button" className="ob-card accent" onClick={() => setMode('legacy')}>
              <b>기존 체리 기록으로 시작</b>
              <span>지금까지 입력한 용품·노트·신청·혈당을 우리 집으로 옮겨요</span>
            </button>
          )}
          {legacyTaken && <div className="hint">기존 체리 기록은 이미 옮겨졌어요. 배우자에게 초대 링크를 받아 들어가세요.</div>}
        </div>
      )}

      {mode === 'join' && (
        <form className="ob-form" onSubmit={(e) => { e.preventDefault(); doJoin(); }}>
          {pending && <div className="notice">초대 링크로 들어왔어요. 이름만 입력하면 돼요.</div>}
          {nameField}
          <label className="field">
            <span className="lbl">초대 코드 (6자리)</span>
            <input id="ob-invite" className="fld code" autoCapitalize="characters" autoComplete="off" value={invite} onChange={(e) => setInvite(e.target.value.toUpperCase())} maxLength={6} />
          </label>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? '들어가는 중…' : '들어가기'}</button>
        </form>
      )}

      {mode === 'create' && (
        <form className="ob-form" onSubmit={(e) => { e.preventDefault(); doCreate(); }}>
          {nameField}
          <label className="field">
            <span className="lbl">가입 코드 (8자리, 관리자에게 받은 코드)</span>
            <input id="ob-code" className="fld code" autoCapitalize="characters" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8} />
          </label>
          <div className="two">
            <label className="field">
              <span className="lbl">태명 (선택)</span>
              <input id="ob-baby" className="fld" value={babyName} onChange={(e) => setBabyName(e.target.value)} maxLength={10} />
            </label>
            <label className="field">
              <span className="lbl">출산 예정일 (선택)</span>
              <input id="ob-due" className="fld" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
          </div>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? '만드는 중…' : '우리 집 만들기'}</button>
        </form>
      )}

      {mode === 'legacy' && (
        <form className="ob-form" onSubmit={(e) => { e.preventDefault(); doLegacy(); }}>
          {nameField}
          <label className="field">
            <span className="lbl">태명</span>
            <input id="ob-baby2" className="fld" placeholder="체리" value={babyName} onChange={(e) => setBabyName(e.target.value)} maxLength={10} />
          </label>
          <div className="hint">사진이 많으면 1~2분 걸릴 수 있어요. 끝날 때까지 화면을 닫지 마세요. 중간에 끊겨도 다시 누르면 이어서 해요.</div>
          {progress && <div className="notice">{progress}</div>}
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? '옮기는 중…' : '기존 기록 옮기고 시작'}</button>
        </form>
      )}

      {err && <div className="err">{err}</div>}
      {mode !== 'choose' && !busy && (
        <button type="button" className="link-btn center" onClick={() => { setMode('choose'); setErr(''); }}>다른 방법 고르기</button>
      )}
      <button type="button" className="link-btn center" onClick={() => signOut(auth)}>로그아웃</button>
    </div>
  );
}
