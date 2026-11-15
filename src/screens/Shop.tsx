import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../App';
import { remove, save, saveLists } from '../data';
import { Item, PRIORITIES, Priority, SHOP_STATUS, SHOP_STATUS_ORDER, ShopStatus } from '../types';
import { matches, md } from '../util';
import { Chips, DeleteButton, Empty, Fab, Field, LinkText, SearchBox, Seg, Sheet, StarButton, StatusMenu, useToast } from '../ui';

const tone = (s: ShopStatus) => ({ todo: 'st-todo', wait: 'st-wait', done: 'st-done', skip: 'st-skip' })[s];
const ADD_CAT = '__add__';

export default function Shop() {
  const { items, lists, openId, clearOpen, ready } = useStore();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('전체');
  const [status, setStatus] = useState<ShopStatus>('todo');
  const [editing, setEditing] = useState<Item | 'new' | null>(null);

  useEffect(() => {
    if (!openId) return;
    const it = items.find((x) => x.id === openId);
    if (it) {
      setEditing(it);
      clearOpen();
    }
  }, [openId, items, clearOpen]);

  const cats = useMemo(() => {
    const set = [...lists.shopCategories];
    items.forEach((i) => !set.includes(i.category) && set.push(i.category));
    return set;
  }, [items, lists]);

  const counts = useMemo(() => {
    const c: Record<ShopStatus, number> = { todo: 0, wait: 0, done: 0, skip: 0 };
    items.filter((i) => cat === '전체' || i.category === cat).forEach((i) => c[i.status]++);
    return c;
  }, [items, cat]);

  const shown = items
    .filter((i) => cat === '전체' || i.category === cat)
    .filter((i) => (q ? matches(i, q, [SHOP_STATUS[i.status], i.star ? '중요' : '']) : i.status === status))
    .sort((a, b) => cats.indexOf(a.category) - cats.indexOf(b.category) || (a.order ?? 9e9) - (b.order ?? 9e9) || (a.createdAt || 0) - (b.createdAt || 0));

  const groups: { cat: string; rows: Item[] }[] = [];
  shown.forEach((i) => {
    const g = groups[groups.length - 1];
    if (g && g.cat === i.category) g.rows.push(i);
    else groups.push({ cat: i.category, rows: [i] });
  });

  const setItemStatus = async (it: Item, s: ShopStatus) => {
    const prev = it.status;
    await save('items', it.id, { status: s });
    toast(`${it.name} → ${SHOP_STATUS[s]}`, [{ label: '되돌리기', run: () => save('items', it.id, { status: prev }) }]);
  };

  return (
    <div className="page">
      <div className="title-row">
        <h1>용품 준비</h1>
        <span className="muted">전체 {items.length}</span>
      </div>
      <SearchBox value={q} onChange={setQ} placeholder="품목·카테고리·금액·구매처·메모 전체 검색" />
      <Chips items={[{ key: '전체', label: '전체' }, ...cats.map((c) => ({ key: c, label: c }))]} value={cat} onChange={setCat} />
      {!q ? (
        <Seg small items={SHOP_STATUS_ORDER.map((s) => ({ key: s, label: `${SHOP_STATUS[s]} ${counts[s]}` }))} value={status} onChange={setStatus} />
      ) : (
        <div className="hint">검색 결과 {shown.length}개 · 모든 상태에서 찾았어요</div>
      )}

      <div className="list">
        {ready && shown.length === 0 && <Empty title={q ? '찾는 항목이 없어요' : `${SHOP_STATUS[status]} 항목이 없어요`} body={q ? '다른 단어로 찾아보세요.' : undefined} />}
        {groups.map((g) => (
          <div key={g.cat} className="group">
            {(cat === '전체' || q) && <div className="group-head">{g.cat}</div>}
            {g.rows.map((it) => (
              <div key={it.id} className={'row' + (it.status === 'done' || it.status === 'skip' ? ' dim' : '')} onClick={() => setEditing(it)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setEditing(it)}>
                <StarButton on={it.star} onToggle={() => save('items', it.id, { star: !it.star })} />
                <div className="row-body">
                  <div className="row-title">
                    <span className={it.status === 'done' ? 'strike' : ''}>{it.name}</span>
                    {it.priority && it.status !== 'done' && it.status !== 'skip' && <span className={'pri ' + (it.priority === '필수' ? 'pri-must' : '')}>{it.priority}</span>}
                  </div>
                  <div className="row-sub">{[it.sub, it.qty, it.price && `${it.price}원`].filter(Boolean).join(' · ')}</div>
                  {it.place && <div className="row-link"><LinkText text={it.place} /></div>}
                  {it.memo && <div className="row-memo">{it.memo}</div>}
                  {it.updatedBy && <div className="row-by">{it.updatedBy} · {md(it.updatedAt)}</div>}
                </div>
                <StatusMenu value={it.status} options={SHOP_STATUS_ORDER} labels={SHOP_STATUS} tone={tone} onChange={(s) => setItemStatus(it, s)} />
              </div>
            ))}
          </div>
        ))}
      </div>

      <Fab label="항목 추가" onClick={() => setEditing('new')} />
      <ItemSheet editing={editing} cats={cats} defaultCat={cat === '전체' ? cats[0] : cat} onClose={() => setEditing(null)} />
    </div>
  );
}

function ItemSheet({ editing, cats, defaultCat, onClose }: { editing: Item | 'new' | null; cats: string[]; defaultCat: string; onClose: () => void }) {
  const { lists } = useStore();
  const toast = useToast();
  const isNew = editing === 'new';
  const blank: Omit<Item, 'id'> = { name: '', category: defaultCat || '', qty: '', price: '', place: '', memo: '', status: 'todo', priority: '권장', star: false };
  const [f, setF] = useState<Omit<Item, 'id'>>(blank);
  const [newCat, setNewCat] = useState<string | null>(null);

  useEffect(() => {
    if (editing === 'new') setF({ ...blank, category: defaultCat || '' });
    else if (editing) setF({ ...blank, ...editing });
    setNewCat(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const set = (patch: Partial<Item>) => setF((x) => ({ ...x, ...patch }));

  const submit = async () => {
    if (!f.name.trim()) return;
    let category = f.category;
    if (newCat !== null) {
      category = newCat.trim();
      if (!category) return;
      if (!lists.shopCategories.includes(category)) await saveLists({ shopCategories: [...lists.shopCategories, category] });
    }
    await save('items', isNew ? null : (editing as Item).id, { ...f, name: f.name.trim(), category, ...(isNew ? { order: Date.now() } : {}) });
    toast(isNew ? '추가했어요' : '저장했어요');
    onClose();
  };

  return (
    <Sheet open={!!editing} onClose={onClose}>
      <div className="sheet-head">
        <div>
          <div className="sheet-title">{isNew ? '항목 추가' : '항목 수정'}</div>
          {!isNew && editing && editing.updatedBy && <div className="muted small">{editing.updatedBy} · {md(editing.updatedAt)} 수정</div>}
        </div>
        <button type="button" className={'star-pill' + (f.star ? ' on' : '')} aria-pressed={!!f.star} onClick={() => set({ star: !f.star })}>★ 중요 · 홈에 표시</button>
      </div>
      <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="품목" htmlFor="it-name"><input id="it-name" className="fld" value={f.name} onChange={(e) => set({ name: e.target.value })} required /></Field>
        <Field label="카테고리" htmlFor="it-cat">
          {newCat === null ? (
            <select id="it-cat" className="fld" value={f.category} onChange={(e) => (e.target.value === ADD_CAT ? setNewCat('') : set({ category: e.target.value }))}>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
              <option value={ADD_CAT}>+ 새 카테고리 추가</option>
            </select>
          ) : (
            <div className="inline">
              <input id="it-cat" className="fld" autoFocus placeholder="새 카테고리 이름" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
              <button type="button" className="btn-ghost" onClick={() => setNewCat(null)}>취소</button>
            </div>
          )}
        </Field>
        <div className="two">
          <Field label="수량" htmlFor="it-qty"><input id="it-qty" className="fld" value={f.qty} onChange={(e) => set({ qty: e.target.value })} /></Field>
          <Field label="가격" htmlFor="it-price"><input id="it-price" className="fld" inputMode="numeric" value={f.price} onChange={(e) => set({ price: e.target.value })} /></Field>
        </div>
        <Field label="상태"><Seg items={SHOP_STATUS_ORDER.map((s) => ({ key: s, label: SHOP_STATUS[s] }))} value={f.status} onChange={(s) => set({ status: s })} /></Field>
        <Field label="우선순위"><Seg items={PRIORITIES.map((p) => ({ key: p, label: p }))} value={f.priority as Priority} onChange={(p) => set({ priority: p })} /></Field>
        <Field label="구매처·링크" htmlFor="it-place"><input id="it-place" className="fld" placeholder="링크, 공구, 쇼핑라이브 일정 등 자유롭게" value={f.place} onChange={(e) => set({ place: e.target.value })} /></Field>
        <Field label="메모" htmlFor="it-memo"><textarea id="it-memo" className="fld area" value={f.memo} onChange={(e) => set({ memo: e.target.value })} /></Field>
        <div className="actions">
          {!isNew && editing && <DeleteButton onDelete={async () => { await remove('items', (editing as Item).id); toast('삭제했어요'); onClose(); }} />}
          <button type="submit" className="btn-primary grow">저장</button>
        </div>
      </form>
    </Sheet>
  );
}
