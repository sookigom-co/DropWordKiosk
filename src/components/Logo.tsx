import logoUrl from '../assets/logo-cheorwon-yahaeng.png';
import { useFx } from '../state/fx-context';
import { FxPanel } from './FxPanel';

/**
 * 전 화면 상단 고정 로고.
 * 보더 제공 로고 이미지(철원 국가유산 야행)를 번들에 베이크해 오프라인으로 표시한다(SOO-1035).
 * 로고 클릭 시 Step 1 효과 설정 패널을 연다(SOO-1045) — 키오스크 오조작 방지를 위해
 * 이 로고 클릭이 유일한 진입점이며, 패널은 닫기 버튼/바깥 클릭으로 닫는다.
 */
export function Logo() {
  const { open, setOpen } = useFx();
  return (
    <header className="kiosk-logo">
      <button
        type="button"
        className="kiosk-logo__btn"
        aria-label="효과 설정 열기"
        onClick={() => setOpen(true)}
      >
        <img className="kiosk-logo__img" src={logoUrl} alt="철원 국가유산 야행" />
      </button>
      {open && <FxPanel />}
    </header>
  );
}
