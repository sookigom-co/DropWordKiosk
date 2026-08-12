import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FX_SETTINGS,
  FX_RANGES,
  clampFx,
  clampRange,
  maxCirclePx,
  purpleColor,
  randomTargetPx,
  type FxSettings,
} from '../lib/fx';

describe('clampRange', () => {
  const r = { min: 0.4, max: 2.5, step: 0.1 };
  it('범위 안 값은 그대로 통과', () => {
    expect(clampRange(1, r)).toBe(1);
  });
  it('상/하한을 넘으면 경계로 클램프', () => {
    expect(clampRange(9, r)).toBe(2.5);
    expect(clampRange(-9, r)).toBe(0.4);
  });
  it('NaN/무한대는 안전하게 min 으로', () => {
    expect(clampRange(NaN, r)).toBe(0.4);
    expect(clampRange(Infinity, r)).toBe(0.4);
  });
});

describe('clampFx', () => {
  it('기본값은 모든 필드가 자기 범위 안에 있다', () => {
    (Object.keys(FX_RANGES) as (keyof FxSettings)[]).forEach((k) => {
      expect(DEFAULT_FX_SETTINGS[k]).toBeGreaterThanOrEqual(FX_RANGES[k].min);
      expect(DEFAULT_FX_SETTINGS[k]).toBeLessThanOrEqual(FX_RANGES[k].max);
    });
  });
  it('부분 패치를 병합하고 범위를 벗어난 값을 클램프', () => {
    const out = clampFx({ maxSizeRatio: 5, hue: 999 });
    expect(out.maxSizeRatio).toBe(FX_RANGES.maxSizeRatio.max);
    expect(out.hue).toBe(FX_RANGES.hue.max);
    // 패치하지 않은 필드는 base 유지
    expect(out.fallSpeed).toBe(DEFAULT_FX_SETTINGS.fallSpeed);
  });
});

describe('maxCirclePx', () => {
  it('언제나 단어 원 크기보다 작다(상한 비율 < 1)', () => {
    const bubble = 120;
    for (const ratio of [0.2, 0.5, 0.8, 0.95, 5]) {
      expect(maxCirclePx(bubble, ratio)).toBeLessThan(bubble);
    }
  });
  it('음수 bubblePx 는 0 으로 안전화', () => {
    expect(maxCirclePx(-50, 0.8)).toBe(0);
  });
});

describe('randomTargetPx', () => {
  const bubble = 120;
  const ratio = 0.8;
  const cap = maxCirclePx(bubble, ratio);
  it('rnd=1 이면 상한(cap)', () => {
    expect(randomTargetPx(bubble, ratio, 1)).toBeCloseTo(cap);
  });
  it('rnd=0 이면 최소값이고 cap 이하', () => {
    const v = randomTargetPx(bubble, ratio, 0);
    expect(v).toBeLessThanOrEqual(cap);
    expect(v).toBeGreaterThan(0);
  });
  it('모든 rnd 에서 단어 원 크기를 넘지 않는다', () => {
    for (const rnd of [0, 0.25, 0.5, 0.75, 1, 2, -1, NaN]) {
      const v = randomTargetPx(bubble, ratio, rnd);
      expect(v).toBeLessThanOrEqual(cap);
      expect(v).toBeLessThan(bubble);
    }
  });
});

describe('purpleColor', () => {
  it('불투명 HSL 문자열', () => {
    expect(purpleColor(262)).toBe('hsl(262 68% 62%)');
  });
  it('alpha < 1 이면 반투명 표기', () => {
    expect(purpleColor(262, { alpha: 0.5 })).toBe('hsl(262 68% 62% / 0.5)');
  });
  it('범위를 벗어난 hue 는 클램프', () => {
    expect(purpleColor(999)).toContain(`hsl(${FX_RANGES.hue.max} `);
  });
});
