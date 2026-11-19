import { useEffect, useState } from 'react';
import { useStore } from '../App';
import {
  createInvite,
  createSignupCode,
  deleteSignupCode,
  listSignupCodes,
  myInvites,
  renameMe,
  SignupCode,
} from '../data';
import { session } from '../session';
import { md } from '../util';
import { useToast } from '../ui';

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function share(text: string, url: string): Promise<boolean> {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (!nav.share) return false;
  try {
    await nav.share({ text, url });
    return true;
  } catch {
    return false;
  }
}

const left = (at: number) => {
  const h = Math.max(0, Math.round((at - Date.now()) / 3600000));
  return h >= 24 ? `${Math.floor(h / 24)}일 ${h % 24}시간 남음` : `${h}시간 남음`;
};

/** 우리 집: 멤버, 내 이름, 배우자 초대 */
export function FamilyPanel() {
  const { household } = useStore();
  const toast = useToast();
  const [name, setName] = useState(session.name);
  const [invite, setInvite] = useState<{ code: string; expiresAt: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const full = household.members.length >= 2;

  useEffect(() => {
    if (!full) myInvites().then((l) => l.length && setInvite(l.sort((a, b) => b.expiresAt - a.expiresAt)[0])).catch(() => {});
  }, [full]);

  const link = invite ? `${location.origin}/#/join/${invite.code}` : '';
  const shareText = invite ? `출산 준비노트에 초대해요. 링크를 열고 가입하면 같은 공간에 들어와요.\n초대 코드: ${invite.code}` : '';

  return (
    <section className="panel">
      <div className="t">우리 집</div>
      {household.members.map((m) => (
        <div key={m} className="member-row">
          <span className="who">{household.names?.[m] || '이름 없음'}</span>
          {m === session.uid && <span className="muted small">나</span>}
        </div>
      ))}

      <div className="inline">
        <input id="fam-name" className="fld" value={name} maxLength={12} onChange={(e) => setName(e.target.value)} aria-label="내 이름" />
        <button
          type="button"
          className="btn-ghost"
          disabled={!name.trim() || name.trim() === session.name}
          onClick={async () => {
            await renameMe(name.trim());
            session.name = name.trim();
            toast('이름을 바꿨어요');
          }}
        >
          이름 바꾸기
        </button>
      </div>

      {full ? (
        <div className="hint">두 사람이 함께 쓰고 있어요. 모든 목록은 이 두 사람만 볼 수 있어요.</div>
      ) : (
        <>
          <div className="hint">배우자를 초대하면 용품·노트·신청·혈당 기록을 함께 봐요. 한 집에는 두 명까지 들어올 수 있어요.</div>
          {invite ? (
            <>
              <div className="code-box">
                <span className="code-text">{invite.code}</span>
                <span className="muted small">{left(invite.expiresAt)}</span>
              </div>
              <div className="two">
                <button type="button" className="btn-primary" onClick={async () => { if (!(await share(shareText, link))) { if (await copy(`${shareText}\n${link}`)) toast('초대 링크를 복사했어요'); else toast('복사가 안 돼요. 코드를 직접 알려주세요'); } }}>
                  초대 링크 보내기
                </button>
                <button type="button" className="btn-ghost" onClick={async () => toast((await copy(link)) ? '링크를 복사했어요' : '복사가 안 돼요. 코드를 직접 알려주세요')}>
                  링크 복사
                </button>
              </div>
              <div className="hint">배우자가 링크를 열고 가입하면 자동으로 들어와요. 앱에서 코드를 직접 입력해도 돼요. 코드는 72시간 동안 쓸 수 있어요.</div>
            </>
          ) : (
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  setInvite(await createInvite());
                } catch (e: any) {
                  toast(e?.message || '초대 코드를 만들지 못했어요');
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? '만드는 중…' : '배우자 초대 코드 만들기'}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/** 관리자만 보임: 지인에게 줄 가입 코드 */
export function AdminCodesPanel() {
  const toast = useToast();
  const [codes, setCodes] = useState<SignupCode[] | null>(null);
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => listSignupCodes().then(setCodes);
  useEffect(() => {
    load();
  }, []);

  if (codes === null) return null; // 관리자가 아니면 안 보임

  return (
    <section className="panel">
      <div className="t">가입 코드 (관리자)</div>
      <div className="hint">지인에게 줄 코드예요. 코드 하나로 집 하나를 만들 수 있고, 배우자는 그 집의 초대 링크로 들어와서 코드가 필요 없어요.</div>
      <div className="inline">
        <input id="adm-memo" className="fld" placeholder="누구에게 줄지 메모 (예: 지수네)" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={20} />
        <button
          type="button"
          className="btn-small"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const c = await createSignupCode(memo.trim());
              setMemo('');
              await load();
              toast((await copy(c)) ? `${c} 복사했어요` : `코드 ${c}`);
            } finally {
              setBusy(false);
            }
          }}
        >
          새 코드
        </button>
      </div>
      <div className="code-list">
        {codes.length === 0 && <div className="hint">아직 만든 코드가 없어요.</div>}
        {codes.map((c) => (
          <div key={c.code} className="code-item">
            <span className="mono">{c.code}</span>
            <span className="grow ell">{c.memo || ''}</span>
            {c.usedBy ? (
              <span className="muted small">{c.usedEmail || '사용됨'} · {md(c.usedAt)}</span>
            ) : (
              <>
                <button type="button" className="link-btn" onClick={async () => toast((await copy(c.code)) ? '복사했어요' : c.code)}>복사</button>
                <button type="button" className="link-btn" onClick={async () => { await deleteSignupCode(c.code); load(); }}>삭제</button>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
