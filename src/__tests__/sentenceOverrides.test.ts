// SOO-1148 — 완성 문장 오버라이드 전수 검증.
// 보더 제공 엑셀(260820) F열을 단일 진실 원천으로 삼아, composeSentence 가
// 4,158 전 조합에 대해 엑셀 문장과 정확히 일치하는지 확인한다.
import { describe, it, expect } from 'vitest';
import { composeSentence } from '../lib/sentence';
import overrides from '../data/sentenceOverrides.json';
// 엑셀 4,158행 전체(단일 진실 원천). JSON 모듈로 임포트(resolveJsonModule).
import rowsData from './fixtures/soo1147-rows.json';

interface Row {
  no: string;
  adjective: string;
  noun: string;
  josa: string;
  verb: string;
  /** 엑셀 F열 완성 문장(단일 진실 원천) */
  expected: string;
}

const rows = rowsData as Row[];

const OVERRIDES = overrides as Record<string, string>;

describe('sentenceOverrides (SOO-1148)', () => {
  it('오버라이드 맵은 1,048 엔트리다', () => {
    expect(Object.keys(OVERRIDES).length).toBe(1048);
  });

  it('4,158 전 조합의 composeSentence 결과가 엑셀 F열과 일치한다', () => {
    expect(rows.length).toBe(4158);
    const mismatches: string[] = [];
    for (const r of rows) {
      const actual = composeSentence({ adjective: r.adjective, noun: r.noun, verb: r.verb });
      if (actual !== r.expected) {
        mismatches.push(`${r.no}: got "${actual}" expected "${r.expected}"`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('오버라이드 존재 조합은 엑셀 문장을 그대로 반환한다(verbatim)', () => {
    for (const [key, sentence] of Object.entries(OVERRIDES)) {
      const [adjective, noun, verb] = key.split('|');
      expect(composeSentence({ adjective, noun, verb })).toBe(sentence);
    }
  });

  it('오버라이드가 없는 조합은 기존 조합 로직으로 폴백한다', () => {
    // 오버라이드에 없는 대표 조합 — 기본 josa/조합 결과를 유지해야 한다.
    const key = '희망찬|미래|만들어간다';
    expect(OVERRIDES[key]).toBeUndefined();
    expect(composeSentence({ adjective: '희망찬', noun: '미래', verb: '만들어간다' })).toBe(
      '우리는 희망찬 미래를 만들어간다.',
    );
  });
});
