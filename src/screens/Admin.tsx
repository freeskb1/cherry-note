import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../App';
import { remove, save } from '../data';
import { ADMIN_STATUS, ADMIN_STATUS_ORDER, AdminStatus, AdminTask, PERIOD, PERIOD_ORDER, Period } from '../types';
import { matches, md } from '../util';
import { DeleteButton, Empty, Fab, Field, Icon, LinkText, SearchBox, Seg, Sheet, StarButton, StatusMenu, useToast } from '../ui';

const tone = (s: AdminStatus) => ({ todo: 'st-todo', doing: 'st-wait', done: 'st-done', na: 'st-skip' })[s];
const OWNERS = ['광배', '민주', '같이'];

export default function Admin() {
  const { admin, openId, clearOpen, ready } = useStore();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [period, setPeriod] = useState<Period>('before');
  const [hideDone, setHideDone] = useState(false);
  const [editing, setEditing] = useState<AdminTask | 'new' | null>(null);

  useEffect(() => {
    if (!openId) return;
    const t = admin.find((x) => x.id === openId);
    if (t) {
      setEditing(t);
      setPeriod(t.period);
      clearOpen();
    }
  }, [openId, admin, clearOpen]);

  const left = useMemo(() => {
    const c: Record<Period, number> = { before: 0, right: 0, month: 0, after: 0 };
    admin.forEach((a) => (a.status === 'todo' || a.status === 'doing') && c[a.period]++);
    return c;
  }, [admin]);
  const totalLeft = Object.values(left).reduce((a, b) => a + b, 0);

  const rank: Record<AdminStatus, number> = { doing: 0, todo: 1, done: 2, na: 3 };
  const shown = admin
    .filter((a) => (q ? matches(a, q, [ADMIN_STATUS[a.status], PERIOD[a.period], a.star ? '중요' : '']) : a.period === period))
    .filter((a) => !hideDone || q || (a.status !== 'done' && a.status !== 'na'))
    .sort((a, b) => rank[a.status] - rank[b.status] || (a.order ?? 9e9) - (b.order ?? 9e9));

  const setTaskStatus = async (t: AdminTask, s: AdminStatus) => {
    const prev = t.status;
    await save('admin', t.id, { status: s });
    toast(`${t.title} → ${ADMIN_STATUS[s]}`, [{ label: '되돌리기', run: () => save('admin', t.id, { status: prev }) }]);
  };

  return (
    <div className="page">
      <div className="title-row"><h1>신청·서류</h1><span className="muted">남음 <b className="accent">{totalLeft}</b></span></div>
      <SearchBox value={q} onChange={setQ} placeholder="항목·신청처·기한·메모 전체 검색" />
      {!q ? (
        <Seg small items={PERIOD_ORDER.map((p) => ({ key: p, label: left[p] ? `${PERIOD[p]} ${left[p]}` : PERIOD[p] }))} value={period} onChange={setPeriod} />
      ) : (
        <div className="hint">검색 결과 {shown.length}개 · 모든 시기에서 찾았어요</div>
      )}
      {!q && (
        <label className="toggle-line">
          <input id="admin-hide" type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> 완료·해당없음 숨기기
        </label>
      )}

      <div className="list">
        {ready && shown.length === 0 && <Empty title={q ? '찾는 항목이 없어요' : `${PERIOD[period]}에 할 일이 없어요`} />}
        {shown.map((t) => {
          const done = t.status === 'done' || t.status === 'na';
          return (
            <div key={t.id} className={'row' + (done ? ' dim' : '')} role="button" tabIndex={0} onClick={() => setEditing(t)} onKeyDown={(e) => e.key === 'Enter' && setEditing(t)}>
              <button
                type="button"
                className={'check ' + tone(t.status)}
                aria-label={t.status === 'done' ? '완료 취소' : '완료로 표시'}
                onClick={(e) => { e.stopPropagation(); setTaskStatus(t, t.status === 'done' ? 'todo' : 'done'); }}
              >
                {t.status === 'done' && <Icon name="check" size={14} stroke={3} />}
                {t.status === 'doing' && <span className="dot" />}
              </button>
              <div className="row-body">
                <div className="row-title">
                  <span className={t.status === 'done' ? 'strike' : ''}>{t.title}</span>
                  {q && <span className="pri">{PERIOD[t.period]}</span>}
                </div>
                <div className="row-sub">{[t.place, t.owner && `담당 ${t.owner}`].filter(Boolean).join(' · ')}</div>
                {(t.due || t.link) && (
                  <div className="row-link">
                    {t.due && <span className="due">{t.due}</span>}
                    <LinkText text={t.link} />
                  </div>
                )}
                {t.memo && <div className="row-memo">{t.memo}</div>}
              </div>
              <div className="row-side">
                <StarButton on={t.star} onToggle={() => save('admin', t.id, { star: !t.star })} />
                <StatusMenu value={t.status} options={ADMIN_STATUS_ORDER} labels={ADMIN_STATUS} tone={tone} onChange={(s) => setTaskStatus(t, s)} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="hint pad">왼쪽 동그라미를 누르면 바로 완료돼요. 상태 칩을 누르면 진행중·해당없음으로 바꿀 수 있어요.</div>

      <Fab label="신청 항목 추가" onClick={() => setEditing('new')} />
      <TaskSheet editing={editing} defaultPeriod={period} onClose={() => setEditing(null)} />
    </div>
  );
}

function TaskSheet({ editing, defaultPeriod, onClose }: { editing: AdminTask | 'new' | null; defaultPeriod: Period; onClose: () => void }) {
  const toast = useToast();
  const isNew = editing === 'new';
  const blank: Omit<AdminTask, 'id'> = { title: '', period: defaultPeriod, status: 'todo', due: '', owner: '', place: '', link: '', memo: '', star: false };
  const [f, setF] = useState<Omit<AdminTask, 'id'>>(blank);

  useEffect(() => {
    if (editing === 'new') setF({ ...blank, period: defaultPeriod });
    else if (editing) setF({ ...blank, ...editing });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const set = (patch: Partial<AdminTask>) => setF((x) => ({ ...x, ...patch }));
  const submit = async () => {
    if (!f.title.trim()) return;
    await save('admin', isNew ? null : (editing as AdminTask).id, { ...f, title: f.title.trim(), ...(isNew ? { order: Date.now() } : {}) });
    toast(isNew ? '추가했어요' : '저장했어요');
    onClose();
  };

  return (
    <Sheet open={!!editing} onClose={onClose} full>
      <div className="sheet-head">
        <div>
          <div className="sheet-title">{isNew ? '신청 항목 추가' : '신청 항목 수정'}</div>
          {!isNew && editing && editing.updatedBy && <div className="muted small">{editing.updatedBy} · {md(editing.updatedAt)} 수정</div>}
        </div>
        <button type="button" className={'star-pill' + (f.star ? ' on' : '')} aria-pressed={!!f.star} onClick={() => set({ star: !f.star })}>★ 중요</button>
      </div>
      <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="항목" htmlFor="ad-title"><input id="ad-title" className="fld" value={f.title} onChange={(e) => set({ title: e.target.value })} required /></Field>
        <Field label="시기"><Seg items={PERIOD_ORDER.map((p) => ({ key: p, label: PERIOD[p] }))} value={f.period} onChange={(p) => set({ period: p })} /></Field>
        <Field label="상태"><Seg items={ADMIN_STATUS_ORDER.map((s) => ({ key: s, label: ADMIN_STATUS[s] }))} value={f.status} onChange={(s) => set({ status: s })} /></Field>
        <div className="two">
          <Field label="기한·가능일" htmlFor="ad-due"><input id="ad-due" className="fld" placeholder="예: 12/12부터, 2/20까지" value={f.due} onChange={(e) => set({ due: e.target.value })} /></Field>
          <Field label="담당">
            <Seg small items={OWNERS.map((o) => ({ key: o, label: o }))} value={f.owner || ''} onChange={(o) => set({ owner: f.owner === o ? '' : o })} />
          </Field>
        </div>
        <Field label="신청처" htmlFor="ad-place"><input id="ad-place" className="fld" value={f.place} onChange={(e) => set({ place: e.target.value })} /></Field>
        <Field label="링크·참고" htmlFor="ad-link"><input id="ad-link" className="fld" placeholder="사이트 주소, 방문처, 준비서류 등 자유롭게" value={f.link} onChange={(e) => set({ link: e.target.value })} /></Field>
        <Field label="메모" htmlFor="ad-memo"><textarea id="ad-memo" className="fld area" value={f.memo} onChange={(e) => set({ memo: e.target.value })} /></Field>
        <div className="actions">
          {!isNew && editing && <DeleteButton onDelete={async () => { await remove('admin', (editing as AdminTask).id); toast('삭제했어요'); onClose(); }} />}
          <button type="submit" className="btn-primary grow">저장</button>
        </div>
      </form>
    </Sheet>
  );
}
