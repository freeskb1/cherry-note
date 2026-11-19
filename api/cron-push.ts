// Vercel 서버리스 함수: cron-job.org가 1분마다 호출
// alarms 컬렉션에서 시간이 된 알람을 찾아 그 집 두 사람 폰으로 푸시를 보내고 지운다.
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

const LATE_LIMIT_MS = 2 * 60 * 60 * 1000; // 2시간 넘게 밀린 알람은 보내지 않고 정리

function init() {
  if (getApps().length) return;
  const raw = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64 || '', 'base64').toString('utf8');
  initializeApp({ credential: cert(JSON.parse(raw)) });
}

export default async function handler(req: any, res: any) {
  const key = (req.query && req.query.key) || req.headers['x-cron-key'];
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
    res.status(401).json({ ok: false });
    return;
  }
  try {
    init();
    const db = getFirestore();
    const now = Date.now();
    const due = await db.collection('alarms').where('fireAt', '<=', now).limit(20).get();
    if (due.empty) {
      res.status(200).json({ ok: true, sent: 0 });
      return;
    }

    let sent = 0;

    for (const alarm of due.docs) {
      const a = alarm.data();
      // 그 집 사람들 폰으로만 보냄 (집 정보가 없는 예전 알람은 보내지 않고 정리)
      const tokenDocs = a.householdId
        ? (await db.collection('tokens').where('householdId', '==', a.householdId).get()).docs
        : [];
      const tokens = tokenDocs.map((d) => d.get('token') as string).filter(Boolean);
      if (tokens.length && now - a.fireAt < LATE_LIMIT_MS) {
        const r = await getMessaging().sendEachForMulticast({
          tokens,
          data: { title: String(a.title || '혈당 측정 시간'), body: String(a.body || ''), url: '/#/sugar', tag: alarm.id },
          webpush: { headers: { Urgency: 'high', TTL: '1800' } },
        });
        sent += r.successCount;
        // 더 이상 유효하지 않은 토큰 정리
        await Promise.all(
          r.responses.map((x, i) => {
            const code = x.error?.code || '';
            if (!x.success && (code.includes('not-registered') || code.includes('invalid-registration-token'))) {
              return tokenDocs[i].ref.delete();
            }
            return null;
          })
        );
      }
      await alarm.ref.delete();
    }
    res.status(200).json({ ok: true, sent });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
