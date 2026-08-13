import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRINT_WIDTH,
  PRINT_WIDTH,
  CONTENT_WIDTH,
  resolvePrintWidth,
  wrapTextByMeasure,
} from '../lib/treatyCanvas';

describe('resolvePrintWidth', () => {
  it('미지정(undefined)이면 기본 576 을 쓴다', () => {
    expect(resolvePrintWidth(undefined)).toBe(576);
    expect(DEFAULT_PRINT_WIDTH).toBe(576);
  });

  it('빈 문자열이면 기본값으로 대체한다', () => {
    expect(resolvePrintWidth('')).toBe(576);
  });

  it('양의 정수 문자열은 그대로 재정의한다', () => {
    expect(resolvePrintWidth('512')).toBe(512);
    expect(resolvePrintWidth('640')).toBe(640);
  });

  it('0·음수·비정수·비숫자는 무시하고 기본값을 쓴다', () => {
    expect(resolvePrintWidth('0')).toBe(576);
    expect(resolvePrintWidth('-100')).toBe(576);
    expect(resolvePrintWidth('abc')).toBe(576);
  });
});

describe('PRINT_WIDTH / CONTENT_WIDTH 상수', () => {
  it('VITE_PRINT_WIDTH 미지정 시 기본 576 이다 (오른쪽 잘림 방지)', () => {
    // 테스트 환경에는 VITE_PRINT_WIDTH 를 주지 않으므로 기본값이어야 한다.
    expect(PRINT_WIDTH).toBe(576);
  });

  it('CONTENT_WIDTH 는 좌우 여백(40)을 제외한 496px 이다', () => {
    expect(CONTENT_WIDTH).toBe(576 - 40 * 2);
    expect(CONTENT_WIDTH).toBe(496);
  });
});

describe('wrapTextByMeasure', () => {
  // 각 문자를 10px 로 가정하는 결정적 측정 함수.
  const measure10 = (t: string) => [...t].length * 10;

  it('maxWidth 안이면 한 줄로 유지한다', () => {
    expect(wrapTextByMeasure(measure10, '가나다', 100)).toEqual(['가나다']);
  });

  it('maxWidth 를 넘으면 폭 기준으로 줄바꿈한다', () => {
    // 문자당 10px, maxWidth 30 → 세 글자마다 줄바꿈
    expect(wrapTextByMeasure(measure10, '가나다라마바', 30)).toEqual(['가나다', '라마바']);
  });

  it('CONTENT_WIDTH(496) 축소 반영 — 폭이 좁아지면 줄 수가 늘어난다', () => {
    const text = '가'.repeat(60);
    const at640 = wrapTextByMeasure(measure10, text, 544); // 이전 640px 폭 콘텐츠
    const at576 = wrapTextByMeasure(measure10, text, CONTENT_WIDTH); // 현 576px 폭 콘텐츠
    expect(at576.length).toBeGreaterThanOrEqual(at640.length);
  });

  it('빈 문자열은 빈 한 줄을 반환한다', () => {
    expect(wrapTextByMeasure(measure10, '', 100)).toEqual(['']);
  });

  it('한 글자가 maxWidth 를 넘어도 최소 한 글자는 유지한다(무한루프 방지)', () => {
    expect(wrapTextByMeasure(measure10, '가나', 5)).toEqual(['가', '나']);
  });
});
