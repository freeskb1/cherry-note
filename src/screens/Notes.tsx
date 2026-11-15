import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../App';
import { remove, removePhoto, save, saveLists, savePhoto, usePhoto } from '../data';
import { compressImage } from '../image';
import { Note } from '../types';
import { matches, md } from '../util';
import { Chips, DeleteButton, Empty, Fab, Field, Icon, LinkText, SearchBox, Sheet, StarButton, useToast } from '../ui';

export default function Notes() {
  const { notes, lists, openId, clearOpen, ready } = useStore();
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('전체');
  const [editing, setEditing] = useState<Note | 'new' | null>(null);

  useEffect(() => {
    if (!openId) return;
    const n = notes.find((x) => x.id === openId);
    if (n) {
      setEditing(n);
      clearOpen();
    }
  }, [openId, notes, clearOpen]);

  const tags = useMemo(() => {
    const t = [...lists.noteTags];
    notes.forEach((n) => (n.tags || []).forEach((x) => !t.includes(x) && t.push(x)));
    return t;
  }, [notes, lists]);

  const shown = notes
    .filter((n) => tag === '전체' || (n.tags || []).includes(tag))
    .filter((n) => matches({ ...n, photoIds: [] }, q, [n.star ? '중요' : '']))
    .sort((a, b) => Number(!!b.star) - Number(!!a.star) || (b.updatedAt || 0) - (a.updatedAt || 0));

  return (
    <div className="page">
      <div className="title-row"><h1>정보 노트</h1><span className="muted">{notes.length}개</span></div>
      <SearchBox value={q} onChange={setQ} placeholder="제목·태그·내용·링크 전체 검색" />
      <Chips items={[{ key: '전체', label: '전체' }, ...tags.map((t) => ({ key: t, label: t }))]} value={tag} onChange={setTag} />
      <div className="list">
        {ready && shown.length === 0 && (
          <Empty title={q || tag !== '전체' ? '찾는 노트가 없어요' : '아직 노트가 없어요'} body={q || tag !== '전체' ? undefined : '병원·조리원에서 들은 것, 산모 케어 정보를 + 버튼으로 적어두세요.'} />
        )}
        {shown.map((n) => (
          <div key={n.id} className={'card' + (n.star ? ' starred' : '')} role="button" tabIndex={0} onClick={() => setEditing(n)} onKeyDown={(e) => e.key === 'Enter' && setEditing(n)}>
            <div className="card-top">
              <StarButton on={n.star} onToggle={() => save('notes', n.id, { star: !n.star })} />
              {(n.tags || []).map((t) => <span key={t} className="tag">{t}</span>)}
              {!!n.photoIds?.length && <span className="muted small push">사진 {n.photoIds.length}</span>}
            </div>
            <div className="card-title">{n.title}</div>
            {n.body && <div className="card-body">{n.body}</div>}
            <div className="card-foot">
              <span>{n.updatedBy} · {md(n.updatedAt)}</span>
              {n.link && <span className="push"><LinkText text={n.link} /></span>}
            </div>
          </div>
        ))}
      </div>
      <Fab label="노트 추가" onClick={() => setEditing('new')} />
      <NoteSheet editing={editing} tags={tags} onClose={() => setEditing(null)} />
    </div>
  );
}

function Thumb({ id, onRemove }: { id: string; onRemove: () => void }) {
  const url = usePhoto(id);
  return (
    <div className="thumb-wrap">
      {url ? <a href={url} target="_blank" rel="noreferrer"><img className="thumb" src={url} alt="첨부 사진" /></a> : <div className="thumb ph" />}
      <button type="button" className="thumb-x" aria-label="사진 빼기" onClick={onRemove}><Icon name="x" size={14} stroke={2.4} /></button>
    </div>
  );
}

function NoteSheet({ editing, tags, onClose }: { editing: Note | 'new' | null; tags: string[]; onClose: () => void }) {
  const { lists } = useStore();
  const toast = useToast();
  const isNew = editing === 'new';
  const blank: Omit<Note, 'id'> = { title: '', tags: [], body: '', link: '', photoIds: [], star: false };
  const [f, setF] = useState<Omit<Note, 'id'>>(blank);
  const [newTag, setNewTag] = useState('');
  const [removed, setRemoved] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing === 'new') setF(blank);
    else if (editing) setF({ ...blank, ...editing, tags: editing.tags || [], photoIds: editing.photoIds || [] });
    setNewTag('');
    setRemoved([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const set = (patch: Partial<Note>) => setF((x) => ({ ...x, ...patch }));
  const toggleTag = (t: string) => set({ tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] });

  const addTag = async () => {
    const t = newTag.trim();
    if (!t) return;
    if (!lists.noteTags.includes(t)) await saveLists({ noteTags: [...lists.noteTags, t] });
    if (!f.tags.includes(t)) set({ tags: [...f.tags, t] });
    setNewTag('');
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const ids: string[] = [];
      for (const file of Array.from(files).slice(0, 4)) ids.push(await savePhoto(await compressImage(file, 1280, 350_000)));
      set({ photoIds: [...(f.photoIds || []), ...ids] });
    } catch (e: any) {
      toast(e?.message || '사진을 올리지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!f.title.trim()) return;
    await save('notes', isNew ? null : (editing as Note).id, { ...f, title: f.title.trim() });
    await Promise.all(removed.map((id) => removePhoto(id)));
    toast(isNew ? '노트를 추가했어요' : '저장했어요');
    onClose();
  };

  return (
    <Sheet open={!!editing} onClose={onClose} full>
      <div className="sheet-head">
        <div className="sheet-title">{isNew ? '노트 추가' : '노트 수정'}</div>
        <button type="button" className={'star-pill' + (f.star ? ' on' : '')} aria-pressed={!!f.star} onClick={() => set({ star: !f.star })}>★ 중요</button>
      </div>
      <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="제목" htmlFor="nt-title"><input id="nt-title" className="fld" value={f.title} onChange={(e) => set({ title: e.target.value })} required /></Field>
        <Field label="태그 (여러 개 선택 가능)">
          <div className="tag-pick">
            {tags.map((t) => (
              <button key={t} type="button" className={'chip' + (f.tags.includes(t) ? ' on' : '')} aria-pressed={f.tags.includes(t)} onClick={() => toggleTag(t)}>{t}</button>
            ))}
          </div>
          <div className="inline">
            <input id="nt-newtag" className="fld" placeholder="새 태그" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} />
            <button type="button" className="btn-ghost" onClick={addTag}>추가</button>
          </div>
        </Field>
        <Field label="내용" htmlFor="nt-body"><textarea id="nt-body" className="fld area tall" value={f.body} onChange={(e) => set({ body: e.target.value })} /></Field>
        <Field label="링크·참고" htmlFor="nt-link"><input id="nt-link" className="fld" placeholder="링크, 책 페이지, 누구한테 들었는지 등" value={f.link} onChange={(e) => set({ link: e.target.value })} /></Field>
        <Field label="사진 (선택)">
          <div className="thumbs">
            {(f.photoIds || []).map((id) => (
              <Thumb key={id} id={id} onRemove={() => { set({ photoIds: (f.photoIds || []).filter((x) => x !== id) }); setRemoved((r) => [...r, id]); }} />
            ))}
            <button type="button" className="thumb add" aria-label="사진 추가" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? '…' : <Icon name="plus" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
          </div>
        </Field>
        <div className="actions">
          {!isNew && editing && (
            <DeleteButton onDelete={async () => {
              const n = editing as Note;
              await remove('notes', n.id);
              await Promise.all((n.photoIds || []).map((id) => removePhoto(id)));
              toast('삭제했어요');
              onClose();
            }} />
          )}
          <button type="submit" className="btn-primary grow" disabled={busy}>저장</button>
        </div>
      </form>
    </Sheet>
  );
}
