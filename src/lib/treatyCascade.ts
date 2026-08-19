// 협정문 cascade 노출 애니메이션 파라미터(화면 전용, SOO-1123).
//
// 노출 순서(order): 0 = 제목("평화 협정문"), 1..9 = 제1~9조, 10 = 제10조 빈칸, 11 = 작성일자.
// 규칙(보더 원문): 각 항목은 "최종 위치보다 동일한 오프셋(offsetY)만큼 아래"에서 흐리게 등장했다가
// 진해지며 제자리로 위로 이동한다. 오프셋 벡터(delta = 시작 − 최종)는 모든 항목이 공유하므로,
// 항목들은 항상 직전 항목 아래쪽에서 등장 → 위로 이동하는 연쇄(cascade) 리듬을 만든다.
// y 는 translateY(transform)라 레이아웃 흐름에 영향을 주지 않는다 → 레이아웃 시프트 0.

export const CASCADE = {
  /** 공유 시작 오프셋(px). 모든 항목이 최종 위치보다 이만큼 아래에서 등장 후 위로 이동. */
  offsetY: 64,
  /** 흐림 시작값(px). 등장하며 blur(0)으로 선명해진다. */
  blurPx: 8,
  /** 제목 시작 확대 배율(화면 중앙에서 "크게" 나타났다가 1.0으로 축소되며 상단 정착). */
  titleScale: 1.55,
  /** 제목이 중앙 느낌으로 아래에서 시작하도록 하는 추가 하강량(px). */
  titleOffsetY: 96,
  /** 제목 등장 지속 시간(초). */
  titleDur: 0.7,
  /** 조문/빈칸/날짜 각 항목 지속 시간(초). */
  itemDur: 0.55,
  /** 항목 간 등장 간격(초). step < itemDur → 이전 항목이 정착하는 중 다음 항목이 등장(오버랩). */
  step: 0.28,
  /** 제목 등장 후 제1조 등장까지의 선행 시간(초). */
  titleLead: 0.35,
  /** easeOutCubic 계열 — 빠르게 나타났다가 부드럽게 정착. */
  ease: [0.22, 1, 0.36, 1] as const,
};

/** 총 노출 항목 수: 제목(1) + 제1~9조(9) + 제10조 빈칸(1) + 작성일자(1) = 12. */
export const CASCADE_ITEM_COUNT = 12;

/**
 * 항목 순번(order)의 등장 지연(초).
 * order 0(제목)은 0, 이후 항목은 titleLead 부터 step 간격으로 누적된다.
 */
export function cascadeDelay(order: number): number {
  if (order <= 0) return 0;
  return CASCADE.titleLead + (order - 1) * CASCADE.step;
}

/** 마지막 항목 등장이 끝날 때까지의 전체 소요 시간(초). */
export function cascadeTotal(itemCount: number = CASCADE_ITEM_COUNT): number {
  const last = Math.max(0, itemCount - 1);
  return cascadeDelay(last) + CASCADE.itemDur;
}
