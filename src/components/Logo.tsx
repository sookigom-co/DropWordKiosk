import logoUrl from '../assets/logo-cheorwon-yahaeng.png';

interface LogoProps {
  /**
   * 로고 터치 시 호출(SOO-1170). 관리자 메뉴 진입용 "비밀 탭 시퀀스" 카운트에 쓴다.
   * 매 터치마다 1회 호출되며, 연속 5회(3초 내) 판정은 호출부(App)가 담당한다.
   */
  onSecretTap?: () => void;
}

/**
 * 전 화면 상단 고정 로고.
 * 보더 제공 로고 이미지(철원 국가유산 야행)를 번들에 베이크해 오프라인으로 표시한다(SOO-1035).
 * SOO-1061 보더 요청으로 로고 클릭 시 효과 설정 패널을 여는 기능은 제거 — 순수 표시 전용.
 * SOO-1170: 관리자 메뉴 진입용 비밀 탭 트리거(onSecretTap)만 얇게 추가 — 시각/레이아웃 불변.
 */
export function Logo({ onSecretTap }: LogoProps) {
  return (
    <header className="kiosk-logo" onPointerDown={onSecretTap}>
      <img className="kiosk-logo__img" src={logoUrl} alt="철원 국가유산 야행" />
    </header>
  );
}
