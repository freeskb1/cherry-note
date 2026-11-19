import { useEffect, useState } from 'react';
import { useStore, Tab } from '../App';
import { session } from '../session';
import { useSugarMonth } from '../data';
import { ADMIN_STATUS, SHOP_STATUS, SLOT_LABEL } from '../types';
import { dday, hm, remain, today } from '../util';
import { Icon, Star } from '../ui';

interface Starred { key: string; from: '용품' | '노트' | '신청'; tab: Tab; id: string; title: string; side?: string; at: number }

export default function Home() {
  const { items, notes, admin, settings, go } = useStore();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const d = settings.dueDate ? dday(settings.dueDate) : null;
  const baby = settings.babyName || '아기';
  const sugar = useSugarMonth(today().slice(0, 7));
  const pending = sugar
    .filter((s) => s.date === today() && s.slot !== 'fasting' && s.mealAt && (s.value === null || s.value === undefined))
    .sort((a, b) => (a.measureAt || 0) - (b.measureAt || 0))[0];
  const fasting = sugar.find((s) => s.date === today() && s.slot === 'fasting');

  const starred: Starred[] = [
    ...items.filter((x) => x.star).map((x) => ({ key: 'i' + x.id, from: '용품' as const, tab: 'shop' as Tab, id: x.id, title: x.name, side: SHOP_STATUS[x.status], at: x.updatedAt || 0 })),
    ...notes.filter((x) => x.star).map((x) => ({ key: 'n' + x.id, from: '노트' as const, tab: 'notes' as Tab, id: x.id, title: x.title, at: x.updatedAt || 0 })),
    ...admin.filter((x) => x.star && x.status !== 'done' && x.status !== 'na').map((x) => ({ key: 'a' + x.id, from: '신청' as const, tab: 'admin' as Tab, id: x.id, title: x.title, side: x.due || ADMIN_STATUS[x.status], at: x.updatedAt || 0 })),
  ].sort((a, b) => b.at - a.at);
  const shown = starred.slice(0, settings.starMax);

  const backupOld = !settings.lastBackupAt || now - settings.lastBackupAt > 14 * 86400000;
  const tone = { 용품: 'from-shop', 노트: 'from-note', 신청: 'from-admin' };

  return (
    <div className="page">
      <header className="home-head">
        <div className="brand">{settings.babyName ? `${settings.babyName} 준비노트` : '출산 준비노트'}</div>
        <div className="head-right">
          <span className="who">{session.name}</span>
          <a href="#/settings" className="icon-btn" aria-label="설정"><Icon name="gear" size={20} /></a>
        </div>
      </header>

      {d ? (
        <section className="dday">
          <div>
            <div className="dday-sub">{baby} 만나기까지</div>
            <div className="dday-num">{d.left > 0 ? `D-${d.left}` : d.left === 0 ? 'D-DAY' : `D+${-d.left}`}</div>
          </div>
          <div className="dday-right">
            {settings.dueDate.replace(/-/g, '.')} 예정
            <br />
            {d.left >= 0 && `${d.week}주 ${d.day}일`}
          </div>
        </section>
      ) : (
        <a className="dday empty-dday" href="#/settings">
          <div>
            <div className="dday-sub">출산 예정일을 알려주세요</div>
            <div className="dday-num small-num">설정에서 입력</div>
          </div>
        </a>
      )}

      <div className="menus">
        <a className="menu-tile" href="#/shop"><span className="ico tint-shop"><Icon name="bag" size={20} /></span>용품 준비</a>
        <a className="menu-tile" href="#/notes"><span className="ico tint-note"><Icon name="note" size={20} /></span>정보 노트</a>
        <a className="menu-tile" href="#/admin"><span className="ico tint-admin"><Icon name="clip" size={20} /></span>신청·서류</a>
        <a className="menu-tile" href="#/sugar"><span className="ico tint-sugar"><Icon name="drop" size={20} /></span>혈당 일지</a>
      </div>

      {pending && pending.measureAt ? (
        <a className="alert-card" href="#/sugar">
          <Icon name="bell" color="var(--accent)" />
          <div className="grow">
            <div className="t">{SLOT_LABEL[pending.slot]} 식후 혈당 {hm(pending.measureAt)}</div>
            <div className="s">{remain(pending.measureAt, now)} · 눌러서 입력</div>
          </div>
        </a>
      ) : !fasting?.value ? (
        <a className="alert-card soft" href="#/sugar">
          <Icon name="drop" color="var(--accent)" />
          <div className="grow">
            <div className="t">오늘 공복 혈당</div>
            <div className="s">아직 입력 전이에요</div>
          </div>
        </a>
      ) : null}

      {backupOld && (
        <a className="alert-card warn" href="#/settings">
          <Icon name="clock" color="var(--warn-fg)" />
          <div className="grow">
            <div className="t">백업한 지 오래됐어요</div>
            <div className="s">설정에서 엑셀로 한 번 받아두세요</div>
          </div>
        </a>
      )}

      <section className="stack">
        <div className="sec-head">
          <span>중요 표시 <span className="muted">{shown.length} / 최대 {settings.starMax}</span></span>
          {starred.length > settings.starMax && <span className="muted small">+{starred.length - settings.starMax}개 더</span>}
        </div>
        {shown.length === 0 && <div className="hint">용품·노트·신청 어디서든 ★를 누르면 여기에 모여요.</div>}
        {shown.map((s) => (
          <button key={s.key} type="button" className="imp" onClick={() => go(s.tab, s.id)}>
            <Star on size={16} />
            <span className={'from ' + tone[s.from]}>{s.from}</span>
            <span className="grow ell">{s.title}</span>
            {s.side && <span className="muted small">{s.side}</span>}
          </button>
        ))}
      </section>
    </div>
  );
}
