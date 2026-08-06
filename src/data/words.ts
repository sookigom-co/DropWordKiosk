// 단어 목록 — 출처: SOO-984 분석 문서 v7 §2 스토리보드(soo984_rfp_v3.pdf).
// STEP1 명사(대상) / STEP2 형용사(수식어) / STEP3 동사(행동).
// 문장 조합: 우리는 + [형용사] + [명사] + 을/를 + [동사]
//   예) 우리는 희망찬 미래를 만들어간다.

export interface WordItem {
  /** 안정적인 식별자 — 상태 저장/테스트용 */
  readonly id: string;
  /** 화면·문장·인쇄에 그대로 쓰는 표시 텍스트 */
  readonly text: string;
}

/** STEP1 — 평화 협정문에 담을 "대상"(명사). 원형 버블 11개. */
export const NOUNS: readonly WordItem[] = [
  { id: 'n-ongi', text: '온기' },
  { id: 'n-mirae', text: '미래' },
  { id: 'n-daehwa', text: '대화' },
  { id: 'n-yeoyu', text: '여유' },
  { id: 'n-jayu', text: '자유' },
  { id: 'n-anjeon', text: '안전' },
  { id: 'n-hoebok', text: '회복' },
  { id: 'n-ilsang', text: '일상' },
  { id: 'n-seoro', text: '서로' },
  { id: 'n-useum', text: '웃음' },
  { id: 'n-huimang', text: '희망' },
];

/**
 * STEP2 — 대상을 표현할 "말"(형용사/수식어). 낱말카드 물리 낙하.
 * 스토리보드 §2 에 표기된 카드를 그대로 수록(21개).
 * 참고: SOO-993 이슈 본문은 "형용사 20개"로 요약했으나, 원본 스토리보드 카드 수는 21개다.
 * 원본(SOO-984 §2)을 단일 진실 원천으로 삼는다. (README "콘텐츠 교체 지점" 참조)
 */
export const ADJECTIVES: readonly WordItem[] = [
  { id: 'a-useumgadeukhan', text: '웃음가득한' },
  { id: 'a-yeoyuroun', text: '여유로운' },
  { id: 'a-baeryeohaneun', text: '배려하는' },
  { id: 'a-jisokdoen', text: '지속된' },
  { id: 'a-hamkkehaneun', text: '함께하는' },
  { id: 'a-ttaseuhan', text: '따스한' },
  { id: 'a-poyongjeogin', text: '포용적인' },
  { id: 'a-huimangchan', text: '희망찬' },
  { id: 'a-hwalgichan', text: '활기찬' },
  { id: 'a-jonjunghaneun', text: '존중하는' },
  { id: 'a-hanadoen', text: '하나된' },
  { id: 'a-pyeonganhan', text: '평안한' },
  { id: 'a-balgeun', text: '밝은' },
  { id: 'a-janjanhan', text: '잔잔한' },
  { id: 'a-hwamokhan', text: '화목한' },
  { id: 'a-anjeonhan', text: '안전한' },
  { id: 'a-ttatteuthan', text: '따뜻한' },
  { id: 'a-haengbokhan', text: '행복한' },
  { id: 'a-pyeongonhan', text: '평온한' },
  { id: 'a-jayuroun', text: '자유로운' },
  { id: 'a-hwahaphaneun', text: '화합하는' },
];

/** STEP3 — 약속을 완성할 "행동"(동사). 낱말카드 정렬 낙하. 18개. */
export const VERBS: readonly WordItem[] = [
  { id: 'v-sojunghiyeoginda', text: '소중히 여긴다' },
  { id: 'v-chuguhanda', text: '추구한다' },
  { id: 'v-sotonghanda', text: '소통한다' },
  { id: 'v-jonjunghanda', text: '존중한다' },
  { id: 'v-yaksokhanda', text: '약속한다' },
  { id: 'v-jeonhaeganda', text: '전해간다' },
  { id: 'v-ieoganda', text: '이어간다' },
  { id: 'v-jikyeoganda', text: '지켜간다' },
  { id: 'v-silcheonhanda', text: '실천한다' },
  { id: 'v-kiwoganda', text: '키워간다' },
  { id: 'v-mandeureoganda', text: '만들어간다' },
  { id: 'v-gieokhanda', text: '기억한다' },
  { id: 'v-gakkunda', text: '가꾼다' },
  { id: 'v-hamkkehanda', text: '함께한다' },
  { id: 'v-akkyeoganda', text: '아껴간다' },
  { id: 'v-domneunda', text: '돕는다' },
  { id: 'v-baeryeohanda', text: '배려한다' },
  { id: 'v-bohohanda', text: '보호한다' },
];

/** id → WordItem 조회 헬퍼 */
export function findWord(list: readonly WordItem[], id: string): WordItem | undefined {
  return list.find((w) => w.id === id);
}
