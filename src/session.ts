/** 지금 로그인한 사람과 집 정보 (화면 밖 함수들이 쓰는 값) */
export const session = {
  uid: '',
  hid: '',
  name: '',
  babyName: '',
};

/** 집 안의 컬렉션 경로: households/{hid}/{col} */
export function hp(col: string): string {
  if (!session.hid) throw new Error('집 정보가 아직 없어요');
  return `households/${session.hid}/${col}`;
}

/** 헷갈리는 글자(0 O 1 I L) 뺀 32자 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function randomCode(len: number): string {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => ALPHABET[n % ALPHABET.length]).join('');
}

const PENDING = 'cherry.pendingInvite';
export function setPendingInvite(code: string | null) {
  try {
    if (code) localStorage.setItem(PENDING, code);
    else localStorage.removeItem(PENDING);
  } catch {
    /* 무시 */
  }
}
export function getPendingInvite(): string | null {
  try {
    return localStorage.getItem(PENDING);
  } catch {
    return null;
  }
}
