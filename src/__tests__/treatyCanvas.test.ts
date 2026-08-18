import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRINT_WIDTH,
  DEFAULT_PRINT_TYPE,
  PRINT_WIDTH,
  PRINT_TYPE,
  CONTENT_WIDTH,
  resolvePrintWidth,
  resolvePrintType,
  buildArticlesOneLine,
  wrapTextByMeasure,
  computeLogoSize,
} from '../lib/treatyCanvas';
import { TREATY_ARTICLES } from '../data/treaty';

describe('resolvePrintWidth', () => {
  it('미지정(undefined)이면 기본 432 를 쓴다', () => {
    expect(resolvePrintWidth(undefined)).toBe(432);
    expect(DEFAULT_PRINT_WIDTH).toBe(432);
  });

  it('빈 문자열이면 기본값으로 대체한다', () => {
    expect(resolvePrintWidth('')).toBe(432);
  });

  it('양의 정수 문자열은 그대로 재정의한다', () => {
    expect(resolvePrintWidth('512')).toBe(512);
    expect(resolvePrintWidth('576')).toBe(576);
    expect(resolvePrintWidth('640')).toBe(640);
  });

  it('0·음수·비정수·비숫자는 무시하고 기본값을 쓴다', () => {
    expect(resolvePrintWidth('0')).toBe(432);
    expect(resolvePrintWidth('-100')).toBe(432);
    expect(resolvePrintWidth('abc')).toBe(432);
  });
});

describe('resolvePrintType (인쇄 포맷 파싱)', () => {
  it('미지정(undefined)이면 portrait 기본값이다', () => {
    expect(resolvePrintType(undefined)).toBe('portrait');
    expect(DEFAULT_PRINT_TYPE).toBe('portrait');
  });

  it('빈 문자열이면 portrait 로 대체한다', () => {
    expect(resolvePrintType('')).toBe('portrait');
  });

  it("'portrait' 는 그대로 portrait 이다", () => {
    expect(resolvePrintType('portrait')).toBe('portrait');
  });

  it("'landscape' 는 landscape 이다(대소문자·공백 무시)", () => {
    expect(resolvePrintType('landscape')).toBe('landscape');
    expect(resolvePrintType('LANDSCAPE')).toBe('landscape');
    expect(resolvePrintType('  Landscape ')).toBe('landscape');
  });

  it('알 수 없는 값은 portrait 로 폴백한다', () => {
    expect(resolvePrintType('wide')).toBe('portrait');
    expect(resolvePrintType('가로')).toBe('portrait');
    expect(resolvePrintType('1')).toBe('portrait');
  });

  it('PRINT_TYPE 상수는 테스트 환경(VITE_PRINT_TYPE 미지정)에서 portrait 이다', () => {
    expect(PRINT_TYPE).toBe('portrait');
  });
});

describe('buildArticlesOneLine (landscape 윗줄 본문)', () => {
  it('제1~9조를 줄바꿈 없이 한 줄로 이어 붙인다', () => {
    const line = buildArticlesOneLine(TREATY_ARTICLES);
    expect(line).not.toContain('\n');
    expect(line.startsWith('제 1조  ')).toBe(true);
    // 9개 조문이 모두 라벨과 함께 포함된다.
    for (let i = 1; i <= TREATY_ARTICLES.length; i += 1) {
      expect(line).toContain(`제 ${i}조`);
    }
  });

  it('빈 배열이면 빈 문자열이다', () => {
    expect(buildArticlesOneLine([])).toBe('');
  });
});

describe('PRINT_WIDTH / CONTENT_WIDTH 상수', () => {
  it('VITE_PRINT_WIDTH 미지정 시 기본 432 이다 (2S 54mm 헤드 잘림 방지)', () => {
    // 테스트 환경에는 VITE_PRINT_WIDTH 를 주지 않으므로 기본값이어야 한다.
    expect(PRINT_WIDTH).toBe(432);
  });

  it('CONTENT_WIDTH 는 좌우 여백(32)을 제외한 368px 이다', () => {
    expect(CONTENT_WIDTH).toBe(432 - 32 * 2);
    expect(CONTENT_WIDTH).toBe(368);
  });
});

describe('computeLogoSize (인쇄 로고 비율 유지 축소)', () => {
  it('로고 원본(2227×406)을 콘텐츠 폭(368)에 비율 유지로 맞춘다', () => {
    // 368 * 406/2227 = 67.08 → 67
    expect(computeLogoSize(2227, 406, 368)).toEqual({ width: 368, height: 67 });
  });

  it('VITE_PRINT_WIDTH 재정의(예: 576 폭 → 콘텐츠 512)에서도 종횡비를 보존한다', () => {
    // 512 * 406/2227 = 93.33 → 93
    expect(computeLogoSize(2227, 406, 512)).toEqual({ width: 512, height: 93 });
  });

  it('목표 폭과 무관하게 높이/폭 비율이 원본 종횡비와 일치한다', () => {
    const { width, height } = computeLogoSize(2227, 406, 300);
    expect(Math.abs(height / width - 406 / 2227)).toBeLessThan(0.01);
  });

  it('유효하지 않은 입력은 그리지 않도록 {0,0} 을 반환한다', () => {
    expect(computeLogoSize(0, 406, 368)).toEqual({ width: 0, height: 0 });
    expect(computeLogoSize(2227, 0, 368)).toEqual({ width: 0, height: 0 });
    expect(computeLogoSize(2227, 406, 0)).toEqual({ width: 0, height: 0 });
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

  it('CONTENT_WIDTH(368) 축소 반영 — 폭이 좁아지면 줄 수가 늘어난다', () => {
    const text = '가'.repeat(60);
    const at576 = wrapTextByMeasure(measure10, text, 496); // 이전 576px 폭 콘텐츠(496)
    const at432 = wrapTextByMeasure(measure10, text, CONTENT_WIDTH); // 현 432px 폭 콘텐츠(368)
    expect(at432.length).toBeGreaterThanOrEqual(at576.length);
  });

  it('빈 문자열은 빈 한 줄을 반환한다', () => {
    expect(wrapTextByMeasure(measure10, '', 100)).toEqual(['']);
  });

  it('한 글자가 maxWidth 를 넘어도 최소 한 글자는 유지한다(무한루프 방지)', () => {
    expect(wrapTextByMeasure(measure10, '가나', 5)).toEqual(['가', '나']);
  });
});
