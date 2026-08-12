import { describe, expect, it } from 'vitest';
import { formatTreatyFooterDate, TREATY_FOOTER_PLACE } from '../data/treaty';

describe('formatTreatyFooterDate', () => {
  it('YYYY년 MM월 DD일 형식으로, 월·일을 zero-pad 한다', () => {
    // 한 자리 월(9월)·한 자리 일(5일) → 두 자리로 패딩
    expect(formatTreatyFooterDate(new Date(2026, 8, 5))).toBe('2026년 09월 05일');
  });

  it('두 자리 월·일은 그대로 유지한다', () => {
    // getMonth()는 0-base → 11 == 12월
    expect(formatTreatyFooterDate(new Date(2026, 11, 25))).toBe('2026년 12월 25일');
  });

  it('연말 경계(12월 31일)를 올바르게 처리한다', () => {
    expect(formatTreatyFooterDate(new Date(2026, 11, 31))).toBe('2026년 12월 31일');
  });

  it('연초 경계(1월 1일)를 올바르게 처리한다', () => {
    expect(formatTreatyFooterDate(new Date(2027, 0, 1))).toBe('2027년 01월 01일');
  });

  it('시간 성분과 무관하게 일 단위까지만 표기한다', () => {
    expect(formatTreatyFooterDate(new Date(2026, 7, 12, 23, 59, 59))).toBe('2026년 08월 12일');
  });

  it('작성자 상수는 철원 국가유산 야행 이다', () => {
    expect(TREATY_FOOTER_PLACE).toBe('철원 국가유산 야행');
  });
});
