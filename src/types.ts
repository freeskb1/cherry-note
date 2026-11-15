export type ShopStatus = 'todo' | 'wait' | 'done' | 'skip';
export const SHOP_STATUS: Record<ShopStatus, string> = { todo: '살 것', wait: '구매대기', done: '준비완료', skip: '제외' };
export const SHOP_STATUS_ORDER: ShopStatus[] = ['todo', 'wait', 'done', 'skip'];

export type Priority = '필수' | '권장' | '선택';
export const PRIORITIES: Priority[] = ['필수', '권장', '선택'];

interface Meta {
  id: string;
  star?: boolean;
  order?: number;
  updatedBy?: string;
  updatedAt?: number;
  createdAt?: number;
}

export interface Item extends Meta {
  name: string;
  category: string;
  sub?: string;
  qty?: string;
  price?: string;
  place?: string;
  memo?: string;
  status: ShopStatus;
  priority: Priority;
}

export type AdminStatus = 'todo' | 'doing' | 'done' | 'na';
export const ADMIN_STATUS: Record<AdminStatus, string> = { todo: '할 일', doing: '진행중', done: '완료', na: '해당없음' };
export const ADMIN_STATUS_ORDER: AdminStatus[] = ['todo', 'doing', 'done', 'na'];

export type Period = 'before' | 'right' | 'month' | 'after';
export const PERIOD: Record<Period, string> = { before: '출산 전', right: '출산 직후', month: '1개월 내', after: '그 이후' };
export const PERIOD_ORDER: Period[] = ['before', 'right', 'month', 'after'];

export interface AdminTask extends Meta {
  title: string;
  period: Period;
  status: AdminStatus;
  due?: string;
  owner?: string;
  place?: string;
  link?: string;
  memo?: string;
  priority?: string;
}

export interface Note extends Meta {
  title: string;
  tags: string[];
  body: string;
  link?: string;
  photoIds?: string[];
}

export type Slot = 'fasting' | 'breakfast' | 'lunch' | 'dinner';
export const SLOTS: Slot[] = ['fasting', 'breakfast', 'lunch', 'dinner'];
export const SLOT_LABEL: Record<Slot, string> = { fasting: '공복', breakfast: '아침', lunch: '점심', dinner: '저녁' };

export interface Sugar {
  id: string;
  date: string; // YYYY-MM-DD
  slot: Slot;
  value?: number | null;
  mealAt?: number | null;
  measureAt?: number | null;
  photoId?: string | null;
  memo?: string;
  updatedBy?: string;
  updatedAt?: number;
}

export interface Settings {
  dueDate: string;
  targetFasting: number;
  targetPost: number;
  starMax: number;
  lastBackupAt?: number | null;
}

export const DEFAULT_SETTINGS: Settings = {
  dueDate: '2027-01-21',
  targetFasting: 95,
  targetPost: 120,
  starMax: 6,
  lastBackupAt: null,
};

export interface Lists {
  shopCategories: string[];
  noteTags: string[];
}
