import * as XLSX from 'xlsx';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { hp } from './session';
import { saveSettings } from './data';
import { ADMIN_STATUS, AdminStatus, PERIOD, Period, SHOP_STATUS, SLOT_LABEL, ShopStatus, Slot } from './types';
import { downloadBlob, hm, today } from './util';

type Row = Record<string, any>;
async function all(name: string): Promise<Row[]> {
  const snap = await getDocs(collection(db, hp(name)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Row);
}

const when = (ts?: number) => (ts ? new Date(ts).toLocaleString('ko-KR') : '');

/** 사람이 열어보기 좋은 엑셀 백업 (사진 제외) */
export async function backupExcel() {
  const [items, notes, admin, sugar] = await Promise.all([all('items'), all('notes'), all('admin'), all('sugar')]);
  const wb = XLSX.utils.book_new();
  const sheet = (rows: object[], name: string) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);

  sheet(
    items
      .sort((a, b) => (a.order ?? 9e9) - (b.order ?? 9e9))
      .map((r) => ({
        카테고리: r.category, 세부: r.sub || '', 품목: r.name, 수량: r.qty || '', 가격: r.price || '',
        상태: SHOP_STATUS[r.status as ShopStatus] || r.status, 우선순위: r.priority || '', 중요: r.star ? '★' : '',
        구매처링크: r.place || '', 메모: r.memo || '', 수정: `${r.updatedBy || ''} ${when(r.updatedAt)}`,
      })),
    '용품 준비'
  );
  sheet(
    notes.map((r) => ({
      제목: r.title, 태그: (r.tags || []).join(', '), 내용: r.body || '', 링크참고: r.link || '',
      사진수: (r.photoIds || []).length, 중요: r.star ? '★' : '', 수정: `${r.updatedBy || ''} ${when(r.updatedAt)}`,
    })),
    '정보 노트'
  );
  sheet(
    admin
      .sort((a, b) => (a.order ?? 9e9) - (b.order ?? 9e9))
      .map((r) => ({
        시기: PERIOD[r.period as Period] || r.period, 항목: r.title, 상태: ADMIN_STATUS[r.status as AdminStatus] || r.status,
        기한: r.due || '', 담당: r.owner || '', 신청처: r.place || '', 링크참고: r.link || '', 메모: r.memo || '',
        중요: r.star ? '★' : '', 수정: `${r.updatedBy || ''} ${when(r.updatedAt)}`,
      })),
    '신청·서류'
  );
  const slotOrder: Slot[] = ['fasting', 'breakfast', 'lunch', 'dinner', 'bedtime'];
  sheet(
    sugar
      .sort((a, b) => (a.date === b.date ? slotOrder.indexOf(a.slot) - slotOrder.indexOf(b.slot) : a.date < b.date ? -1 : 1))
      .map((r) => ({
        날짜: r.date, 구분: SLOT_LABEL[r.slot as Slot], 수치: r.value ?? '', 식사시간: hm(r.mealAt), 측정시간: hm(r.measureAt),
        사진: r.photoId ? 'O' : '', 메모: r.memo || '',
      })),
    '혈당 일지'
  );
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `준비노트_백업_${today()}.xlsx`);
  await saveSettings({ lastBackupAt: Date.now() });
}

/** 사진까지 포함한 전체 백업(JSON). 나중에 복원할 때 쓰는 원본 */
export async function backupJson() {
  const names = ['items', 'notes', 'admin', 'sugar', 'photos', 'meta'];
  const data: Record<string, unknown> = { exportedAt: new Date().toISOString() };
  for (const n of names) data[n] = await all(n);
  downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `준비노트_전체백업_${today()}.json`);
  await saveSettings({ lastBackupAt: Date.now() });
}
