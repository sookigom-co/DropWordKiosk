import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPreviewMode, resolvePreviewMode } from '../lib/printClient';

// SOO-1099: 프리뷰 모드(프린터 호출 없이 인쇄용 PNG 를 화면에 표시) 판정 로직.
// 빌드타임 env(VITE_PRINT_PREVIEW) 와 런타임 쿼리(?preview=1) 를 모두 인식한다.

describe('resolvePreviewMode', () => {
  it('env 가 "1" 이면 쿼리와 무관하게 프리뷰 모드', () => {
    expect(resolvePreviewMode('1', '')).toBe(true);
    expect(resolvePreviewMode('1', '?foo=bar')).toBe(true);
  });

  it('?preview=1 이면 env 미설정이어도 프리뷰 모드(재빌드 없이 시험)', () => {
    expect(resolvePreviewMode(undefined, '?preview=1')).toBe(true);
    expect(resolvePreviewMode('0', '?preview=1')).toBe(true);
    expect(resolvePreviewMode('', '?preview=1&mock=1')).toBe(true);
  });

  it('env 미설정 + 쿼리 없음 → 기본값 OFF(기존 인쇄 플로우 회귀 없음)', () => {
    expect(resolvePreviewMode(undefined, '')).toBe(false);
    expect(resolvePreviewMode('', '')).toBe(false);
    expect(resolvePreviewMode('0', '')).toBe(false);
  });

  it('preview 값이 1 이 아니면 OFF', () => {
    expect(resolvePreviewMode(undefined, '?preview=0')).toBe(false);
    expect(resolvePreviewMode(undefined, '?preview=true')).toBe(false);
    expect(resolvePreviewMode(undefined, '?preview')).toBe(false);
  });

  it('mock(VITE_PRINT_MOCK) 과 독립적으로 동작한다(?mock=1 만으로는 프리뷰 아님)', () => {
    expect(resolvePreviewMode(undefined, '?mock=1')).toBe(false);
  });
});

describe('isPreviewMode (window.location.search 반영)', () => {
  const original = window.location.search;
  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: { search: original },
      writable: true,
      configurable: true,
    });
    vi.unstubAllEnvs();
  });

  it('?preview=1 이면 true', () => {
    Object.defineProperty(window, 'location', {
      value: { search: '?preview=1' },
      writable: true,
      configurable: true,
    });
    expect(isPreviewMode()).toBe(true);
  });

  it('쿼리 없음 + env 없음 → false', () => {
    Object.defineProperty(window, 'location', {
      value: { search: '' },
      writable: true,
      configurable: true,
    });
    expect(isPreviewMode()).toBe(false);
  });
});
