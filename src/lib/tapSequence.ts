// 관리자 메뉴 진입용 "비밀 탭 시퀀스" 판정 헬퍼(SOO-1170).
// 일반 사용자가 실수로 열기 어렵게 3초 내 5회 연속 터치를 요구한다.
// 순수 함수로 분리해 타이머/DOM 없이 단위 테스트한다.

/** 관리자 메뉴 진입에 필요한 연속 탭 횟수 */
export const ADMIN_TAP_COUNT = 5;
/** 연속 탭으로 인정하는 시간 창(ms) */
export const ADMIN_TAP_WINDOW_MS = 3000;

/**
 * 새 탭 시각(now)을 이력에 추가하고, 시간 창(windowMs) 밖의 오래된 탭을 버린다.
 * 반환값은 새 이력 배열(불변) — 호출부가 ref 로 보관한다.
 */
export function pushTap(history: readonly number[], now: number, windowMs: number): number[] {
  return [...history, now].filter((t) => now - t < windowMs);
}

/** 이력이 요구 횟수 이상이면 트리거(관리자 메뉴 오픈). */
export function tapTriggered(history: readonly number[], requiredCount: number): boolean {
  return history.length >= requiredCount;
}
