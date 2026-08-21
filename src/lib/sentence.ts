// 제10조 완성 문장 조합.
// 형식: 우리는 + [형용사] + [명사] + 을/를 + [동사]
//   예) 우리는 희망찬 미래를 만들어간다.

import { objectify } from './josa';
import sentenceOverridesRaw from '../data/sentenceOverrides.json';

/**
 * 완성 문장 오버라이드 맵(SOO-1148).
 * 보더 제공 엑셀(260820)의 F열을 단일 진실 원천으로 삼아, 기본 조합 로직과
 * 다른 1,048개 조합에 대해 엑셀 문장을 한 글자도 다듬지 않고 그대로 출력한다.
 * 키 = `${adjective}|${noun}|${verb}`, 값 = 엑셀 F열 문장(마침표 포함).
 * 미존재 조합은 아래 조합 로직으로 폴백한다.
 */
const OVERRIDES = sentenceOverridesRaw as Record<string, string>;

export interface SentenceParts {
  /** STEP2 형용사(수식어) */
  adjective: string;
  /** STEP1 명사(대상) */
  noun: string;
  /** STEP3 동사(행동) */
  verb: string;
}

export const SUBJECT = '우리는';

/**
 * 세 단어를 문장으로 조합한다.
 * - 명사 뒤 을/를 은 받침 유무로 자동 결정.
 * - 문장은 마침표로 끝난다(동사에 이미 마침표가 있으면 중복 추가하지 않음).
 */
export function composeSentence({ adjective, noun, verb }: SentenceParts): string {
  // 오버라이드 우선: 엑셀 F열 문장이 있으면 그대로 반환(verbatim 정책).
  const override = OVERRIDES[`${adjective}|${noun}|${verb}`];
  if (override !== undefined) return override;

  const object = objectify(noun);
  const body = `${SUBJECT} ${adjective} ${object} ${verb}`.replace(/\s+/g, ' ').trim();
  return body.endsWith('.') ? body : `${body}.`;
}
