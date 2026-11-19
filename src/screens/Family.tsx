import { useEffect, useState } from 'react';
import { useStore } from '../App';
import { FamilyRow, listFamilies, renameMe, saveTemplateFromMyFamily } from '../data';
import { session } from '../session';
import { md } from '../util';
import { Sheet, useToast } from '../ui';

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

function useInvite() {
  const { household, settings } = useStore();
  const code = household.code || '';
  const link = code ? `${location.origin}/#/join/${code}` : '';
  const text = `${settings.babyName ? settings.babyName + '네 ' : ''}출산 준비노트에 초대해요. 링크를 열고 가입하면 같은 가족으로 연결돼요.\n가족 코드: ${code}`;
  return { code, link, text, full: household.members.length >= 2 };
}

/** 가족 코드 + 보내기 버튼 */
function InviteBox() {
  const toast = useToast();
  const { code, link, text } = useInvite();
  if (!code) return null;
  return (
    <>
      <div className="code-box">
        <span className="code-text">{code}</span>
        <span className="muted small">1/2명</span>
      </div>
      <div className="two">
        <button type="button" className="btn-primary" onClick={async () => { if (!(await share(text, link))) toast((await copy(`${text}\n${link}`)) ? '초대 링크를 복사했어요' : '복사가 안 돼요. 코드를 직접 알려주세요'); }}>
          초대 링크 보내기
        </button>
        <button type="button" className="btn-ghost" onClick={async () => toast((await copy(link)) ? '링크를 복사했어요' : '복사가 안 돼요. 코드를 직접 알려주세요')}>
          링크 복사
        </button>
      </div>
      <div className="hint">배우자가 링크를 열고 가입하면 자동으로 우리 가족에 들어와요. 두 명이 다 차면 코드는 더 쓸 수 없어요.</div>
    </>
  );
}

/** 설정: 우리 가족 */
export function FamilyPanel() {
  const { household } = useStore();
  const toast = useToast();
  const [name, setName] = useState(session.name);
  const { code, full } = useInvite();

  return (
    <section className="panel">
      <div className="panel-row">
        <div className="t grow">우리 가족</div>
        {code && <span className="muted small">가족 코드 <b className="mono">{code}</b></span>}
      </div>
      <div className="member-row">
        {household.members.map((m) => (
          <span key={m} className="who">{household.names?.[m] || '이름 없음'}{m === session.uid ? ' (나)' : ''}</span>
        ))}
      </div>
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
      {full ? <div className="hint">두 사람이 함께 쓰고 있어요. 모든 기록은 이 두 사람만 볼 수 있어요.</div> : <InviteBox />}
    </section>
  );
}

/** 새 가족을 만든 직후 한 번: 가족 코드로 배우자 초대 */
export function WelcomeInvite() {
  const { settings, household } = useStore();
  const [open, setOpen] = useState(() => {
    try {
      return sessionStorage.getItem('cherry.welcome') === '1';
    } catch {
      return false;
    }
  });
  const close = () => {
    try {
      sessionStorage.removeItem('cherry.welcome');
    } catch {
      /* 무시 */
    }
    setOpen(false);
  };
  if (!open || household.members.length >= 2) return null;
  return (
    <Sheet open onClose={close}>
      <div className="sheet-title">{settings.babyName ? `${settings.babyName}네 준비노트가 생겼어요` : '우리 가족 준비노트가 생겼어요'}</div>
      <div className="hint">이제 배우자를 초대하면 모든 목록과 기록을 둘이 함께 봐요.</div>
      <InviteBox />
      <button type="button" className="btn-ghost" onClick={close}>나중에 할게요</button>
      <div className="hint center">초대는 설정 → 우리 가족에서도 할 수 있어요.</div>
    </Sheet>
  );
}

/** 관리자만 보임: 사용 중인 가족 목록 */
export function AdminFamiliesPanel() {
  const toast = useToast();
  const [rows, setRows] = useState<FamilyRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listFamilies().then(setRows);
  }, []);

  if (rows === null) return null; // 관리자가 아니면 안 보임

  return (
    <section className="panel admin-panel">
      <div className="panel-row">
        <span className="t grow">사용 중인 가족 · {rows.length}</span>
        <span className="small warn-label">관리자만 보임</span>
      </div>
      <div className="code-list">
        {rows.map((r) => (
          <div key={r.id} className="family-item">
            <div className="panel-row">
              <span className="mono">{r.code || '-'}</span>
              <b className="grow">{r.babyName || '아기'}</b>
              <span className="muted small">{md(r.createdAt)} 시작</span>
            </div>
            <div className="muted small">
              {r.people.map((p) => `${p.name || '이름 없음'} ${p.email}`).join(' · ')}
              {r.people.length < 2 && <span className="accent"> · 배우자 아직 안 들어옴</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="hint">누가 어떤 가족 코드로 시작했는지만 보여요. 각 가족의 목록·혈당 기록은 여기서 보이지 않아요.</div>
      <button
        type="button"
        className="btn-ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await saveTemplateFromMyFamily();
            toast(`기본 데이터를 갱신했어요 (용품 ${r.items} · 신청 ${r.admin})`);
          } catch {
            toast('기본 데이터를 저장하지 못했어요');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? '저장 중…' : '우리 목록으로 기본 데이터 갱신'}
      </button>
      <div className="hint">새로 시작하는 가족이 받는 용품·신청 목록이에요. 품목·카테고리·수량·우선순위만 저장되고 상태·메모·가격·구매처는 빠져요.</div>
    </section>
  );
}
