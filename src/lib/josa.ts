// 한국어 조사(을/를 등) 처리 유틸.
// 한글 음절의 받침(종성) 유무로 조사를 결정한다.
//   한글 음절 유니코드: 0xAC00(가) ~ 0xD7A3(힣)
//   (code - 0xAC00) % 28 === 0 이면 받침 없음, 아니면 받침 있음.

const HANGUL_BASE = 0xac00;
const HANGUL_END = 0xd7a3;
const JONGSEONG_COUNT = 28;

/**
 * 단어의 마지막 "의미 있는" 글자가 받침을 가지는지 판정한다.
 * - 마지막 글자가 한글 음절이면 종성 유무로 판정.
 * - 한글이 아니면(숫자/영문 등) null 반환 → 호출부에서 기본값 처리.
 */
export function hasBatchim(word: string): boolean | null {
  const trimmed = word.trimEnd();
  if (trimmed.length === 0) return null;
  const code = trimmed.charCodeAt(trimmed.length - 1);
  if (code < HANGUL_BASE || code > HANGUL_END) return null;
  return (code - HANGUL_BASE) % JONGSEONG_COUNT !== 0;
}

/**
 * 받침 유무에 따라 두 조사 중 하나를 고른다.
 * 한글이 아닌 경우 받침 있는 형태(withBatchim)를 기본값으로 사용한다.
 */
export function pickParticle(word: string, withBatchim: string, withoutBatchim: string): string {
  const batchim = hasBatchim(word);
  if (batchim === null) return withBatchim;
  return batchim ? withBatchim : withoutBatchim;
}

/** 목적격 조사: 받침 있으면 "을", 없으면 "를". */
export function objectParticle(word: string): string {
  return pickParticle(word, '을', '를');
}

/** 주격 조사: 받침 있으면 "이", 없으면 "가". */
export function subjectParticle(word: string): string {
  return pickParticle(word, '이', '가');
}

/** 보조사(주제): 받침 있으면 "은", 없으면 "는". */
export function topicParticle(word: string): string {
  return pickParticle(word, '은', '는');
}

/** 단어에 목적격 조사를 붙여 반환. 예) objectify('미래') → '미래를' */
export function objectify(word: string): string {
  return `${word}${objectParticle(word)}`;
}
