import { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { useStore } from '../App';
import { auth, nameOf } from '../firebase';
import { saveSettings } from '../data';
import { enablePush, pushState, PushState, testLocalNotification } from '../push';
import { Field, Icon, Seg, useToast } from '../ui';
import { AlarmMode, getAlarmMode, openPhoneAlarm, phoneAlarmSupported, runShortcutTest, setAlarmMode, SHORTCUT_NAME } from '../phoneAlarm';
import { isIOS } from '../util';

const PUSH_TEXT: Record<PushState, string> = {
  on: '켜짐',
  off: '꺼짐',
  denied: '차단됨 · 폰 설정에서 허용해 주세요',
  unsupported: '이 브라우저는 지원 안 함',
  'need-install': '홈 화면에 추가한 앱에서만 켤 수 있어요',
};

export default function SettingsScreen() {
  const { settings } = useStore();
  const toast = useToast();
  const [push, setPush] = useState<PushState>('off');
  const [busy, setBusy] = useState('');
  const [f, setF] = useState(settings);
  const [alarmMode, setAlarmModeState] = useState<AlarmMode>(getAlarmMode());

  useEffect(() => {
    pushState().then(setPush);
  }, []);
  useEffect(() => setF(settings), [settings]);

  const saveNum = (key: 'targetFasting' | 'targetPost' | 'starMax', v: string) => {
    const n = Number(v);
    if (n > 0) saveSettings({ [key]: n });
  };

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    try {
      await fn();
      toast('백업 파일을 받았어요');
    } catch {
      toast('백업에 실패했어요. 인터넷 연결을 확인해 주세요');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="page">
      <div className="title-row">
        <a href="#/home" className="icon-btn" aria-label="홈으로"><Icon name="back" /></a>
        <h1 className="grow">설정</h1>
      </div>

      <section className="panel form">
        <Field label="출산 예정일" htmlFor="st-due">
          <input id="st-due" className="fld" type="date" value={f.dueDate} onChange={(e) => { setF({ ...f, dueDate: e.target.value }); if (e.target.value) saveSettings({ dueDate: e.target.value }); }} />
        </Field>
        <div className="two">
          <Field label="공복 목표 (미만)" htmlFor="st-f">
            <input id="st-f" className="fld" inputMode="numeric" value={f.targetFasting} onChange={(e) => setF({ ...f, targetFasting: Number(e.target.value.replace(/\D/g, '')) })} onBlur={(e) => saveNum('targetFasting', e.target.value)} />
          </Field>
          <Field label="식후 2시간 목표 (미만)" htmlFor="st-p">
            <input id="st-p" className="fld" inputMode="numeric" value={f.targetPost} onChange={(e) => setF({ ...f, targetPost: Number(e.target.value.replace(/\D/g, '')) })} onBlur={(e) => saveNum('targetPost', e.target.value)} />
          </Field>
        </div>
        <div className="hint">병원에서 받은 기준이 다르면 여기서 바꿔주세요. 달력 색과 '높음' 표시가 이 값을 따라요.</div>
        <Field label="홈에 보일 중요 항목 수" htmlFor="st-star">
          <input id="st-star" className="fld" inputMode="numeric" value={f.starMax} onChange={(e) => setF({ ...f, starMax: Number(e.target.value.replace(/\D/g, '')) })} onBlur={(e) => saveNum('starMax', e.target.value)} />
        </Field>
      </section>

      <section className="panel">
        <div className="panel-row">
          <div className="grow">
            <div className="t">혈당 알림</div>
            <div className="muted small">{PUSH_TEXT[push]}</div>
          </div>
          {push === 'off' && <button type="button" className="btn-small" onClick={async () => setPush(await enablePush())}>켜기</button>}
          {push === 'on' && <button type="button" className="btn-small ghost" onClick={async () => { if (!(await testLocalNotification())) toast('앱을 새로고침한 뒤 다시 시도해 주세요'); }}>테스트</button>}
        </div>
        <div className="hint">알림은 이 폰에서 각각 켜야 해요. 아이폰은 사파리 공유 → 홈 화면에 추가 → 그 아이콘으로 연 다음 켜주세요.</div>
      </section>

      <section className="panel">
        <div className="t">폰 알람 (무음에서도 울림)</div>
        <div className="muted small">
          {phoneAlarmSupported()
            ? isIOS()
              ? `식사 사진을 찍으면 아이폰 2시간 타이머가 자동으로 시작돼요. 처음 한 번 단축어 '${SHORTCUT_NAME}'를 만들어야 해요.`
              : '시계 앱에 알람을 맞춰요. 기종에 따라 동작하지 않을 수 있어요.'
            : '아이폰·안드로이드 폰에서만 쓸 수 있어요.'}
        </div>
        {phoneAlarmSupported() && (
          <>
            <Seg
              items={[
                { key: 'off', label: '안 씀' },
                { key: 'button', label: '버튼으로' },
                { key: 'auto', label: '사진 찍으면 자동' },
              ]}
              value={alarmMode}
              onChange={(m) => { setAlarmModeState(m); setAlarmMode(m); }}
            />
            <button type="button" className="btn-ghost" onClick={() => { const ok = isIOS() ? runShortcutTest() : openPhoneAlarm(Date.now() + 2 * 60000, '체리 알람 테스트'); if (!ok) toast('이 폰에서는 열 수 없어요'); }}>
              {isIOS() ? '테스트: 단축어 실행해보기' : '테스트: 2분 뒤 알람 맞추기'}
            </button>
            {isIOS() && (
              <div className="howto">
                <b>단축어 만들기 (처음 한 번, 30초)</b>
                <ol>
                  <li>단축어 앱 → 오른쪽 위 <b>+</b></li>
                  <li>맨 위 이름을 <b>{SHORTCUT_NAME}</b> 로 바꾸기 (띄어쓰기 없이)</li>
                  <li>검색창에 <b>타이머</b> → <b>타이머 시작</b> → 시간을 <b>2시간</b>으로</li>
                  <li><b>완료</b> → 위 테스트 버튼 눌러서 시계 앱 타이머가 시작되면 성공 (테스트 후 타이머는 취소)</li>
                </ol>
              </div>
            )}
          </>
        )}
        <div className="hint">이 설정은 폰마다 따로예요. 혈당을 재는 사람 폰에서 켜주세요.</div>
      </section>

      <section className="panel">
        <div className="t">백업</div>
        <div className="muted small">
          마지막 백업: {settings.lastBackupAt ? new Date(settings.lastBackupAt).toLocaleString('ko-KR') : '아직 없음'}
        </div>
        <div className="btn-col">
          <button type="button" className="btn-primary" disabled={!!busy} onClick={() => run('x', async () => (await import('../backup')).backupExcel())}>{busy === 'x' ? '만드는 중…' : '엑셀로 받기 (사진 제외)'}</button>
          <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => run('j', async () => (await import('../backup')).backupJson())}>{busy === 'j' ? '만드는 중…' : '전체 백업 받기 (사진 포함, JSON)'}</button>
        </div>
        <div className="hint">2주가 지나면 홈에 백업 알림이 떠요.</div>
      </section>

      <section className="panel">
        <div className="panel-row">
          <div className="grow">
            <div className="t">{nameOf(auth.currentUser?.email)}</div>
            <div className="muted small">{auth.currentUser?.email}</div>
          </div>
          <button type="button" className="btn-small ghost" onClick={() => signOut(auth)}>로그아웃</button>
        </div>
      </section>
    </div>
  );
}
