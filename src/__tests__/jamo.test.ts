import { describe, it, expect } from 'vitest';
import { decompose, typingFrames } from '../lib/jamo';
import { TREATY_ARTICLES } from '../data/treaty';

describe('decompose', () => {
  it('받침 없는 음절을 초/중/종으로 분해', () => {
    expect(decompose('우')).toEqual(['ㅇ', 'ㅜ', '']);
    expect(decompose('리')).toEqual(['ㄹ', 'ㅣ', '']);
  });

  it('받침 있는 음절을 분해', () => {
    expect(decompose('울')).toEqual(['ㅇ', 'ㅜ', 'ㄹ']);
    expect(decompose('갈')).toEqual(['ㄱ', 'ㅏ', 'ㄹ']);
  });

  it('복합 모음/복합 종성을 정확히 분해', () => {
    expect(decompose('화')).toEqual(['ㅎ', 'ㅘ', '']);
    expect(decompose('닭')).toEqual(['ㄷ', 'ㅏ', 'ㄺ']);
  });

  it('한글이 아니면 null', () => {
    expect(decompose('.')).toBeNull();
    expect(decompose('1')).toBeNull();
    expect(decompose(' ')).toBeNull();
  });
});

describe('typingFrames', () => {
  it('빈 문자열로 시작한다', () => {
    expect(typingFrames('우')[0]).toBe('');
  });

  it('단일 음절 조합 과정을 재현', () => {
    expect(typingFrames('우')).toEqual(['', 'ㅇ', '우']);
  });

  it('IME 종성 이동(재조합)을 재현: 우리 → ㅇ,우,울,우리', () => {
    expect(typingFrames('우리')).toEqual(['', 'ㅇ', '우', '울', '우리']);
  });

  it('보더 예시 "우리는" 조합 과정 재현', () => {
    // 는 = ㄴ+ㅡ+ㄴ(종성) → 우린(ㄴ가 임시 종성) → 우리느(ㄴ 초성 이동) → 우리는(종성 ㄴ)
    expect(typingFrames('우리는')).toEqual([
      '',
      'ㅇ',
      '우',
      '울',
      '우리',
      '우린',
      '우리느',
      '우리는',
    ]);
  });

  it('복합 모음(화) 조합 과정 재현', () => {
    expect(typingFrames('화')).toEqual(['', 'ㅎ', '호', '화']);
  });

  it('마지막 프레임은 항상 완성된 전체 문자열', () => {
    for (const article of TREATY_ARTICLES) {
      const frames = typingFrames(article);
      expect(frames[frames.length - 1]).toBe(article);
    }
  });

  it('공백/문장부호를 그대로 통과시킨다', () => {
    const frames = typingFrames('가.');
    expect(frames).toEqual(['', 'ㄱ', '가', '가.']);
    expect(typingFrames('가 나')[typingFrames('가 나').length - 1]).toBe('가 나');
  });

  it('연속 동일 프레임은 중복 없이 단조 증가한다', () => {
    const frames = typingFrames(TREATY_ARTICLES[0]);
    for (let i = 1; i < frames.length; i += 1) {
      expect(frames[i]).not.toBe(frames[i - 1]);
    }
  });
});
