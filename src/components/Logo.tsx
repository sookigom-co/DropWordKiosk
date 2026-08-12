import logoUrl from '../assets/logo-cheorwon-yahaeng.png';

/**
 * 전 화면 상단 고정 로고.
 * 보더 제공 로고 이미지(철원 국가유산 야행)를 번들에 베이크해 오프라인으로 표시한다.
 * (텍스트가 사라지므로 alt 로 접근성 이름 유지 — SOO-1035)
 */
export function Logo() {
  return (
    <header className="kiosk-logo">
      <img className="kiosk-logo__img" src={logoUrl} alt="철원 국가유산 야행" />
    </header>
  );
}
