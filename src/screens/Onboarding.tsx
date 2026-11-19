import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { applyTemplate, createHousehold, joinHousehold, linkUser } from '../data';
import { getPendingInvite, session, setPendingInvite } from '../session';
import { DEFAULT_SETTINGS } from '../types';
import { dday } from '../util';

type Step = 'start' | 'name' | 'baby' | 'join';

/** 가족이 아직 없는 사람: 새로 시작(기본 데이터 선택) 또는 가족 코드로 들어가기 */
export default function Onboarding() {
  const pending = getPendingInvite();
  const [step, setStep] = useState<Step>(pending ? 'join' : 'start');
  const [useBase, setUseBase] = useState(true);
  const [name, setName] = useState('');
  const [babyName, setBabyName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [code, setCode] = useState(pending || '');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [err, setErr] = useState('');

  const run = async (fn: () => Promise<void>) => {
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

  const create = () =>
    run(async () => {
      if (!dueDate) throw new Error('출산 예정일을 입력해 주세요.');
      setProgress('우리 가족 연결하는 중…');
      const { hid } = await createHousehold(name.trim());
      session.hid = hid;
      await setDoc(doc(db, `households/${hid}/meta/settings`), { ...DEFAULT_SETTINGS, babyName: babyName.trim(), dueDate }, { merge: true });
      if (useBase) {
        setProgress('기본 데이터 넣는 중…');
        await applyTemplate(hid);
      }
      await setDoc(doc(db, `households/${hid}/meta/seed`), { at: Date.now(), base: useBase });
      try {
        sessionStorage.setItem('cherry.welcome', '1'); // 첫 화면에서 가족 코드 안내
      } catch {
        /* 무시 */
      }
      await linkUser(hid, name.trim());
    });

  const join = () =>
    run(async () => {
      const c = code.trim().toUpperCase();
      if (c.length !== 6) throw new Error('가족 코드 6자리를 입력해 주세요.');
      if (!name.trim()) throw new Error('내 이름을 입력해 주세요.');
      await joinHousehold(c, name.trim());
      setPendingInvite(null);
    });

  const back = (to: Step) => (
    <button type="button" className="icon-btn ob-back" aria-label="뒤로" onClick={() => { setErr(''); setStep(to); }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
    </button>
  );
  const bars = (n: number) => (
    <div className="ob-top">
      {back(n === 1 ? 'start' : 'name')}
      <div className="ob-bars"><span className="on" /><span className={n === 2 ? 'on' : ''} /></div>
      <span className="muted small">{n}/2</span>
    </div>
  );
  const preview = dueDate ? dday(dueDate) : null;

  return (
    <div className="ob">
      {step === 'start' && (
        <>
          <h1>환영해요</h1>
          <p className="sub">어떻게 시작할까요?</p>
          <div className="ob-card main">
            <button type="button" className="ob-card-btn" onClick={() => setStep('name')}>
              <b>새로 시작할게요</b>
              <span>우리 가족을 연결하고, 배우자를 초대해요</span>
            </button>
            <label className="ob-check">
              <input id="ob-base" type="checkbox" checked={useBase} onChange={(e) => setUseBase(e.target.checked)} />
              <span>
                <b>기본 데이터(용품·신청)를 사용할게요</b>
                <small>용품 준비·신청 서류 목록을 넣어드려요. 상태는 모두 '살 것', '할 일'로 시작해요.</small>
              </span>
            </label>
          </div>
          <button type="button" className="ob-card" onClick={() => setStep('join')}>
            <b>배우자에게 초대받았어요</b>
            <span>가족 코드(6자리)로 같은 가족에 들어가요</span>
          </button>
        </>
      )}

      {step === 'name' && (
        <form className="ob-form" onSubmit={(e) => { e.preventDefault(); if (name.trim()) setStep('baby'); else setErr('내 이름을 입력해 주세요.'); }}>
          {bars(1)}
          <h1>우리 가족 연결</h1>
          <p className="sub">앱에서 보일 내 이름을 알려주세요. 끝나면 배우자에게 보낼 가족 코드가 생겨요.</p>
          <label className="field">
            <span className="lbl">내 이름</span>
            <input id="ob-name" className="fld" placeholder="예: 지수, 엄마, 아빠" value={name} maxLength={12} onChange={(e) => setName(e.target.value)} autoFocus />
            <span className="hint">배우자 화면에 '지수 · 11/20 수정'처럼 보여요. 나중에 바꿀 수 있어요.</span>
          </label>
          <button type="submit" className="btn-primary">다음</button>
        </form>
      )}

      {step === 'baby' && (
        <form className="ob-form" onSubmit={(e) => { e.preventDefault(); create(); }}>
          {bars(2)}
          <h1>아가 이름이 뭐예요?</h1>
          <p className="sub">홈 화면 D-day와 제목에 쓰여요.</p>
          <label className="field">
            <span className="lbl">태명 (아직 없으면 비워두세요)</span>
            <input id="ob-baby" className="fld" value={babyName} maxLength={10} onChange={(e) => setBabyName(e.target.value)} />
          </label>
          <label className="field">
            <span className="lbl">출산 예정일 *</span>
            <input id="ob-due" className="fld" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
          </label>
          {preview && (
            <div className="dday">
              <div>
                <div className="dday-sub">{babyName.trim() || '아기'} 만나기까지</div>
                <div className="dday-num">{preview.left > 0 ? `D-${preview.left}` : preview.left === 0 ? 'D-DAY' : `D+${-preview.left}`}</div>
              </div>
              <div className="dday-right">{dueDate.replace(/-/g, '.')} 예정{preview.left >= 0 && <><br />{preview.week}주 {preview.day}일</>}</div>
            </div>
          )}
          {progress && <div className="notice">{progress}</div>}
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? '연결하는 중…' : '우리 가족 연결하기'}</button>
        </form>
      )}

      {step === 'join' && (
        <form className="ob-form" onSubmit={(e) => { e.preventDefault(); join(); }}>
          {back('start')}
          <h1>가족에 들어가요</h1>
          <p className="sub">{pending ? '초대 링크로 들어왔어요. 내 이름만 입력하면 돼요.' : '배우자에게 받은 가족 코드와 내 이름을 입력해 주세요.'}</p>
          <label className="field">
            <span className="lbl">가족 코드</span>
            <input id="ob-code" className="fld code" autoCapitalize="characters" autoComplete="off" value={code} maxLength={6} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </label>
          <label className="field">
            <span className="lbl">내 이름</span>
            <input id="ob-name2" className="fld" placeholder="예: 민호, 아빠" value={name} maxLength={12} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? '들어가는 중…' : '들어가기'}</button>
        </form>
      )}

      {err && <div className="err">{err}</div>}
      <button type="button" className="link-btn center" onClick={() => signOut(auth)}>로그아웃</button>
    </div>
  );
}
