import { LOGO_TEXT } from '../data/treaty';

/**
 * 전 화면 상단 고정 로고.
 * 디자인 자산(로고 이미지) 미확보 → 텍스트 박스 플레이스홀더.
 * 실제 로고 교체 지점: src/assets/img/logo.* 로 교체 후 이 컴포넌트에서 <img> 사용.
 */
export function Logo() {
  return (
    <header className="kiosk-logo">
      <div className="kiosk-logo__box" role="img" aria-label={`${LOGO_TEXT} 로고`}>
        {LOGO_TEXT}
      </div>
    </header>
  );
}
