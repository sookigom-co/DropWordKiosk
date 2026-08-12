import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FX_SETTINGS,
  FX_RANGES,
  clampFx,
  clampRange,
  easeOutCubic,
  growthRadius,
  maxCirclePx,
  pickSpawnPoint,
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
    const out = clampFx({ maxSizeRatio: 9, hue: 999 });
    expect(out.maxSizeRatio).toBe(FX_RANGES.maxSizeRatio.max);
    expect(out.hue).toBe(FX_RANGES.hue.max);
    // 패치하지 않은 필드는 base 유지
    expect(out.gravity).toBe(DEFAULT_FX_SETTINGS.gravity);
  });
});

describe('maxCirclePx', () => {
  it('비율에 비례하고 1 초과 비율은 단어 원보다 커진다(밀어올림용)', () => {
    const bubble = 120;
    expect(maxCirclePx(bubble, 0.6)).toBeCloseTo(72);
    expect(maxCirclePx(bubble, 2)).toBeCloseTo(240);
  });
  it('음수 bubblePx 는 0 으로 안전화', () => {
    expect(maxCirclePx(-50, 0.8)).toBe(0);
  });
});

describe('randomTargetPx', () => {
  const bubble = 120;
  const ratio = 1.5;
  const cap = maxCirclePx(bubble, ratio);
  it('rnd=1 이면 상한(cap)', () => {
    expect(randomTargetPx(bubble, ratio, 1)).toBeCloseTo(cap);
  });
  it('rnd=0 이면 최소값이고 cap 이하·양수', () => {
    const v = randomTargetPx(bubble, ratio, 0);
    expect(v).toBeLessThanOrEqual(cap);
    expect(v).toBeGreaterThan(0);
  });
  it('모든 rnd 에서 [floor, cap] 안에 든다', () => {
    for (const rnd of [0, 0.25, 0.5, 0.75, 1, 2, -1, NaN]) {
      const v = randomTargetPx(bubble, ratio, rnd);
      expect(v).toBeLessThanOrEqual(cap + 1e-9);
      expect(v).toBeGreaterThan(0);
    }
  });
});

describe('easeOutCubic', () => {
  it('경계값', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });
  it('0~1 범위 밖은 클램프', () => {
    expect(easeOutCubic(-5)).toBe(0);
    expect(easeOutCubic(5)).toBe(1);
    expect(easeOutCubic(NaN)).toBe(0);
  });
  it('단조 증가하며 처음이 빠르다(중간값 > 0.5)', () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});

describe('growthRadius', () => {
  it('시작 시 startR, 완료 시 targetR', () => {
    expect(growthRadius(6, 60, 0, 2)).toBeCloseTo(6);
    expect(growthRadius(6, 60, 2, 2)).toBeCloseTo(60);
  });
  it('진행 중에는 start~target 사이', () => {
    const v = growthRadius(6, 60, 1, 2);
    expect(v).toBeGreaterThan(6);
    expect(v).toBeLessThan(60);
  });
  it('duration 0 은 안전하게 처리(0 나눗셈 없음)', () => {
    expect(Number.isFinite(growthRadius(6, 60, 1, 0))).toBe(true);
  });
});

describe('pickSpawnPoint', () => {
  it('항상 필드 내부(마진 안)에 위치', () => {
    for (const [rx, ry] of [
      [0, 0],
      [0.5, 0.5],
      [1, 1],
      [NaN, NaN],
    ]) {
      const p = pickSpawnPoint(700, 500, rx, ry, 40);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(700);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(500);
    }
  });
  it('y 는 하단 영역(45%~88%)', () => {
    expect(pickSpawnPoint(700, 500, 0.5, 0).y).toBeCloseTo(500 * 0.45);
    expect(pickSpawnPoint(700, 500, 0.5, 1).y).toBeCloseTo(500 * 0.88);
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
