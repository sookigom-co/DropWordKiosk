// 평화 협정문 고정 텍스트 — 출처: SOO-984 §2 스토리보드(협정문 이미지 원문).
// 제1~9조는 고정, 제10조는 참가자가 완성한 문장으로 채운다.

export const TREATY_TITLE = '평화 협정문';

/** 제1~9조 고정 조문 (좌→우 순차 등장) */
export const TREATY_ARTICLES: readonly string[] = [
  '우리는 갈등보다 대화를 먼저 선택한다.',
  '우리는 서로의 다름을 존중한다.',
  '우리는 서로를 배려하며 따뜻한 마음을 나눈다.',
  '우리는 편견보다 이해를, 대립보다 화합을 선택한다.',
  '우리는 함께 사랑과 공존의 가치를 지켜 나간다.',
  '우리는 오늘의 작은 실천으로 내일의 평화를 만들어 간다.',
  '우리는 전쟁의 아픔을 기억하며 평화의 소중함을 잊지 않는다.',
  '우리는 평화의 가치를 다음 세대에도 이어 간다.',
  '우리는 오늘의 약속을 기억하며 평화를 함께 지켜 나간다.',
];

/** 제10조 접두 — 완성 문장이 붙는다. (완성 문장 자체가 "우리는 …"으로 시작) */
export const ARTICLE_10_PREFIX = '';

/**
 * 협정문 하단 작성일자를 `YYYY년 MM월 DD일` 형식으로 만든다(월·일 zero-pad).
 * 하드코딩하지 않고 렌더/인쇄 시점에 기기 로컬 시간(키오스크 Pi, KST) 기준으로
 * 호출부에서 `new Date()` 를 주입한다. 순수 함수 — 시스템 시계에 의존하지 않아
 * 고정 Date 주입으로 결정적 테스트가 가능하다.
 */
export function formatTreatyFooterDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}년 ${month}월 ${day}일`;
}

/** 상단 로고 자리 텍스트(디자인 자산 미확보 → 플레이스홀더). README 교체 지점 참조. */
export const LOGO_TEXT = '철원국가유산야행';
