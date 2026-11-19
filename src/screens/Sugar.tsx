import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../App';
import { cancelAlarm, remove, removePhoto, save, savePhoto, setAlarm, usePhoto, useSugarMonth } from '../data';
import { compressImage, shareToAlbum } from '../image';
import { enablePush, pushState, PushState } from '../push';
import { isNumOnly, SLOT_LABEL, SLOTS, Settings, Slot, Sugar } from '../types';
import { downloadIcs, durLabel, hm, isIOS, pad, remain, toTs, today, ymd } from '../util';
import { DeleteButton, Field, Icon, PhotoViewer, Sheet, useToast } from '../ui';
import { getAlarmMode, openPhoneAlarm, phoneAlarmSupported } from '../phoneAlarm';

const sid = (date: string, slot: Slot) => `${date}_${slot}`;
const targetOf = (st: Settings, slot: Slot) =>
  slot === 'fasting' ? st.targetFasting : slot === 'bedtime' ? st.targetBedtime || st.targetPost : st.targetPost;
const postTitle = (slot: Slot, min: number) => `${SLOT_LABEL[slot]} 식후 ${durLabel(min)} 혈당`;

export default function SugarScreen() {
  const { settings } = useStore();
  const toast = useToast();
  const [sel, setSel] = useState(today());
  const [ym, setYm] = useState(today().slice(0, 7));
  const rows = useSugarMonth(ym);
  const [now, setNow] = useState(Date.now());
  const [keypad, setKeypad] = useState<{ slot: Slot; date: string } | null>(null);
  const [editing, setEditing] = useState<Sugar | null>(null);
  const [push, setPush] = useState<PushState>('on');
  const camRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const pickSlot = useRef<Slot>('breakfast');

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    pushState().then(setPush);
    return () => clearInterval(t);
  }, []);

  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const postMin = settings.postMealMin || 120;
  const isHigh = (r: Sugar) => r.value != null && r.value >= targetOf(settings, r.slot);
  const highs = useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach((r) => {
      if (isHigh(r)) m[r.date] = (m[r.date] || 0) + 1;
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, settings]);

  // 달력
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => `${ym}-${pad(i + 1)}`)];
  const moveMonth = (d: number) => {
    const nd = new Date(y, m - 1 + d, 1);
    const nym = ymd(nd).slice(0, 7);
    setYm(nym);
    setSel(nym === today().slice(0, 7) ? today() : `${nym}-01`);
  };

  const selHigh = highs[sel] || 0;
  const [sy, sm, sd] = sel.split('-').map(Number);
  const weekday = '일월화수목금토'[new Date(sy, sm - 1, sd).getDay()];

  // 사진 찍기 → 자동 저장 + 설정한 시간 뒤 알람
  const openCamera = (slot: Slot, album = false) => {
    pickSlot.current = slot;
    (album ? albumRef : camRef).current?.click();
  };

  const onPhoto = async (file?: File | null) => {
    if (!file) return;
    const slot = pickSlot.current;
    const id = sid(sel, slot);
    const prev = byId.get(id);
    try {
      const data = await compressImage(file);
      const photoId = await savePhoto(data);
      // 오늘: 올린 시각 + 설정한 시간 뒤 알람 / 지난 날짜: 시간 없이 사진만 저장
      const isToday = sel === today();
      const mealAt = prev?.mealAt ?? (isToday ? Date.now() : null);
      const measureAt = prev?.measureAt ?? (mealAt ? mealAt + postMin * 60000 : null);
      await save('sugar', id, { date: sel, slot, photoId, mealAt, measureAt, value: prev?.value ?? null });
      if (prev?.photoId) await removePhoto(prev.photoId);
      const hasValue = prev?.value != null;
      if (!hasValue && measureAt) await setAlarm(id, measureAt, postTitle(slot, postMin), `${hm(measureAt)} 측정 시간이에요`);

      const actions = [
        {
          label: '되돌리기',
          run: async () => {
            await removePhoto(photoId);
            await cancelAlarm(id);
            if (prev) await save('sugar', id, { ...prev });
            else await remove('sugar', id);
          },
        },
      ];
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) actions.push({ label: '사진첩 저장', run: async () => { await shareToAlbum(file); } });
      const needAlarm = !hasValue && !!measureAt && measureAt > Date.now();
      const mode = getAlarmMode();
      const phoneLabel = `${SLOT_LABEL[slot]} 혈당 측정`;
      if (needAlarm && mode !== 'off' && phoneAlarmSupported()) {
        actions.push({ label: '폰 알람', run: async () => { openPhoneAlarm(measureAt!, phoneLabel); } });
      } else if (needAlarm && push !== 'on') {
        actions.push({ label: '캘린더', run: async () => downloadIcs(postTitle(slot, postMin), measureAt!) });
      }
      toast(hasValue ? '사진을 바꿨어요' : needAlarm ? `저장 · ${hm(measureAt)} 알람` : '사진을 저장했어요', actions, 7000);
      if (needAlarm && mode === 'auto') setTimeout(() => openPhoneAlarm(measureAt!, phoneLabel), 600);
    } catch (e: any) {
      toast(e?.message || '사진을 저장하지 못했어요');
    }
  };

  const slotRow = (slot: Slot) => {
    const r = byId.get(sid(sel, slot));
    const label = SLOT_LABEL[slot];
    if (isNumOnly(slot)) {
      return (
        <div key={slot} className={'slot' + (r && isHigh(r) ? ' high' : '')}>
          <div className="slab">{label}</div>
          <button type="button" className={'num' + (r?.value != null ? '' : ' empty')} onClick={() => setKeypad({ slot, date: sel })} aria-label={`${label} 혈당 입력`}>
            {r?.value ?? '입력'}
          </button>
          {r?.value != null && <Badge high={isHigh(r)} />}
          {r && (
            <button type="button" className="slot-more" onClick={() => setEditing(r)} aria-label={`${label} 기록 수정`}>
              {hm(r.measureAt)} <Icon name="next" size={16} />
            </button>
          )}
        </div>
      );
    }
    if (!r || (!r.mealAt && !r.photoId)) {
      return (
        <div key={slot} className="slot dashed">
          <div className="slab">{label}</div>
          <button type="button" className="cam" onClick={() => openCamera(slot)}>
            <span className="cam-ico"><Icon name="camera" /></span>
            <span className="cam-txt"><b>눌러서 바로 카메라</b><small>찍으면 자동 저장 · {durLabel(postMin)} 후 알람</small></span>
          </button>
          <button type="button" className="album" onClick={() => openCamera(slot, true)}>앨범</button>
        </div>
      );
    }
    if (r.value == null) {
      const due = r.measureAt || 0;
      // 오늘 기록만 측정 시각과 남은 시간을 보여줌. 지난 날짜는 사진 + 입력만
      const live = r.date === today() && !!due;
      return (
        <div key={slot} className={'slot' + (live ? ' active' : '')}>
          <div className="slab">{label}</div>
          <PhotoThumb id={r.photoId} onClick={() => setEditing(r)} />
          <button type="button" className="slot-info" onClick={() => setEditing(r)}>
            {live ? (
              <>
                <b>{hm(due)} 측정</b>
                <span className={due <= now ? 'late' : 'accent'}>{due <= now ? `${remain(due, now)} · 지금 재세요` : remain(due, now)}</span>
              </>
            ) : (
              <small>수치 입력 전</small>
            )}
          </button>
          {live && due > now && (getAlarmMode() !== 'off' && phoneAlarmSupported() ? (
            <button type="button" className="slot-bell" aria-label="폰 알람 다시 맞추기" onClick={() => openPhoneAlarm(due, `${label} 혈당 측정`)}><Icon name="bell" size={20} /></button>
          ) : push !== 'on' ? (
            <button type="button" className="slot-bell" aria-label="캘린더에 알람 넣기" onClick={() => downloadIcs(postTitle(slot, postMin), due)}><Icon name="bell" size={20} /></button>
          ) : null)}
          <button type="button" className="num go" onClick={() => setKeypad({ slot, date: sel })}>입력</button>
        </div>
      );
    }
    return (
      <button key={slot} type="button" className={'slot' + (isHigh(r) ? ' high' : '')} onClick={() => setEditing(r)}>
        <div className="slab">{label}</div>
        <PhotoThumb id={r.photoId} />
        <div className="slot-info">
          <span className="val-line"><b className={isHigh(r) ? 'val hi' : 'val'}>{r.value}</b><Badge high={isHigh(r)} /></span>
          {r.mealAt && r.measureAt ? <small>{hm(r.mealAt)} 식사 → {hm(r.measureAt)} 측정</small> : null}
        </div>
        <Icon name="next" size={18} color="var(--muted-2)" />
      </button>
    );
  };

  return (
    <div className="page">
      <div className="title-row">
        <h1>혈당 일지</h1>
        <div className="month-nav">
          <button type="button" className="icon-btn" aria-label="이전 달" onClick={() => moveMonth(-1)}><Icon name="back" size={18} /></button>
          <b>{y}년 {m}월</b>
          <button type="button" className="icon-btn" aria-label="다음 달" onClick={() => moveMonth(1)}><Icon name="next" size={18} /></button>
        </div>
      </div>

      <div className="cal">
        <div className="cal-grid wk">{'일월화수목금토'.split('').map((d, i) => <div key={d} className={i === 0 ? 'sun' : ''}>{d}</div>)}</div>
        <div className="cal-grid">
          {cells.map((c, i) => {
            if (!c) return <div key={'b' + i} />;
            const n = Math.min(highs[c] || 0, 3);
            const future = c > today();
            return (
              <button key={c} type="button" className={`day h${n}` + (c === sel ? ' sel' : '') + (future ? ' future' : '') + (c === today() ? ' today' : '')} onClick={() => setSel(c)} aria-label={`${Number(c.slice(8))}일${n ? `, 목표 초과 ${highs[c]}회` : ''}`}>
                {Number(c.slice(8))}
              </button>
            );
          })}
        </div>
        <div className="cal-legend">
          <span>목표 초과</span>
          <i className="lg h1" />1<i className="lg h2" />2<i className="lg h3" />3+
          <a href="#/settings" className="push">공복 {settings.targetFasting} · 식후 {settings.targetPost}{settings.bedtime ? ` · 자기 전 ${settings.targetBedtime || settings.targetPost}` : ''}</a>
        </div>
      </div>

      {push !== 'on' && (
        <div className="notice">
          {push === 'need-install' ? (
            <span>알림을 받으려면 사파리 공유 버튼 → <b>홈 화면에 추가</b> 후, 홈 화면 아이콘으로 열어주세요.</span>
          ) : push === 'denied' ? (
            <span>알림이 꺼져 있어요. 폰 설정 → 알림에서 이 앱을 허용해 주세요.</span>
          ) : push === 'unsupported' ? (
            <span>이 브라우저는 푸시 알림을 지원하지 않아요. 사진 저장 후 '캘린더' 버튼으로 알람을 등록하세요.</span>
          ) : (
            <>
              <span className="grow">식후 {durLabel(postMin)} 알람을 받으려면 알림을 켜주세요.</span>
              <button type="button" className="btn-small" onClick={async () => setPush(await enablePush())}>알림 켜기</button>
            </>
          )}
        </div>
      )}

      <div className="day-head">
        {sm}월 {sd}일 ({weekday}) {selHigh > 0 && <span className="muted">· 초과 {selHigh}회</span>}
        {sel !== today() && <button type="button" className="link-btn" onClick={() => { setYm(today().slice(0, 7)); setSel(today()); }}>오늘로</button>}
      </div>
      <div className="slots">{SLOTS.filter((s) => s !== 'bedtime' || settings.bedtime || byId.has(sid(sel, s))).map(slotRow)}</div>

      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={albumRef} type="file" accept="image/*" hidden onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />

      <Keypad
        target={keypad}
        current={keypad ? byId.get(sid(keypad.date, keypad.slot)) : undefined}
        targetValue={keypad ? targetOf(settings, keypad.slot) : settings.targetPost}
        postMin={postMin}
        onClose={() => setKeypad(null)}
      />
      <EditSheet rec={editing} settings={settings} onClose={() => setEditing(null)} />
    </div>
  );
}

function Badge({ high }: { high: boolean }) {
  return <span className={'badge ' + (high ? 'hi' : 'ok')}>{high ? '높음' : '정상'}</span>;
}

function PhotoThumb({ id, onClick }: { id?: string | null; onClick?: () => void }) {
  const url = usePhoto(id);
  const inner = url ? <img src={url} alt="식사 사진" /> : <span>사진</span>;
  return onClick ? (
    <button type="button" className="photo" onClick={onClick} aria-label="기록 보기">{inner}</button>
  ) : (
    <span className="photo">{inner}</span>
  );
}

/** 큰 숫자 키패드: 확인 누르면 바로 저장 */
function Keypad({ target, current, targetValue, postMin, onClose }: { target: { slot: Slot; date: string } | null; current?: Sugar; targetValue: number; postMin: number; onClose: () => void }) {
  const toast = useToast();
  const [v, setV] = useState('');
  useEffect(() => {
    setV(current?.value != null ? String(current.value) : '');
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!target) return null;
  const { slot, date } = target;
  const id = sid(date, slot);
  const press = (k: string) => setV((x) => (k === 'del' ? x.slice(0, -1) : x.length >= 3 ? x : (x + k).replace(/^0+/, '')));
  const num = Number(v);
  const high = v !== '' && num >= targetValue;

  const confirm = async () => {
    if (!v) return;
    const prev = current ? { ...current } : null;
    const measureAt = current?.measureAt ?? (date === today() ? Date.now() : null);
    await save('sugar', id, { date, slot, value: num, measureAt });
    await cancelAlarm(id);
    onClose();
    toast(`${SLOT_LABEL[slot]} ${num} 저장`, [
      {
        label: '되돌리기',
        run: async () => {
          if (prev) {
            await save('sugar', id, { ...prev, value: prev.value ?? null });
            if (prev.value == null && prev.measureAt && !isNumOnly(slot)) await setAlarm(id, prev.measureAt, postTitle(slot, postMin), `${hm(prev.measureAt)} 측정 시간이에요`);
          } else await remove('sugar', id);
        },
      },
    ]);
  };

  return (
    <Sheet open onClose={onClose}>
      <div className="sheet-head">
        <div className="sheet-title">{isNumOnly(slot) ? `${SLOT_LABEL[slot]} 혈당` : `${SLOT_LABEL[slot]} 식후 ${durLabel(current?.mealAt && current?.measureAt ? Math.round((current.measureAt - current.mealAt) / 60000) : postMin)}`}</div>
        <div className="muted">{current?.measureAt ? `${hm(current.measureAt)} 측정` : date === today() ? '지금' : date.slice(5).replace('-', '/')}</div>
      </div>
      <div className="kp-display" aria-live="polite">
        <span className={'kp-num' + (high ? ' hi' : '')}>{v || '0'}</span>
        <span className="muted">mg/dL</span>
      </div>
      <div className="kp-target">{high ? `목표 ${targetValue} 이상이에요` : `목표 ${targetValue} 미만`}</div>
      <div className="kp">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
          <button key={k} type="button" className="k" onClick={() => press(k)}>{k}</button>
        ))}
        <button type="button" className="k small" onClick={() => press('del')}>지우기</button>
        <button type="button" className="k" onClick={() => press('0')}>0</button>
        <button type="button" className="k ok" onClick={confirm} disabled={!v}>확인</button>
      </div>
    </Sheet>
  );
}

/** 기록 수정: 사진/수치/시간/메모/삭제 */
function EditSheet({ rec, settings, onClose }: { rec: Sugar | null; settings: Settings; onClose: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState('');
  const [mealT, setMealT] = useState('');
  const [measureT, setMeasureT] = useState('');
  const [memo, setMemo] = useState('');
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const url = usePhoto(photoId);

  useEffect(() => {
    if (!rec) return;
    setValue(rec.value != null ? String(rec.value) : '');
    setMealT(hm(rec.mealAt));
    setMeasureT(hm(rec.measureAt));
    setMemo(rec.memo || '');
    setPhotoId(rec.photoId || null);
  }, [rec]);

  if (!rec) return null;
  const meal = !isNumOnly(rec.slot);
  const target = targetOf(settings, rec.slot);
  const postMin = settings.postMealMin || 120;
  const gapMin = rec.mealAt && rec.measureAt ? Math.round((rec.measureAt - rec.mealAt) / 60000) : postMin;
  const num = value === '' ? null : Number(value);

  const changePhoto = async (file?: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      setPhotoId(await savePhoto(await compressImage(file)));
    } catch (e: any) {
      toast(e?.message || '사진을 올리지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    const mealAt = meal && mealT ? toTs(rec.date, mealT) : null;
    let measureAt = measureT ? toTs(rec.date, measureT) : null;
    // 식사 시간을 바꾸고 측정 시간은 그대로면 설정한 간격만큼 뒤로 맞춰줌
    if (meal && mealAt && mealT !== hm(rec.mealAt) && measureT === hm(rec.measureAt)) measureAt = mealAt + postMin * 60000;
    await save('sugar', rec.id, { value: num, mealAt, measureAt, memo, photoId: photoId || null });
    if (rec.photoId && rec.photoId !== photoId) await removePhoto(rec.photoId);
    if (meal && num == null && measureAt) await setAlarm(rec.id, measureAt, postTitle(rec.slot, mealAt ? Math.round((measureAt - mealAt) / 60000) : postMin), `${hm(measureAt)} 측정 시간이에요`);
    else await cancelAlarm(rec.id);
    toast('저장했어요');
    onClose();
  };

  const close = async () => {
    if (photoId && photoId !== rec.photoId) await removePhoto(photoId); // 저장 안 하고 닫으면 새로 올린 사진 정리
    onClose();
  };

  return (
    <Sheet open onClose={close}>
      <div className="sheet-head">
        <div className="sheet-title">{SLOT_LABEL[rec.slot]} 기록</div>
        <div className="muted small">{rec.date.slice(5).replace('-', '/')} · {rec.updatedBy}</div>
      </div>
      <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {meal && (
          <div className="photo-edit">
            {url ? <button type="button" className="photo-btn" onClick={() => setViewing(true)} aria-label="사진 크게 보기"><img src={url} alt="식사 사진" /></button> : <div className="ph">사진 없음</div>}
            <div className="col">
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? '올리는 중…' : '사진 바꾸기'}</button>
              {url && <button type="button" className="btn-ghost" onClick={() => setViewing(true)}>크게 보기</button>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { changePhoto(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        )}
        <Field label={meal ? `식후 ${durLabel(gapMin)} 혈당` : `${SLOT_LABEL[rec.slot]} 혈당`} htmlFor="sg-val">
          <div className="inline">
            <input id="sg-val" className={'fld big' + (num != null && num >= target ? ' hi' : '')} inputMode="numeric" pattern="[0-9]*" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 3))} />
            <span className="muted">mg/dL · 목표 {target} 미만</span>
          </div>
        </Field>
        <div className="two">
          {meal && <Field label="식사 시간" htmlFor="sg-meal"><input id="sg-meal" className="fld" type="time" value={mealT} onChange={(e) => setMealT(e.target.value)} /></Field>}
          <Field label="측정 시간" htmlFor="sg-measure"><input id="sg-measure" className="fld" type="time" value={measureT} onChange={(e) => setMeasureT(e.target.value)} /></Field>
        </div>
        <Field label="메모 (선택)" htmlFor="sg-memo"><input id="sg-memo" className="fld" value={memo} onChange={(e) => setMemo(e.target.value)} /></Field>
        {meal && num == null && measureT && toTs(rec.date, measureT) > Date.now() && getAlarmMode() !== 'off' && phoneAlarmSupported() && !isIOS() && (
          <button type="button" className="btn-ghost" onClick={() => openPhoneAlarm(toTs(rec.date, measureT), `${SLOT_LABEL[rec.slot]} 혈당 측정`)}>
            {measureT} 폰 알람 맞추기
          </button>
        )}
        <div className="actions">
          <DeleteButton
            onDelete={async () => {
              await remove('sugar', rec.id);
              await cancelAlarm(rec.id);
              await removePhoto(rec.photoId);
              if (photoId && photoId !== rec.photoId) await removePhoto(photoId);
              toast('기록을 지웠어요');
              onClose();
            }}
          />
          <button type="submit" className="btn-primary grow" disabled={busy}>저장</button>
        </div>
      </form>
      <PhotoViewer url={viewing ? url : null} onClose={() => setViewing(false)} />
    </Sheet>
  );
}
