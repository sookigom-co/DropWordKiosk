// 관리자 "테스트 프린트"용 랜덤 문장 조합(SOO-1170).
// 수식어(형용사)/대상(명사)/행동(동사)에서 각 1개를 랜덤 선택해
// 기존 완성 문장 파이프라인(composeSentence + 오버라이드)으로 조합한다.
// rng 를 주입 가능하게 해 시드 고정 테스트를 지원한다.

import { ADJECTIVES, NOUNS, VERBS, type WordItem } from '../data/words';
import { composeSentence } from './sentence';

/** 리스트에서 rng 로 1개 선택(기본 Math.random). */
export function pickRandom<T>(list: readonly T[], rng: () => number = Math.random): T {
  const idx = Math.floor(rng() * list.length) % list.length;
  return list[idx];
}

export interface TestPrintPick {
  adjective: WordItem;
  noun: WordItem;
  verb: WordItem;
  /** 협정문 인쇄에 그대로 넘길 완성 문장 */
  sentence: string;
}

/**
 * 수식어/대상/행동 각 1개를 랜덤 선택해 완성 문장까지 조합한다.
 * 실제 사용자가 STEP1~3 을 거친 것과 동일한 결과물을 만들어 인쇄 파이프라인에 태운다.
 */
export function pickTestPrint(rng: () => number = Math.random): TestPrintPick {
  const adjective = pickRandom(ADJECTIVES, rng);
  const noun = pickRandom(NOUNS, rng);
  const verb = pickRandom(VERBS, rng);
  const sentence = composeSentence({
    adjective: adjective.text,
    noun: noun.text,
    verb: verb.text,
  });
  return { adjective, noun, verb, sentence };
}
