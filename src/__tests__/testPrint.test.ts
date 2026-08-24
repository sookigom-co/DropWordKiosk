import { describe, it, expect } from 'vitest';
import { pickRandom, pickTestPrint } from '../lib/testPrint';
import { ADJECTIVES, NOUNS, VERBS } from '../data/words';
import { composeSentence } from '../lib/sentence';

/** 시드 고정 의사난수(mulberry32 유사) — 테스트 결정성 확보 */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('testPrint (SOO-1170)', () => {
  it('pickRandom 은 리스트 내 원소를 반환한다', () => {
    const rng = seededRng(1);
    for (let i = 0; i < 50; i++) {
      const item = pickRandom(NOUNS, rng);
      expect(NOUNS).toContain(item);
    }
  });

  it('pickTestPrint 는 각 카테고리에서 실제 단어를 뽑고 완성 문장을 조합한다', () => {
    const rng = seededRng(42);
    const pick = pickTestPrint(rng);
    expect(ADJECTIVES).toContain(pick.adjective);
    expect(NOUNS).toContain(pick.noun);
    expect(VERBS).toContain(pick.verb);
    // 인쇄 파이프라인과 동일한 조합 로직(오버라이드 포함)으로 문장을 만든다
    expect(pick.sentence).toBe(
      composeSentence({
        adjective: pick.adjective.text,
        noun: pick.noun.text,
        verb: pick.verb.text,
      }),
    );
    expect(pick.sentence.length).toBeGreaterThan(0);
    expect(pick.sentence.endsWith('.')).toBe(true);
  });

  it('rng=0 이면 각 리스트의 첫 원소를 뽑는다(경계값)', () => {
    const zero = () => 0;
    const pick = pickTestPrint(zero);
    expect(pick.adjective).toBe(ADJECTIVES[0]);
    expect(pick.noun).toBe(NOUNS[0]);
    expect(pick.verb).toBe(VERBS[0]);
  });
});
