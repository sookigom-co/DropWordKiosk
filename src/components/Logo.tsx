import logoUrl from '../assets/logo-cheorwon-yahaeng.png';

/**
 * 전 화면 상단 고정 로고.
 * 보더 제공 로고 이미지(철원 국가유산 야행)를 번들에 베이크해 오프라인으로 표시한다(SOO-1035).
 * SOO-1061 보더 요청으로 로고 클릭 시 효과 설정 패널을 여는 기능은 제거 — 순수 표시 전용.
 */
export function Logo() {
  return (
    <header className="kiosk-logo">
      <img className="kiosk-logo__img" src={logoUrl} alt="철원 국가유산 야행" />
    </header>
  );
}
