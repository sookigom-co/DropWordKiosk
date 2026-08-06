import { describe, it, expect } from 'vitest';
import {
  hasBatchim,
  objectParticle,
  subjectParticle,
  topicParticle,
  objectify,
} from '../lib/josa';
import { NOUNS } from '../data/words';

describe('hasBatchim', () => {
  it('받침 없는 음절은 false', () => {
    expect(hasBatchim('미래')).toBe(false);
    expect(hasBatchim('대화')).toBe(false);
    expect(hasBatchim('서로')).toBe(false);
  });

  it('받침 있는 음절은 true', () => {
    expect(hasBatchim('안전')).toBe(true);
    expect(hasBatchim('웃음')).toBe(true);
    expect(hasBatchim('희망')).toBe(true);
    expect(hasBatchim('일상')).toBe(true);
  });

  it('한글이 아니면 null', () => {
    expect(hasBatchim('AB')).toBeNull();
    expect(hasBatchim('123')).toBeNull();
    expect(hasBatchim('')).toBeNull();
  });

  it('끝 공백은 무시한다', () => {
    expect(hasBatchim('미래 ')).toBe(false);
    expect(hasBatchim('안전  ')).toBe(true);
  });
});

describe('objectParticle (을/를)', () => {
  it('받침 있으면 을', () => {
    expect(objectParticle('안전')).toBe('을');
    expect(objectParticle('웃음')).toBe('을');
    expect(objectParticle('회복')).toBe('을');
    expect(objectParticle('희망')).toBe('을');
    expect(objectParticle('일상')).toBe('을');
  });

  it('받침 없으면 를', () => {
    expect(objectParticle('미래')).toBe('를');
    expect(objectParticle('온기')).toBe('를');
    expect(objectParticle('대화')).toBe('를');
    expect(objectParticle('여유')).toBe('를');
    expect(objectParticle('자유')).toBe('를');
    expect(objectParticle('서로')).toBe('를');
  });

  it('한글이 아니면 받침 형태(을) 기본값', () => {
    expect(objectParticle('OK')).toBe('을');
  });
});

describe('subjectParticle / topicParticle', () => {
  it('주격 이/가', () => {
    expect(subjectParticle('안전')).toBe('이');
    expect(subjectParticle('미래')).toBe('가');
  });
  it('보조사 은/는', () => {
    expect(topicParticle('안전')).toBe('은');
    expect(topicParticle('미래')).toBe('는');
  });
});

describe('objectify', () => {
  it('단어 + 목적격 조사', () => {
    expect(objectify('미래')).toBe('미래를');
    expect(objectify('안전')).toBe('안전을');
  });

  it('STEP1 명사 11개 모두 올바른 조사가 붙는다', () => {
    const expected: Record<string, string> = {
      온기: '온기를',
      미래: '미래를',
      대화: '대화를',
      여유: '여유를',
      자유: '자유를',
      안전: '안전을',
      회복: '회복을',
      일상: '일상을',
      서로: '서로를',
      웃음: '웃음을',
      희망: '희망을',
    };
    for (const noun of NOUNS) {
      expect(objectify(noun.text)).toBe(expected[noun.text]);
    }
  });
});
