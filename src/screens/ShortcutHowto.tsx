import { useState } from 'react';
import { isAndroid, SHORTCUT_NAME, testPhoneAlarm } from '../phoneAlarm';
import { isIOS } from '../util';
import { useToast } from '../ui';

/** 폰 알람(단축어) 만드는 법 + 테스트. collapsible이면 '방법 보기'를 눌러야 펼쳐짐 */
export function ShortcutHowto({ collapsible }: { collapsible?: boolean }) {
  const toast = useToast();
  const [open, setOpen] = useState(!collapsible);
  if (!isIOS() && !isAndroid()) return <div className="hint">폰 알람은 아이폰·안드로이드 폰에서만 쓸 수 있어요.</div>;

  const test = (
    <button type="button" className="btn-ghost" onClick={() => { if (!testPhoneAlarm()) toast('이 폰에서는 열 수 없어요'); }}>
      테스트: 1분 뒤 울리게 해보기
    </button>
  );

  if (isAndroid()) {
    return (
      <div className="howto">
        안드로이드는 따로 준비할 게 없어요. 시계 앱에 그 시각 알람이 바로 생겨요. 기종에 따라 안 될 수 있으니 한 번 테스트해 보세요.
        {test}
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className="link-btn" onClick={() => setOpen(true)}>
        처음이면: 단축어 만드는 법 보기
      </button>
    );
  }

  return (
    <div className="howto">
      <b>단축어 만들기 (처음 한 번, 1분)</b>
      <ol>
        <li><b>단축어</b> 앱 → 오른쪽 위 <b>+</b></li>
        <li>맨 위 이름을 <b>{SHORTCUT_NAME}</b> 로 바꾸기 (띄어쓰기 없이)</li>
        <li>검색창에 <b>타이머</b> → <b>타이머 시작</b> 추가</li>
        <li>숫자 칸을 누르고 <b>단축어 입력</b> 선택, 단위는 <b>분</b>
          <br /><span className="muted">'단축어 입력'이 안 보이면: 아래 ⓘ → 공유 시트에서 보기 켜기 → 받는 유형 '텍스트'</span>
        </li>
        <li><b>완료</b></li>
      </ol>
      <div className="muted">앱이 측정까지 남은 시간(분)을 넘겨줘서, 식후 30분~2시간 어떤 설정이든 맞게 울려요. 무음 모드에서도 끌 때까지 울려요.</div>
      {test}
      <div className="muted">시계 앱 타이머가 1분으로 돌아가면 성공이에요. 처음에 '열기', '허용'을 물어보면 눌러주세요.</div>
    </div>
  );
}
