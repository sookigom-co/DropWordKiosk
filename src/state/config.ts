// 운영 타이밍/상수 (무인 키오스크).

/** 전역 무입력 타임아웃 — 이 시간 동안 입력이 없으면 첫 화면으로 복귀 */
export const IDLE_TIMEOUT_MS = 60_000;

/** 완료 화면 자동 리셋 대기 (10~15초 사이) */
export const DONE_RESET_MS = 12_000;

/** 문장 생성 로딩 총 시간 (3단계) */
export const GENERATING_MS = 3_000;
export const GENERATING_STAGES = 3;

/** 완성 문장 노출 시간(자동으로 인쇄 단계 진입) */
export const RESULT_HOLD_MS = 4_500;

/** 인쇄 진행 표시 최소 노출 시간(실제 인쇄가 더 빨라도 이 시간은 유지) */
export const PRINTING_MIN_MS = 2_000;
