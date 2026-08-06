import { describe, it, expect } from 'vitest';
import { composeSentence } from '../lib/sentence';

describe('composeSentence', () => {
  it('스토리보드 예시 문장을 재현한다', () => {
    expect(composeSentence({ adjective: '희망찬', noun: '미래', verb: '만들어간다' })).toBe(
      '우리는 희망찬 미래를 만들어간다.',
    );
  });

  it('받침 있는 명사는 을 조사를 쓴다', () => {
    expect(composeSentence({ adjective: '안전한', noun: '안전', verb: '지켜간다' })).toBe(
      '우리는 안전한 안전을 지켜간다.',
    );
    expect(composeSentence({ adjective: '밝은', noun: '웃음', verb: '소중히 여긴다' })).toBe(
      '우리는 밝은 웃음을 소중히 여긴다.',
    );
  });

  it('받침 없는 명사는 를 조사를 쓴다', () => {
    expect(composeSentence({ adjective: '따뜻한', noun: '대화', verb: '이어간다' })).toBe(
      '우리는 따뜻한 대화를 이어간다.',
    );
  });

  it('공백이 포함된 동사도 그대로 붙는다', () => {
    const s = composeSentence({ adjective: '화합하는', noun: '서로', verb: '소중히 여긴다' });
    expect(s).toBe('우리는 화합하는 서로를 소중히 여긴다.');
  });

  it('항상 마침표 하나로 끝난다', () => {
    const s = composeSentence({ adjective: '평온한', noun: '일상', verb: '지켜간다' });
    expect(s.endsWith('.')).toBe(true);
    expect(s.endsWith('..')).toBe(false);
  });

  it('연속 공백을 정규화한다', () => {
    const s = composeSentence({ adjective: '밝은', noun: '희망', verb: '키워간다' });
    expect(s).not.toMatch(/ {2,}/);
  });
});
