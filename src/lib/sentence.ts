// 제10조 완성 문장 조합.
// 형식: 우리는 + [형용사] + [명사] + 을/를 + [동사]
//   예) 우리는 희망찬 미래를 만들어간다.

import { objectify } from './josa';

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
  const object = objectify(noun);
  const body = `${SUBJECT} ${adjective} ${object} ${verb}`.replace(/\s+/g, ' ').trim();
  return body.endsWith('.') ? body : `${body}.`;
}
