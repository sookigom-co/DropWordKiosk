import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FX_SETTINGS,
  FILL_STOP_RATIO,
  FREEZE_DELAY_MS,
  freezeDue,
  FX_RANGES,
  approach,
  areaFilled,
  balancedLaneX,
  bodiesSettled,
  bottomFreeSpawn,
  bottomSpawnPoint,
  brickStackX,
  clampAngle,
  clampToStage,
  clampBoxToStage,
  mulberry32,
  shuffleIndices,
  randomBoxX,
  leftmostFreeSlotX,
  midSpawnPoint,
  spawnZoneFor,
  spreadX,
  centerOutLaneOrder,
  laneCenters,
  laneCountForWidth,
  buoyancyForce,
  burstCount,
  circlesArea,
  circlesOverlap,
  clampFx,
  clampRange,
  easeOutCubic,
  firstFreeSpawn,
  groupedReleaseOrder,
  growthRadius,
  interleavedReleaseSlots,
  maxCirclePx,
  maxGrowRadius,
  pickSpawnPoint,
  pickSpawnPointBand,
  pickSpawnPointFull,
  purpleColor,
  purpleScaleRadius,
  randomFreeSpawn,
  randomSpawnPoint,
  randomSpawnZone,
  randomTargetPx,
  REFERENCE_BUBBLE_CAP_PX,
  referenceBubblePx,
  spawnBetweenBodies,
  swayForce,
  topSpawnPoint,
  upwardPushTargets,
  type Circle,
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
  it('최소 크기는 cap 의 50%(보더 요청 SOO-1049 후속)', () => {
    // cap 이 충분히 커서 10px 하한에 걸리지 않는 경우 floor = cap * 0.5
    expect(randomTargetPx(bubble, ratio, 0)).toBeCloseTo(cap * 0.5);
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

describe('pickSpawnPointFull (SOO-1049 후속 가득 채움)', () => {
  it('항상 필드 내부(마진 안)에 위치', () => {
    for (const [rx, ry] of [
      [0, 0],
      [0.5, 0.5],
      [1, 1],
      [NaN, NaN],
    ]) {
      const p = pickSpawnPointFull(700, 500, rx, ry, 40);
      expect(p.x).toBeGreaterThanOrEqual(40);
      expect(p.x).toBeLessThanOrEqual(660);
      expect(p.y).toBeGreaterThanOrEqual(40);
      expect(p.y).toBeLessThanOrEqual(460);
    }
  });
  it('전체 필드(상단~하단)를 커버 — y 가 마진에서 height-마진까지', () => {
    expect(pickSpawnPointFull(700, 500, 0.5, 0, 40).y).toBeCloseTo(40);
    expect(pickSpawnPointFull(700, 500, 0.5, 1, 40).y).toBeCloseTo(460);
  });
});

describe('pickSpawnPointBand (SOO-1049 후속 — 스폰 위치 우선순위 밴드)', () => {
  it('y 가 밴드(yLo~yHi·높이 대비) 안에 매핑된다', () => {
    // 하단 밴드 [0.5, 0.92], height=500 → y ∈ [250, 460]
    expect(pickSpawnPointBand(700, 500, 0.5, 0, 0.5, 0.92).y).toBeCloseTo(250);
    expect(pickSpawnPointBand(700, 500, 0.5, 1, 0.5, 0.92).y).toBeCloseTo(460);
    // 상단 밴드 [0.06, 0.5] → y ∈ [30, 250]
    expect(pickSpawnPointBand(700, 500, 0.5, 0, 0.06, 0.5).y).toBeCloseTo(30);
    expect(pickSpawnPointBand(700, 500, 0.5, 1, 0.06, 0.5).y).toBeCloseTo(250);
  });
  it('x 는 마진 안, NaN·역전 밴드도 안전하게 처리', () => {
    const p = pickSpawnPointBand(700, 500, NaN, NaN, 0.9, 0.1, 40); // lo>hi → hi=lo 로 보정
    expect(p.x).toBeGreaterThanOrEqual(40);
    expect(p.x).toBeLessThanOrEqual(660);
    expect(p.y).toBeCloseTo(450); // lo=0.9 로 고정(hi=max(lo,0.1)=0.9), rndY=0
  });
});

describe('bottomSpawnPoint (SOO-1057 하단 스폰)', () => {
  it('x 는 항상 마진 안', () => {
    for (const rx of [0, 0.5, 1, NaN, -1, 2]) {
      const p = bottomSpawnPoint(700, 500, rx, 6, 40);
      expect(p.x).toBeGreaterThanOrEqual(40);
      expect(p.x).toBeLessThanOrEqual(660);
    }
  });
  it('y 는 바닥선(height) 바로 위 — 반지름만큼 안쪽', () => {
    // height=500, startR=6 → y = 500 - 6 - 1 = 493
    expect(bottomSpawnPoint(700, 500, 0.5, 6).y).toBeCloseTo(493);
  });
  it('rndX 로 좌우가 결정된다(0=좌, 1=우)', () => {
    expect(bottomSpawnPoint(700, 500, 0, 6, 40).x).toBeCloseTo(40);
    expect(bottomSpawnPoint(700, 500, 1, 6, 40).x).toBeCloseTo(660);
  });
  it('음수·비유한 입력도 안전(y>=0)', () => {
    expect(bottomSpawnPoint(-10, -10, 0.5, 6).y).toBeGreaterThanOrEqual(0);
  });
});

describe('topSpawnPoint (SOO-1059 상단 스폰)', () => {
  it('x 는 항상 마진 안', () => {
    for (const rx of [0, 0.5, 1, NaN, -1, 2]) {
      const p = topSpawnPoint(700, 500, rx, 6, 40);
      expect(p.x).toBeGreaterThanOrEqual(40);
      expect(p.x).toBeLessThanOrEqual(660);
    }
  });
  it('y 는 천장선(0) 바로 아래 — 반지름만큼 안쪽', () => {
    // startR=6 → y = 6 + 1 = 7
    expect(topSpawnPoint(700, 500, 0.5, 6).y).toBeCloseTo(7);
  });
  it('bottomSpawnPoint 보다 항상 위(y 가 작다)', () => {
    const top = topSpawnPoint(700, 500, 0.5, 6);
    const bottom = bottomSpawnPoint(700, 500, 0.5, 6);
    expect(top.y).toBeLessThan(bottom.y);
  });
  it('rndX 로 좌우가 결정된다(0=좌, 1=우)', () => {
    expect(topSpawnPoint(700, 500, 0, 6, 40).x).toBeCloseTo(40);
    expect(topSpawnPoint(700, 500, 1, 6, 40).x).toBeCloseTo(660);
  });
  it('음수·비유한 입력도 안전(y 는 필드 안 0~height)', () => {
    const p = topSpawnPoint(-10, -10, 0.5, 6);
    expect(p.y).toBeGreaterThanOrEqual(0);
    // height=0 이면 y 는 0 으로 클램프(필드 밖으로 나가지 않음).
    expect(p.y).toBeLessThanOrEqual(0);
  });
});

describe('buoyancyForce (SOO-1057 부력)', () => {
  it('factor>1 이면 위로(음수) 순힘 — matter 는 위가 음수 y', () => {
    // 중력 추가분 = mass*g*scale = 1*1*0.001 = 0.001, factor=1.7 → -0.0017
    expect(buoyancyForce(1, 1, 0.001, 1.7)).toBeCloseTo(-0.0017);
  });
  it('factor=1 이면 중력과 정확히 상쇄되는 크기(부호는 위)', () => {
    // 반환값(-0.001) + 중력(+0.001) = 0 → 순힘 0(무중력).
    expect(buoyancyForce(1, 1, 0.001, 1)).toBeCloseTo(-0.001);
  });
  it('질량에 비례(가속도는 질량 무관해짐)', () => {
    expect(buoyancyForce(2, 1, 0.001, 1.7)).toBeCloseTo(2 * buoyancyForce(1, 1, 0.001, 1.7));
  });
  it('factor<1 이면 순힘이 아래(양수) — 상단 스폰 버블 하강(SOO-1059)', () => {
    // 반환값(-0.0005) + 중력(+0.001) = +0.0005 > 0 → 아래로 내려온다(감쇠 중력).
    const buoy = buoyancyForce(1, 1, 0.001, 0.5);
    const net = buoy + 1 * 1 * 0.001; // + matter 가 더하는 중력
    expect(net).toBeGreaterThan(0);
    // 감쇠: raw 중력(0.001)보다 작아 느긋하게 하강.
    expect(net).toBeLessThan(0.001);
  });
  it('비유한 입력은 0 으로 안전화', () => {
    expect(buoyancyForce(NaN, 1, 0.001, 1.7)).toBe(-0);
    expect(buoyancyForce(1, NaN, 0.001, 1.7)).toBe(-0);
    expect(buoyancyForce(1, 1, 0.001, NaN)).toBe(-0);
  });
});

describe('swayForce (SOO-1057 좌우 흔들림)', () => {
  it('sin 위상에 따라 좌우로 진동', () => {
    expect(swayForce(1, 0, 0.0006)).toBeCloseTo(0);
    expect(swayForce(1, Math.PI / 2, 0.0006)).toBeCloseTo(0.0006);
    expect(swayForce(1, -Math.PI / 2, 0.0006)).toBeCloseTo(-0.0006);
  });
  it('질량에 비례(가속도 진폭은 질량 무관)', () => {
    expect(swayForce(3, Math.PI / 2, 0.0006)).toBeCloseTo(3 * 0.0006);
  });
  it('진폭 안에서만 움직인다(|force| <= mass*amplitude)', () => {
    for (const ph of [0.3, 1.1, 2.7, 5.9]) {
      expect(Math.abs(swayForce(1, ph, 0.0006))).toBeLessThanOrEqual(0.0006 + 1e-12);
    }
  });
  it('비유한 입력은 0 으로 안전화', () => {
    expect(swayForce(NaN, 1, 0.0006)).toBe(0);
    expect(swayForce(1, NaN, 0.0006)).toBe(0);
    expect(swayForce(1, 1, NaN)).toBe(0);
  });
});

describe('circlesOverlap (SOO-1049 비중첩)', () => {
  it('겹치는 두 원은 true', () => {
    // 중심 거리 10, 반지름 합 12 → 겹침
    expect(circlesOverlap(0, 0, 6, 10, 0, 6)).toBe(true);
  });
  it('떨어진 두 원은 false', () => {
    // 중심 거리 20, 반지름 합 12 → 안 겹침
    expect(circlesOverlap(0, 0, 6, 20, 0, 6)).toBe(false);
  });
  it('접점(거리 = 반지름 합)은 겹침 아님', () => {
    expect(circlesOverlap(0, 0, 6, 12, 0, 6)).toBe(false);
  });
  it('pad 여유를 주면 접점도 겹침으로 본다', () => {
    expect(circlesOverlap(0, 0, 6, 12, 0, 6, 2)).toBe(true);
  });
});

describe('maxGrowRadius (SOO-1049 성장 정지)', () => {
  it('이웃이 없으면 desired 그대로', () => {
    expect(maxGrowRadius(0, 0, 50, [])).toBe(50);
  });
  it('이웃 공에 닿기 직전까지만 허용', () => {
    // 이웃 중심 거리 40, 이웃 반지름 10 → 허용 30
    const others: Circle[] = [{ x: 40, y: 0, r: 10 }];
    expect(maxGrowRadius(0, 0, 50, others)).toBeCloseTo(30);
  });
  it('가장 가까운 이웃 기준으로 상한을 잡는다', () => {
    const others: Circle[] = [
      { x: 40, y: 0, r: 10 }, // 허용 30
      { x: 25, y: 0, r: 5 }, // 허용 20 ← 최소
    ];
    expect(maxGrowRadius(0, 0, 50, others)).toBeCloseTo(20);
  });
  it('pad 만큼 더 보수적으로 제한하고 음수는 0', () => {
    const others: Circle[] = [{ x: 8, y: 0, r: 10 }];
    // 8 - 10 - 2 = -4 → 0
    expect(maxGrowRadius(0, 0, 50, others, 2)).toBe(0);
  });
});

describe('spawnBetweenBodies (SOO-1049 후속 — 단어 사이 스폰)', () => {
  it('빈 목록은 null(폴백 신호)', () => {
    expect(spawnBetweenBodies([], 0, 0, 0.5, 0.5)).toBeNull();
  });
  it('단어 1개면 그 원 부근(지터 0 이면 정확히 중심)', () => {
    const p = spawnBetweenBodies([{ x: 100, y: 200 }], 0, 0, 0.5, 0.5);
    expect(p).toEqual({ x: 100, y: 200 });
  });
  it('두 원의 중점을 반환(지터 0)', () => {
    const p = spawnBetweenBodies(
      [
        { x: 0, y: 0 },
        { x: 100, y: 40 },
      ],
      0, // i=0
      0.99, // j=1
      0.5, // jitterX 중앙 → 0
      0.5, // jitterY 중앙 → 0
    );
    expect(p).toEqual({ x: 50, y: 20 });
  });
  it('같은 인덱스가 뽑히면 다른 원으로 회피(중점이 자기 자신이 아님)', () => {
    const p = spawnBetweenBodies(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      0, // i=0
      0, // j=0 → 회피되어 j=1
      0.5,
      0.5,
    );
    expect(p).toEqual({ x: 50, y: 0 });
  });
  it('지터는 ±jitter 범위 안에서 중점을 흔든다', () => {
    const bodies = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const p = spawnBetweenBodies(bodies, 0, 0.99, 1, 0, 24); // jx=+24, jy=-24
    expect(p).toEqual({ x: 74, y: -24 });
  });
});

describe('firstFreeSpawn (SOO-1049 비중첩 스폰)', () => {
  const occupied: Circle[] = [{ x: 100, y: 100, r: 30 }];
  it('겹치는 후보는 건너뛰고 빈 후보를 반환', () => {
    const spot = firstFreeSpawn(
      [
        { x: 105, y: 100 }, // 겹침
        { x: 300, y: 300 }, // 자유
      ],
      6,
      occupied,
      4,
    );
    expect(spot).toEqual({ x: 300, y: 300 });
  });
  it('모든 후보가 겹치면 null(스폰 중단 신호)', () => {
    const spot = firstFreeSpawn([{ x: 100, y: 100 }], 6, occupied, 4);
    expect(spot).toBeNull();
  });
  it('점유가 없으면 첫 후보를 그대로 반환', () => {
    expect(firstFreeSpawn([{ x: 10, y: 10 }], 6, [])).toEqual({ x: 10, y: 10 });
  });
});

describe('bodiesSettled (SOO-1049 정착 판정)', () => {
  it('모든 속도가 임계 이하면 true', () => {
    expect(bodiesSettled([0.1, 0.2, 0.05], 0.4)).toBe(true);
  });
  it('하나라도 임계 초과면 false(낙하 중)', () => {
    expect(bodiesSettled([0.1, 3.2, 0.05], 0.4)).toBe(false);
  });
  it('빈 배열(측정 전)은 보수적으로 false', () => {
    expect(bodiesSettled([], 0.4)).toBe(false);
  });
  it('음수 속도도 절대값으로 판정', () => {
    expect(bodiesSettled([-0.3, 0.2], 0.4)).toBe(true);
    expect(bodiesSettled([-1.5], 0.4)).toBe(false);
  });
});

describe('freezeDue (SOO-1114 채움 완료 후 2초 고정)', () => {
  it('기본 유예는 2000ms', () => {
    expect(FREEZE_DELAY_MS).toBe(2000);
  });
  it('채움 미완(null)이면 항상 false', () => {
    expect(freezeDue(null, 999999, FREEZE_DELAY_MS)).toBe(false);
  });
  it('유예 경과 전에는 false, 정확히 경과 시점부터 true', () => {
    const t0 = 5000;
    expect(freezeDue(t0, t0 + 1999, FREEZE_DELAY_MS)).toBe(false);
    expect(freezeDue(t0, t0 + 2000, FREEZE_DELAY_MS)).toBe(true);
    expect(freezeDue(t0, t0 + 5000, FREEZE_DELAY_MS)).toBe(true);
  });
  it('비유한 입력은 보수적으로 false', () => {
    expect(freezeDue(Infinity, 10000, FREEZE_DELAY_MS)).toBe(false);
    expect(freezeDue(1000, Number.NaN, FREEZE_DELAY_MS)).toBe(false);
    expect(freezeDue(1000, 10000, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('DEFAULT_FX_SETTINGS (SOO-1049 후속 보더 요청 값)', () => {
  it('생성 간격 100ms · 성장 1.0s(추가 감속) · 최대 비율 100%', () => {
    expect(DEFAULT_FX_SETTINGS.spawnIntervalMs).toBe(100);
    // 성장 속도 추가 감속(SOO-1112 후속): 0.4s → 1.0s.
    expect(DEFAULT_FX_SETTINGS.growDurationSec).toBe(1);
    expect(DEFAULT_FX_SETTINGS.maxSizeRatio).toBe(1);
  });
});

describe('burstCount (SOO-1049 후속 3~5개 동시 생성)', () => {
  it('rnd 3분할로 3·4·5개', () => {
    expect(burstCount(0)).toBe(3);
    expect(burstCount(0.32)).toBe(3);
    expect(burstCount(1 / 3)).toBe(4);
    expect(burstCount(0.65)).toBe(4);
    expect(burstCount(2 / 3)).toBe(5);
    expect(burstCount(1)).toBe(5);
  });
  it('항상 3·4·5(범위 밖·NaN 안전화)', () => {
    for (const v of [-1, 2, NaN, Infinity]) {
      expect([3, 4, 5]).toContain(burstCount(v));
    }
  });
});

describe('circlesArea', () => {
  it('π·r² 합', () => {
    expect(circlesArea([{ x: 0, y: 0, r: 10 }])).toBeCloseTo(Math.PI * 100);
    expect(circlesArea([{ x: 0, y: 0, r: 2 }, { x: 5, y: 5, r: 3 }])).toBeCloseTo(
      Math.PI * (4 + 9),
    );
  });
  it('빈 목록·비유한·0 반지름은 0 기여', () => {
    expect(circlesArea([])).toBe(0);
    expect(circlesArea([{ x: 0, y: 0, r: 0 }, { x: 0, y: 0, r: NaN }])).toBe(0);
  });
});

describe('areaFilled (SOO-1049 후속 4/5 채움 중단)', () => {
  it('면적이 임계 이상이면 true', () => {
    // 필드 100x100 = 10000, 임계 0.5 → 5000. r≈40 → π·1600≈5026 ≥ 5000
    expect(areaFilled([{ x: 50, y: 50, r: 40 }], 100, 100, 0.5)).toBe(true);
  });
  it('면적이 임계 미만이면 false', () => {
    expect(areaFilled([{ x: 50, y: 50, r: 10 }], 100, 100, 0.5)).toBe(false);
  });
  it('FILL_STOP_RATIO 는 0.7(SOO-1112 — 보더 요청으로 80%→70%, 원 패킹 이론 상한 아래)', () => {
    // 원은 겹치지 않고 면적의 ~90%(육각 패킹 이론값)를 넘길 수 없다. 70% 는 그 상한 아래이면서
    // 80% 보다 여유 있게 채운다. 스폰은 firstFreeSpawn 비중첩 자리에서만 이뤄져 겹침은 없다.
    expect(FILL_STOP_RATIO).toBe(0.7);
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

describe('referenceBubblePx (SOO-1054 공용 참조 지름)', () => {
  it('폭이 작으면 폭의 20%', () => {
    expect(referenceBubblePx(500)).toBeCloseTo(100);
  });
  it('폭이 크면 CAP 로 상한', () => {
    expect(referenceBubblePx(2000)).toBe(REFERENCE_BUBBLE_CAP_PX);
  });
  it('음수 폭은 0', () => {
    expect(referenceBubblePx(-100)).toBe(0);
  });
});

describe('interleavedReleaseSlots (SOO-1054 후속 — 카드·원 균등 교차 낙하)', () => {
  it('circleCount<=0 이면 빈 배열', () => {
    expect(interleavedReleaseSlots(21, 0)).toEqual([]);
    expect(interleavedReleaseSlots(21, -3)).toEqual([]);
  });
  it('원 개수만큼 슬롯을 반환하고 오름차순·중복 없음·범위 내', () => {
    const cards = 21;
    const circles = 12;
    const slots = interleavedReleaseSlots(cards, circles);
    expect(slots).toHaveLength(circles);
    // 오름차순
    expect([...slots].sort((a, b) => a - b)).toEqual(slots);
    // 중복 없음
    expect(new Set(slots).size).toBe(circles);
    // 0..total-1 범위
    for (const s of slots) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(cards + circles);
    }
  });
  it('원이 처음부터 끝까지 균등 분산됨(앞쪽에만 몰리지 않음)', () => {
    const total = 33;
    const slots = interleavedReleaseSlots(21, 12);
    // 첫 원은 전반부, 마지막 원은 후반부에 위치 → 원이 먼저 뭉쳐 떨어지지 않음
    expect(slots[0]).toBeLessThan(total / 2);
    expect(slots[slots.length - 1]).toBeGreaterThan(total / 2);
  });
  it('카드 슬롯(여집합)과 원 슬롯이 0..total-1 를 정확히 덮음', () => {
    const cards = 21;
    const circles = 12;
    const total = cards + circles;
    const circleSet = new Set(interleavedReleaseSlots(cards, circles));
    const cardSlots: number[] = [];
    for (let s = 0; cardSlots.length < cards; s++) if (!circleSet.has(s)) cardSlots.push(s);
    const all = new Set([...circleSet, ...cardSlots]);
    expect(all.size).toBe(total);
    for (let s = 0; s < total; s++) expect(all.has(s)).toBe(true);
  });
});

describe('groupedReleaseOrder (SOO-1109 — 단어·사각형·사각형 낙하 순서)', () => {
  it('기본 패턴(1단어·2사각형)이 단어·사각형·사각형·단어… 순서로 슬롯을 배정', () => {
    const { wordSlots, squareSlots } = groupedReleaseOrder(4, 4);
    // 릴리즈 슬롯을 타입 시퀀스로 복원
    const seq: string[] = [];
    wordSlots.forEach((s) => (seq[s] = 'W'));
    squareSlots.forEach((s) => (seq[s] = 'S'));
    expect(seq).toEqual(['W', 'S', 'S', 'W', 'S', 'S', 'W', 'W']);
  });
  it('18단어·9사각형: 슬롯이 0..26 를 무중복으로 정확히 덮음', () => {
    const words = 18;
    const squares = 9;
    const { wordSlots, squareSlots } = groupedReleaseOrder(words, squares);
    expect(wordSlots).toHaveLength(words);
    expect(squareSlots).toHaveLength(squares);
    const all = new Set([...wordSlots, ...squareSlots]);
    expect(all.size).toBe(words + squares);
    for (let s = 0; s < words + squares; s++) expect(all.has(s)).toBe(true);
  });
  it('사각형이 소진되면 남은 단어가 순서대로 이어짐', () => {
    // 3단어·2사각형 → W S S W W
    const { wordSlots, squareSlots } = groupedReleaseOrder(3, 2);
    const seq: string[] = [];
    wordSlots.forEach((s) => (seq[s] = 'W'));
    squareSlots.forEach((s) => (seq[s] = 'S'));
    expect(seq).toEqual(['W', 'S', 'S', 'W', 'W']);
  });
  it('한쪽 개수가 0이어도 무한 루프 없이 나머지를 배치', () => {
    expect(groupedReleaseOrder(0, 3)).toEqual({ wordSlots: [], squareSlots: [0, 1, 2] });
    expect(groupedReleaseOrder(3, 0)).toEqual({ wordSlots: [0, 1, 2], squareSlots: [] });
  });
  it('1:1 교대(단어·사각형·단어·사각형…) — 보더 재요청 코멘트 0a52c954', () => {
    // Step3 실제 호출: groupedReleaseOrder(18, 9, 1, 1)
    const { wordSlots, squareSlots } = groupedReleaseOrder(18, 9, 1, 1);
    const seq: string[] = [];
    wordSlots.forEach((s) => (seq[s] = 'W'));
    squareSlots.forEach((s) => (seq[s] = 'S'));
    // 앞 18슬롯(0..17)은 W S 교대, 사각형 소진(9개) 뒤 남은 단어가 이어짐
    const head = seq.slice(0, 18);
    expect(head).toEqual([
      'W', 'S', 'W', 'S', 'W', 'S', 'W', 'S', 'W', 'S', 'W', 'S', 'W', 'S', 'W', 'S', 'W', 'S',
    ]);
    // 사각형 소진 후 남은 단어(18-9=9개)가 뒤에 순서대로
    expect(seq.slice(18)).toEqual(['W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W']);
    // 무중복 전수 커버
    const all = new Set([...wordSlots, ...squareSlots]);
    expect(all.size).toBe(27);
  });
});

describe('결정적 균형 적재 레인 (SOO-1063)', () => {
  it('laneCenters — 좌우 대칭·균등 간격, 중앙 레인은 화면 중앙', () => {
    const W = 768;
    const centers = laneCenters(W, 5, 40);
    expect(centers).toHaveLength(5);
    // 균등 간격
    for (let i = 1; i < centers.length; i++) {
      expect(centers[i] - centers[i - 1]).toBeCloseTo(centers[1] - centers[0]);
    }
    // 좌우 대칭(각 레인 x + 대칭 레인 x = W)
    for (let i = 0; i < centers.length; i++) {
      expect(centers[i] + centers[centers.length - 1 - i]).toBeCloseTo(W);
    }
    // 홀수 레인 → 가운데는 화면 중앙
    expect(centers[2]).toBeCloseTo(W / 2);
  });

  it('laneCenters — laneCount<=1 이면 화면 중앙 한 곳', () => {
    expect(laneCenters(768, 1)).toEqual([384]);
    expect(laneCenters(768, 0)).toEqual([384]);
  });

  it('centerOutLaneOrder — 가운데부터 바깥으로, 전 레인 1회씩', () => {
    expect(centerOutLaneOrder(5)).toEqual([2, 3, 1, 4, 0]);
    expect(centerOutLaneOrder(4)).toEqual([1, 2, 0, 3]);
    // 모든 레인이 정확히 한 번씩
    const o = centerOutLaneOrder(7);
    expect(new Set(o).size).toBe(7);
    expect(o[0]).toBe(3); // 가운데 먼저
  });

  it('laneCountForWidth — [min,max] 클램프', () => {
    expect(laneCountForWidth(768, 134)).toBe(5);
    expect(laneCountForWidth(768, 9999)).toBe(3); // 너무 넓으면 min
    expect(laneCountForWidth(9999, 50)).toBe(7); // 너무 많으면 max
  });

  it('balancedLaneX — 결정적(같은 slot → 같은 x), 좌우 균형', () => {
    const W = 768;
    const n = 5;
    // 결정성: 반복 호출해도 동일
    expect(balancedLaneX(7, W, n)).toBe(balancedLaneX(7, W, n));
    // 연속 슬롯을 배정하면 좌우가 고르게 채워진다(한쪽 쏠림 없음).
    const N = 30;
    const xs: number[] = [];
    for (let s = 0; s < N; s++) xs.push(balancedLaneX(s, W, n));
    const left = xs.filter((x) => x < W / 2).length;
    const right = xs.filter((x) => x > W / 2).length;
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
    // 사용된 레인 수 = 레인 전체(모든 레인이 채워짐)
    expect(new Set(xs.map((x) => Math.round(x))).size).toBe(n);
  });

  it('brickStackX — 결정적이고, 홀수 행은 반 칸 어긋나 세로 타워가 없다(SOO-1063)', () => {
    const W = 768;
    const cols = 4;
    // 결정성: 같은 index → 같은 x
    expect(brickStackX(5, cols, W)).toBe(brickStackX(5, cols, W));
    // 같은 열(fillCol) 이라도 행이 다르면 x 가 달라진다(타워 방지).
    // index 0 = 행0·fillCol0, index cols = 행1·fillCol0 → 홀수 행 반 칸 오프셋으로 x 상이.
    expect(brickStackX(0, cols, W)).not.toBe(brickStackX(cols, cols, W));
    // 한 행(cols개)을 채우면 좌우가 균형 — 평균 x 가 화면 중앙 근처.
    const rowXs = Array.from({ length: cols }, (_, i) => brickStackX(i, cols, W));
    const avg = rowXs.reduce((a, b) => a + b, 0) / cols;
    expect(Math.abs(avg - W / 2)).toBeLessThan(W * 0.12);
    // 여러 행에 걸쳐 x 가 여러 값으로 분포(단일 열 뭉침 아님).
    const many = Array.from({ length: 18 }, (_, i) => Math.round(brickStackX(i, cols, W)));
    expect(new Set(many).size).toBeGreaterThanOrEqual(cols + 1);
  });

  it('spreadX — 장식이 폭 전체에 서로 다른 x 로 균등 분산(보라 기둥 방지, SOO-1063)', () => {
    const W = 768;
    const n = 6;
    const xs = Array.from({ length: n }, (_, i) => spreadX(i, n, W));
    // 모두 서로 다른 x(세로 기둥 아님)
    expect(new Set(xs.map((x) => Math.round(x))).size).toBe(n);
    // 단조 증가(좌→우 균등)
    for (let i = 1; i < n; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    // 결정적
    expect(spreadX(3, n, W)).toBe(spreadX(3, n, W));
    // 좌우 균형: 절반은 중앙 왼쪽, 절반은 오른쪽
    expect(xs.filter((x) => x < W / 2).length).toBe(n / 2);
  });
});

describe('purpleScaleRadius (SOO-1054 Step2 원 = Step1 보라 원 스케일)', () => {
  const bubble = 132; // 참조 지름
  it('rnd=1 이면 상한(=지름 100%의 절반)', () => {
    // 기본 maxSizeRatio=1 → 목표 지름 최대 = bubble → 반지름 = bubble/2
    expect(purpleScaleRadius(bubble, 1)).toBeCloseTo(bubble / 2);
  });
  it('rnd=0 이면 하한(=지름 50%의 절반)', () => {
    expect(purpleScaleRadius(bubble, 0)).toBeCloseTo((bubble * 0.5) / 2);
  });
  it('rnd 은 randomTargetPx/2 와 동일', () => {
    for (const rnd of [0.2, 0.5, 0.9]) {
      expect(purpleScaleRadius(bubble, rnd)).toBeCloseTo(randomTargetPx(bubble, 1, rnd) / 2);
    }
  });
});

describe('spawnZoneFor (SOO-1088 스폰 3등분 구역 결정)', () => {
  it('하 → 상 → 중 순서로 라운드로빈', () => {
    expect(spawnZoneFor(0)).toBe('bottom');
    expect(spawnZoneFor(1)).toBe('top');
    expect(spawnZoneFor(2)).toBe('middle');
    expect(spawnZoneFor(3)).toBe('bottom');
    expect(spawnZoneFor(4)).toBe('top');
    expect(spawnZoneFor(5)).toBe('middle');
  });
  it('장시간 구동 시 세 구역이 정확히 균등 분배(30회 → 각 10회)', () => {
    const counts = { bottom: 0, top: 0, middle: 0 };
    for (let i = 0; i < 30; i++) counts[spawnZoneFor(i)]++;
    expect(counts).toEqual({ bottom: 10, top: 10, middle: 10 });
  });
  it('음수·비유한 입력은 하단으로 안전화', () => {
    expect(spawnZoneFor(-3)).toBe('bottom');
    expect(spawnZoneFor(-1)).toBe('middle');
    expect(spawnZoneFor(NaN)).toBe('bottom');
  });
});

describe('midSpawnPoint (SOO-1088 가운데 스폰)', () => {
  const W = 764;
  const H = 1024;
  const R = 6;
  it('y 는 세로 중앙 밴드(기본 40~60%) 안', () => {
    for (const ry of [0, 0.5, 1]) {
      const p = midSpawnPoint(W, H, 0.5, ry, R);
      expect(p.y).toBeGreaterThanOrEqual(H * 0.4 - R);
      expect(p.y).toBeLessThanOrEqual(H * 0.6 + R);
    }
  });
  it('x 는 항상 마진 안', () => {
    const margin = 40;
    for (const rx of [0, 0.5, 1]) {
      const p = midSpawnPoint(W, H, rx, 0.5, R, margin);
      expect(p.x).toBeGreaterThanOrEqual(margin);
      expect(p.x).toBeLessThanOrEqual(W - margin);
    }
  });
  it('y 는 반지름만큼 상·하 경계 안쪽(이탈 방지)', () => {
    const p = midSpawnPoint(W, H, 0.5, 0.5, R);
    expect(p.y).toBeGreaterThanOrEqual(R);
    expect(p.y).toBeLessThanOrEqual(H - R);
  });
});

describe('randomSpawnPoint (SOO-1088 후속 완전 랜덤 스폰 위치)', () => {
  const W = 764;
  const H = 1024;
  const R = 6;
  it('전 영역을 커버 — 상단·중앙·하단 어디서든 태어난다', () => {
    const top = randomSpawnPoint(W, H, 0.5, 0, R);
    const mid = randomSpawnPoint(W, H, 0.5, 0.5, R);
    const bot = randomSpawnPoint(W, H, 0.5, 1, R);
    expect(top.y).toBeLessThan(mid.y);
    expect(mid.y).toBeLessThan(bot.y);
    // 밴드에 갇히지 않음: 하단 값은 화면 아래쪽(>60%), 상단 값은 위쪽(<40%).
    expect(top.y).toBeLessThan(H * 0.4);
    expect(bot.y).toBeGreaterThan(H * 0.6);
  });
  it('rnd 0·1 극단에서도 반지름/마진만큼 경계 안쪽 — 어떤 원도 이탈하지 않음', () => {
    for (const rx of [0, 1]) {
      for (const ry of [0, 1]) {
        const p = randomSpawnPoint(W, H, rx, ry, R);
        expect(p.x).toBeGreaterThanOrEqual(R);
        expect(p.x).toBeLessThanOrEqual(W - R);
        expect(p.y).toBeGreaterThanOrEqual(R);
        expect(p.y).toBeLessThanOrEqual(H - R);
      }
    }
  });
  it('반지름이 margin 보다 크면 반지름이 우선(큰 원도 안쪽에서 생성)', () => {
    const bigR = 80;
    const p = randomSpawnPoint(W, H, 0, 0, bigR, 40);
    expect(p.x).toBeGreaterThanOrEqual(bigR);
    expect(p.y).toBeGreaterThanOrEqual(bigR);
  });
  it('비유한 입력·0 크기 화면에서도 NaN 없이 안전', () => {
    const p = randomSpawnPoint(NaN, NaN, NaN, NaN, R);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });
  // 랜덤 스폰 후보는 어떤 난수 조합에서도 버블 중심이 [R, size−R] 안에 있어 반지름만큼의
  // 원이 화면을 벗어나지 않음(화면 이탈 방지 불변식)을 촘촘한 스윕으로 회귀 검증한다.
  it('랜덤 스폰 스윕 — 어떤 난수에서도 화면 이탈 없음(경계 회피 보장)', () => {
    for (let i = 0; i <= 20; i++) {
      for (let j = 0; j <= 20; j++) {
        const p = randomSpawnPoint(W, H, i / 20, j / 20, R);
        expect(p.x).toBeGreaterThanOrEqual(R);
        expect(p.x).toBeLessThanOrEqual(W - R);
        expect(p.y).toBeGreaterThanOrEqual(R);
        expect(p.y).toBeLessThanOrEqual(H - R);
      }
    }
  });
});

// SOO-1112 재-비중첩(보더 피드백: 겹친 채 태어나 부르르 떨림 제거).
// 훅(useStep1Physics)의 스폰 경로는 randomSpawnPoint 로 후보를 만든 뒤 firstFreeSpawn 으로
// **목표(성장 후) 반지름 + 여유** 가 이웃(버블 목표 크기·단어 실측 반지름)과 겹치지 않는 첫
// 자리를 고른다. 순수 값 헬퍼 조합만으로 그 불변식을 모사해, 반환 자리가 항상 비중첩임을 검증한다.
describe('SOO-1112 비중첩 스폰 자리 사전 계산(firstFreeSpawn ∘ randomSpawnPoint)', () => {
  const W = 764;
  const H = 1024;
  const PAD = 4;
  // 화면 중앙을 큰 원들이 점유. 목표 반지름 40 짜리 신규 버블이 겹치지 않는 자리를 찾아야 한다.
  const occupied: Circle[] = [
    { x: 200, y: 300, r: 60 },
    { x: 500, y: 300, r: 60 },
    { x: 380, y: 700, r: 80 },
  ];
  it('반환된 자리는 모든 점유 원과 목표 반지름 기준 비중첩(겹침 0)', () => {
    const targetR = 40;
    // 결정적 후보 스윕(rx·ry 격자) — 난수 대신 균등 격자로 재현 가능한 후보를 만든다.
    const candidates: { x: number; y: number }[] = [];
    for (let i = 0; i <= 12; i++) {
      for (let j = 0; j <= 12; j++) {
        candidates.push(randomSpawnPoint(W, H, i / 12, j / 12, targetR));
      }
    }
    const spot = firstFreeSpawn(candidates, targetR, occupied, PAD);
    expect(spot).not.toBeNull();
    for (const o of occupied) {
      // 목표 반지름 원이 점유 원과 pad 여유까지 두고 떨어져 있어야 한다.
      expect(circlesOverlap(spot!.x, spot!.y, targetR, o.x, o.y, o.r, PAD)).toBe(false);
    }
    // 목표 크기 원이 화면 안(경계 이탈 없음)에도 들어와야 한다.
    expect(spot!.x).toBeGreaterThanOrEqual(targetR);
    expect(spot!.x).toBeLessThanOrEqual(W - targetR);
    expect(spot!.y).toBeGreaterThanOrEqual(targetR);
    expect(spot!.y).toBeLessThanOrEqual(H - targetR);
  });
  it('빈 자리가 전혀 없으면 null 을 반환해 스폰을 보류(겹친 채 생성 금지)', () => {
    // 스테이지 전체를 덮는 거대 점유 → 어떤 후보도 자유롭지 않다.
    const full: Circle[] = [{ x: W / 2, y: H / 2, r: Math.max(W, H) }];
    const targetR = 40;
    const candidates: { x: number; y: number }[] = [];
    for (let i = 0; i <= 8; i++) {
      for (let j = 0; j <= 8; j++) {
        candidates.push(randomSpawnPoint(W, H, i / 8, j / 8, targetR));
      }
    }
    expect(firstFreeSpawn(candidates, targetR, full, PAD)).toBeNull();
  });
  it('성장 상한(maxGrowRadius)은 이웃과 겹치기 직전에서 멈춘다', () => {
    // 중심 (0,0) 버블이 (100,0) 반지름 30 이웃을 향해 성장 시, pad=4 를 두고 66 에서 상한.
    const others: Circle[] = [{ x: 100, y: 0, r: 30 }];
    expect(maxGrowRadius(0, 0, 90, others, PAD)).toBeCloseTo(66);
  });
});

describe('randomSpawnZone (SOO-1088 후속 완전 랜덤 거동 선택)', () => {
  it('0~1 을 세 구역으로 균등 분할(각 1/3)', () => {
    expect(randomSpawnZone(0)).toBe('bottom');
    expect(randomSpawnZone(0.3)).toBe('bottom');
    expect(randomSpawnZone(0.4)).toBe('top');
    expect(randomSpawnZone(0.6)).toBe('top');
    expect(randomSpawnZone(0.7)).toBe('middle');
    expect(randomSpawnZone(1)).toBe('middle');
  });
  it('많이 뽑으면 세 거동이 대략 균등하게 나온다', () => {
    const counts = { bottom: 0, top: 0, middle: 0 };
    for (let i = 0; i < 300; i++) counts[randomSpawnZone(i / 300)]++;
    // 각 구역이 최소 80회 이상(1/3 = 100 근처).
    expect(counts.bottom).toBeGreaterThan(80);
    expect(counts.top).toBeGreaterThan(80);
    expect(counts.middle).toBeGreaterThan(80);
  });
  it('비유한·범위 밖 입력은 0~1 로 안전화', () => {
    expect(randomSpawnZone(NaN)).toBe('bottom');
    expect(randomSpawnZone(-5)).toBe('bottom');
    expect(randomSpawnZone(9)).toBe('middle');
  });
});

describe('clampToStage (SOO-1088 화면 이탈 방지 클램프)', () => {
  const W = 764;
  const H = 1024;
  const R = 30;
  it('경계 안의 중심은 그대로 통과(클램프 없음)', () => {
    const c = clampToStage(400, 500, R, W, H);
    expect(c).toEqual({ x: 400, y: 500, clampedX: false, clampedY: false });
  });
  it('좌·우 경계를 넘으면 [r, width−r] 로 되돌림', () => {
    const left = clampToStage(-100, 500, R, W, H);
    expect(left.x).toBe(R);
    expect(left.clampedX).toBe(true);
    const right = clampToStage(W + 100, 500, R, W, H);
    expect(right.x).toBe(W - R);
    expect(right.clampedX).toBe(true);
  });
  it('하단 경계를 넘으면 height−r 로 되돌림', () => {
    const c = clampToStage(400, H + 200, R, W, H);
    expect(c.y).toBe(H - R);
    expect(c.clampedY).toBe(true);
  });
  it('반지름을 고려 — 원의 어떤 부분도 경계를 넘지 않음', () => {
    // 중심이 r 미만이면 원이 경계 밖으로 삐져나옴 → r 로 밀어 넣음.
    const c = clampToStage(R - 5, R - 5, R, W, H);
    expect(c.x).toBe(R);
    expect(c.y).toBe(R);
  });
  it('top:false 면 상단(y<0)은 클램프하지 않음(낙하 진입 허용)', () => {
    const c = clampToStage(400, -300, R, W, H, { top: false });
    expect(c.y).toBe(-300);
    expect(c.clampedY).toBe(false);
    // 그래도 하단·좌·우는 강제.
    const bottom = clampToStage(400, H + 100, R, W, H, { top: false });
    expect(bottom.y).toBe(H - R);
    expect(bottom.clampedY).toBe(true);
  });
  it('반지름이 화면 절반보다 커도 중심으로 안전 수렴(NaN 없음)', () => {
    const c = clampToStage(9999, 9999, 1000, W, H);
    expect(Number.isFinite(c.x)).toBe(true);
    expect(Number.isFinite(c.y)).toBe(true);
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.x).toBeLessThanOrEqual(W);
  });
});

describe('clampAngle (SOO-1092 회전 ±45° 제한)', () => {
  const LIM = Math.PI / 4; // 45°

  it('경계 이내면 각도·각속도를 그대로 통과(clamped=false)', () => {
    const c = clampAngle(0.2, 0.05, LIM);
    expect(c.clamped).toBe(false);
    expect(c.angle).toBe(0.2);
    expect(c.angularVelocity).toBe(0.05);
  });

  it('+경계 초과면 +lim 으로 되돌리고 바깥(양수) 각속도 제거', () => {
    const c = clampAngle(1.2, 0.3, LIM);
    expect(c.clamped).toBe(true);
    expect(c.angle).toBeCloseTo(LIM);
    expect(c.angularVelocity).toBe(0); // 바깥으로 미는 각속도 제거
  });

  it('−경계 초과면 −lim 으로 되돌리고 바깥(음수) 각속도 제거', () => {
    const c = clampAngle(-1.2, -0.3, LIM);
    expect(c.clamped).toBe(true);
    expect(c.angle).toBeCloseTo(-LIM);
    expect(c.angularVelocity).toBe(0);
  });

  it('경계 초과라도 안쪽(0 을 향해 회복)으로 도는 각속도는 유지 → 스냅 없이 복귀', () => {
    // +경계에서 음의 각속도(=안쪽으로 회복)는 살린다.
    expect(clampAngle(1.2, -0.3, LIM).angularVelocity).toBe(-0.3);
    // −경계에서 양의 각속도(=안쪽으로 회복)는 살린다.
    expect(clampAngle(-1.2, 0.3, LIM).angularVelocity).toBe(0.3);
  });

  it('결과 각도는 항상 ±lim 이내', () => {
    for (const a of [-10, -1, -0.1, 0, 0.1, 1, 10]) {
      const c = clampAngle(a, 0, LIM);
      expect(Math.abs(c.angle)).toBeLessThanOrEqual(LIM + 1e-9);
    }
  });

  it('비유한 입력은 0 으로 안전화', () => {
    const c = clampAngle(NaN, NaN, LIM);
    expect(c.angle).toBe(0);
    expect(c.angularVelocity).toBe(0);
    expect(c.clamped).toBe(false);
  });
});

describe('clampBoxToStage (SOO-1110 사각형 경계 이탈 방지)', () => {
  const W = 768;
  const H = 1024;
  const HW = 60; // 반폭
  const HH = 31; // 반높이

  it('경계 안 상자는 보정하지 않는다', () => {
    const c = clampBoxToStage(400, 500, HW, HH, W, H);
    expect(c.clampedX).toBe(false);
    expect(c.clampedY).toBe(false);
    expect(c.x).toBe(400);
    expect(c.y).toBe(500);
  });

  it('좌·우 경계를 넘으면 반폭만큼 안으로 되돌린다', () => {
    const left = clampBoxToStage(-50, 500, HW, HH, W, H);
    expect(left.x).toBe(HW);
    expect(left.clampedX).toBe(true);
    const right = clampBoxToStage(W + 50, 500, HW, HH, W, H);
    expect(right.x).toBe(W - HW);
    expect(right.clampedX).toBe(true);
  });

  it('하단 경계를 넘으면 반높이만큼 위로 되돌린다', () => {
    const c = clampBoxToStage(400, H + 100, HW, HH, W, H);
    expect(c.y).toBe(H - HH);
    expect(c.clampedY).toBe(true);
  });

  it('상자 어느 모서리도 경계를 넘지 않는다(x∈[HW,W-HW], y≤H-HH)', () => {
    for (const [x, y] of [
      [-999, -999],
      [9999, 9999],
      [0, 0],
      [W, H],
    ] as const) {
      const c = clampBoxToStage(x, y, HW, HH, W, H);
      expect(c.x).toBeGreaterThanOrEqual(HW - 1e-9);
      expect(c.x).toBeLessThanOrEqual(W - HW + 1e-9);
      expect(c.y).toBeLessThanOrEqual(H - HH + 1e-9);
    }
  });

  it('top=false 면 상단은 강제하지 않아 낙하 진입(y<0)을 막지 않는다', () => {
    const c = clampBoxToStage(400, -300, HW, HH, W, H, { top: false });
    expect(c.y).toBe(-300);
    expect(c.clampedY).toBe(false);
    // 하단·좌·우는 여전히 강제
    const bottom = clampBoxToStage(400, H + 100, HW, HH, W, H, { top: false });
    expect(bottom.y).toBe(H - HH);
  });

  it('반폭/반높이가 절반 크기보다 크면 중앙으로 모은다', () => {
    const c = clampBoxToStage(0, 0, W, H, W, H);
    expect(c.x).toBeCloseTo(W / 2);
    expect(c.y).toBeCloseTo(H / 2);
  });
});

describe('mulberry32 (SOO-1110 결정적 PRNG)', () => {
  it('같은 시드는 같은 난수열을 재생한다', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });

  it('다른 시드는 다른 열을 만든다', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it('반환값은 항상 [0,1) 범위', () => {
    const r = mulberry32(999);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('비유한 시드는 0 으로 안전화(결정적)', () => {
    expect(mulberry32(NaN)()).toBe(mulberry32(0)());
  });
});

describe('shuffleIndices (SOO-1110 랜덤 낙하 순서)', () => {
  it('0..count-1 을 한 번씩 담은 순열이다', () => {
    const rng = mulberry32(42);
    const out = shuffleIndices(10, rng);
    expect(out.length).toBe(10);
    expect([...out].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('같은 시드 PRNG 는 같은 순열(결정적·재현 가능)', () => {
    expect(shuffleIndices(24, mulberry32(7))).toEqual(shuffleIndices(24, mulberry32(7)));
  });

  it('count<=0 이면 빈 배열', () => {
    expect(shuffleIndices(0, mulberry32(1))).toEqual([]);
    expect(shuffleIndices(-3, mulberry32(1))).toEqual([]);
  });

  it('실제로 섞인다(항등이 아님)', () => {
    // 넉넉한 크기에서 어떤 시드로든 항등 순열이 아닌 결과를 하나는 찾는다.
    let shuffled = false;
    for (let seed = 1; seed <= 5 && !shuffled; seed++) {
      const out = shuffleIndices(24, mulberry32(seed));
      if (out.some((v, i) => v !== i)) shuffled = true;
    }
    expect(shuffled).toBe(true);
  });
});

describe('randomBoxX (SOO-1110 랜덤 x·경계 내)', () => {
  const W = 768;
  it('rnd 0 → 왼쪽 인셋, rnd 1 → 오른쪽 인셋(상자가 경계 안)', () => {
    const halfW = 60;
    const lo = randomBoxX(0, W, halfW);
    const hi = randomBoxX(1, W, halfW);
    // 인셋 = max(halfW=60, margin=40) = 60
    expect(lo).toBe(60);
    expect(hi).toBe(W - 60);
  });

  it('어떤 rnd·halfW 에도 상자가 경계를 넘지 않는다', () => {
    for (const halfW of [10, 60, 120]) {
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const x = randomBoxX(t, W, halfW);
        expect(x - halfW).toBeGreaterThanOrEqual(-1e-9);
        expect(x + halfW).toBeLessThanOrEqual(W + 1e-9);
      }
    }
  });

  it('rnd 범위 밖·비유한 입력은 [0,1] 로 안전화', () => {
    expect(randomBoxX(-5, W, 60)).toBe(randomBoxX(0, W, 60));
    expect(randomBoxX(99, W, 60)).toBe(randomBoxX(1, W, 60));
    expect(Number.isFinite(randomBoxX(NaN, W, 60))).toBe(true);
  });
});

describe('leftmostFreeSlotX (SOO-1109/1110 좌측 우선 빈-자리 채움)', () => {
  const W = 768;
  const M = 40;
  const G = 8;

  it('빈 행이면 좌측 벽 인셋(margin + 반폭)에 배치한다', () => {
    const x = leftmostFreeSlotX([], 100, W, M, G);
    expect(x).toBe(M + 50); // 40 + 50
  });

  it('좌→우로 차곡차곡: 다음 상자는 이전 상자 우측 끝 + gap 뒤에 놓인다', () => {
    const first = leftmostFreeSlotX([], 100, W, M, G)!; // 90 (center)
    const placed = [{ x: first, w: 100 }];
    const second = leftmostFreeSlotX(placed, 100, W, M, G)!;
    // 첫 상자 우측 끝 = 90+50 = 140, +gap(8) +반폭(50) = 198
    expect(second).toBe(140 + G + 50);
    // 두 상자는 겹치지 않는다(간격 >= gap)
    expect(second - 50 - (first + 50)).toBeGreaterThanOrEqual(G - 1e-9);
  });

  it('placed 순서가 뒤섞여 있어도 항상 가장 왼쪽 빈 자리를 찾는다', () => {
    // 오른쪽에만 상자가 있으면 좌측 벽에 붙는다
    const placed = [{ x: 600, w: 80 }];
    const x = leftmostFreeSlotX(placed, 100, W, M, G)!;
    expect(x).toBe(M + 50);
  });

  it('좌측이 막혔지만 중간에 빈 틈이 있으면 그 틈에 넣는다', () => {
    // 좌측에 넓은 상자(center 90, w 100 → 우측 끝 140), 그 다음 자리
    const placed = [{ x: 90, w: 100 }];
    const x = leftmostFreeSlotX(placed, 60, W, M, G)!;
    // 좌측 벽 후보(40+30=70) 는 첫 상자와 겹침 → 우측 끝(140)+gap(8)+반폭(30)=178
    expect(x).toBe(140 + G + 30);
  });

  it('행이 꽉 차 우측 벽을 넘으면 null 을 반환한다(→ 새 행)', () => {
    // 폭 700 상자를 놓으면 남는 공간이 없다
    const placed = [{ x: M + 350, w: 700 }];
    const x = leftmostFreeSlotX(placed, 100, W, M, G);
    expect(x).toBeNull();
  });

  it('연속 배치 시 어떤 두 상자도 좌우로 겹치지 않는다(비중첩 불변식)', () => {
    const widths = [120, 90, 150, 60, 200, 80, 110];
    const row: { x: number; w: number }[] = [];
    for (const w of widths) {
      const x = leftmostFreeSlotX(row, w, W, M, G);
      if (x === null) break; // 새 행 필요
      row.push({ x, w });
    }
    for (let i = 0; i < row.length; i++) {
      for (let j = i + 1; j < row.length; j++) {
        const a = row[i];
        const b = row[j];
        const overlap = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2);
        expect(overlap).toBeLessThanOrEqual(0 + 1e-9); // 겹침 없음
      }
      // 경계 안
      expect(row[i].x - row[i].w / 2).toBeGreaterThanOrEqual(M - 1e-9);
      expect(row[i].x + row[i].w / 2).toBeLessThanOrEqual(W - M + 1e-9);
    }
  });

  it('상자가 스테이지보다 넓으면 null(비유한 입력도 안전)', () => {
    expect(leftmostFreeSlotX([], 800, W, M, G)).toBeNull();
    expect(leftmostFreeSlotX([{ x: NaN, w: NaN }], 100, W, M, G)).toBe(M + 50);
  });
});

describe('bottomFreeSpawn (SOO-1112 재수정 — 하단 비겹침 스폰)', () => {
  const W = 700;
  const H = 500;
  const R = 6;

  it('기존 버블이 없으면 하단 밴드의 첫 후보를 반환한다', () => {
    const spot = bottomFreeSpawn(W, H, R, [], [0.5], 4);
    expect(spot).not.toBeNull();
    // 하단(y 가 바닥 근처).
    expect(spot!.y).toBeGreaterThan(H * 0.9);
  });

  it('겹치는 버블을 피해 다음 후보(빈 자리)를 고른다', () => {
    // 첫 후보(x≈40)에 겹치는 버블, 두 번째 후보(x≈660)는 자유.
    const occupied: Circle[] = [{ x: 40, y: H - R - 1, r: 40 }];
    const spot = bottomFreeSpawn(W, H, R, occupied, [0, 1], 4);
    expect(spot).not.toBeNull();
    expect(spot!.x).toBeGreaterThan(W / 2);
  });

  it('모든 후보가 기존 버블과 겹치면 null(스폰 보류)', () => {
    // 하단 전 폭을 덮는 큰 버블 → 어떤 하단 후보도 자유롭지 않다.
    const occupied: Circle[] = [{ x: W / 2, y: H, r: W }];
    const spot = bottomFreeSpawn(W, H, R, occupied, [0, 0.25, 0.5, 0.75, 1], 4);
    expect(spot).toBeNull();
  });

  it('단어는 occupied 에 넣지 않으므로 하단이 단어로 차 있어도 스폰된다(밀어올림 전제)', () => {
    // 호출부는 버블만 넘긴다 — 단어 무더기가 하단을 채워도 하단 스폰이 가능해야 밀어올림이 성립.
    const spot = bottomFreeSpawn(W, H, R, [], [0.5], 4);
    expect(spot).not.toBeNull();
  });
});

describe('randomFreeSpawn (SOO-1112 재재수정 — 전역 랜덤 비겹침 스폰)', () => {
  const W = 700;
  const H = 500;
  const R = 6;

  it('기존 버블이 없으면 첫 랜덤 후보를 반환한다(경계 안쪽)', () => {
    const spot = randomFreeSpawn(W, H, R, [], [[0.5, 0.5]], 4);
    expect(spot).not.toBeNull();
    expect(spot!.x).toBeGreaterThanOrEqual(R);
    expect(spot!.x).toBeLessThanOrEqual(W - R);
    expect(spot!.y).toBeGreaterThanOrEqual(R);
    expect(spot!.y).toBeLessThanOrEqual(H - R);
  });

  it('하단뿐 아니라 화면 위쪽에도 태어난다(랜덤 분포 — 하단 국한 아님)', () => {
    // rndY=0 → 상단 근처. bottomFreeSpawn 과 달리 하단에 갇히지 않는다.
    const spot = randomFreeSpawn(W, H, R, [], [[0.5, 0]], 4);
    expect(spot).not.toBeNull();
    expect(spot!.y).toBeLessThan(H * 0.1);
  });

  it('겹치는 버블을 피해 다음 랜덤 후보(빈 자리)를 고른다', () => {
    // 첫 후보(중앙)에 큰 버블이 겹침 → 두 번째 후보(모서리)로.
    const occupied: Circle[] = [{ x: W / 2, y: H / 2, r: 60 }];
    const spot = randomFreeSpawn(W, H, R, occupied, [
      [0.5, 0.5],
      [0, 0],
    ], 4);
    expect(spot).not.toBeNull();
    // 겹치는 중앙이 아니라 두 번째 후보(좌상단 안쪽).
    expect(spot!.x).toBeLessThan(W / 2);
    expect(spot!.y).toBeLessThan(H / 2);
  });

  it('모든 후보가 기존 버블과 겹치면 null(스폰 보류 — 겹친 채 생성 금지)', () => {
    // 화면 전체를 덮는 거대 버블 → 어떤 후보도 자유롭지 않다.
    const occupied: Circle[] = [{ x: W / 2, y: H / 2, r: W }];
    const spot = randomFreeSpawn(W, H, R, occupied, [
      [0, 0],
      [0.5, 0.5],
      [1, 1],
    ], 4);
    expect(spot).toBeNull();
  });

  it('단어는 occupied 에 넣지 않으므로 단어가 있어도 스폰된다(밀어올림 전제 유지)', () => {
    // 호출부는 버블만 넘긴다 — 단어는 upwardPushTargets 로 밀어 올린다.
    const spot = randomFreeSpawn(W, H, R, [], [[0.3, 0.7]], 4);
    expect(spot).not.toBeNull();
  });
});

describe('upwardPushTargets (SOO-1112 재수정 — 밀어올림 사전 계산)', () => {
  it('버블 바로 위에서 겹치는 단어를 위로(y 감소) 민다', () => {
    const bubble: Circle = { x: 100, y: 400, r: 30 };
    const words: Circle[] = [{ x: 100, y: 380, r: 20 }]; // 중심거리 20 < 30+20
    const out = upwardPushTargets(bubble, words, 0);
    expect(out).toHaveLength(1);
    expect(out[0].index).toBe(0);
    // 목표 y 는 버블 위쪽으로 정확히 r합(=50)만큼 떨어진 지점(dx=0).
    expect(out[0].y).toBeCloseTo(400 - 50);
    expect(out[0].y).toBeLessThan(380); // 위로 이동
  });

  it('밀어올린 뒤에는 두 원이 겹치지 않는다(pad 포함)', () => {
    const bubble: Circle = { x: 100, y: 400, r: 30 };
    const words: Circle[] = [{ x: 110, y: 390, r: 20 }];
    const pad = 4;
    const out = upwardPushTargets(bubble, words, pad);
    expect(out).toHaveLength(1);
    const nx = words[0].x;
    const ny = out[0].y;
    const dist = Math.hypot(nx - bubble.x, ny - bubble.y);
    expect(dist).toBeGreaterThanOrEqual(bubble.r + words[0].r + pad - 1e-6);
  });

  it('수평으로 이미 벗어난 단어는 건드리지 않는다', () => {
    const bubble: Circle = { x: 100, y: 400, r: 30 };
    const words: Circle[] = [{ x: 300, y: 400, r: 20 }]; // dx=200 >> 50
    expect(upwardPushTargets(bubble, words, 0)).toHaveLength(0);
  });

  it('겹치지 않는(떨어진) 단어는 건드리지 않는다', () => {
    const bubble: Circle = { x: 100, y: 400, r: 30 };
    const words: Circle[] = [{ x: 100, y: 300, r: 20 }]; // 거리 100 > 50
    expect(upwardPushTargets(bubble, words, 0)).toHaveLength(0);
  });

  it('이미 버블보다 충분히 위에 있는 단어는 아래로 내리지 않는다', () => {
    // 단어가 버블 위에서 겹치지만 목표 y 보다 이미 위 → 이동 없음(단조 위로만).
    const bubble: Circle = { x: 100, y: 400, r: 30 };
    const words: Circle[] = [{ x: 100, y: 360, r: 20 }]; // 거리 40 < 50 → 겹침, 목표 y=350
    const out = upwardPushTargets(bubble, words, 0);
    // 목표 y(350) 는 현재 y(360)보다 위이므로 밀어올림 발생, 아래로 내리지 않는다.
    expect(out).toHaveLength(1);
    expect(out[0].y).toBeLessThan(360);
  });

  it('아래에 있는 단어는 위로만 이동해 y 가 감소한다(절대 증가 없음)', () => {
    const bubble: Circle = { x: 100, y: 400, r: 30 };
    const words: Circle[] = [
      { x: 90, y: 410, r: 20 }, // 버블보다 아래에서 겹침
      { x: 100, y: 385, r: 20 },
    ];
    const out = upwardPushTargets(bubble, words, 2);
    for (const t of out) {
      expect(t.y).toBeLessThan(words[t.index].y);
    }
  });

  it('빈 단어 목록·비유한 입력에 안전', () => {
    expect(upwardPushTargets({ x: 0, y: 0, r: 10 }, [])).toEqual([]);
    const out = upwardPushTargets(
      { x: NaN, y: 0, r: 10 },
      [{ x: 0, y: 5, r: NaN }],
    );
    expect(Array.isArray(out)).toBe(true);
  });
});

describe('approach (SOO-1112 후속 — 부드러운 밀어올림 글라이드)', () => {
  it('목표 쪽으로 이동하되 절대 지나치지 않는다(오버슈트 없음)', () => {
    const next = approach(0, 100, 16, 95);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(100);
  });

  it('위로(감소) 방향도 동일하게 부드럽게 접근한다', () => {
    const next = approach(400, 350, 16, 95);
    expect(next).toBeLessThan(400);
    expect(next).toBeGreaterThan(350);
  });

  it('여러 프레임 누적 시 목표에 단조 수렴한다(ease-out 감속)', () => {
    let y = 0;
    let prevStep = Infinity;
    for (let i = 0; i < 60; i++) {
      const nextY = approach(y, 100, 16, 95);
      if (nextY === 100) {
        y = nextY;
        break; // eps 스냅 프레임 — 감속 단조성 검사 대상에서 제외
      }
      const step = nextY - y;
      expect(step).toBeGreaterThanOrEqual(-1e-9); // 뒤로 가지 않음
      expect(step).toBeLessThanOrEqual(prevStep + 1e-9); // 남은 거리 비례 → 감속
      prevStep = step;
      y = nextY;
    }
    expect(y).toBeCloseTo(100, 1);
  });

  it('목표에 eps 이내로 들어오면 정확히 스냅한다(무한 접근 종료)', () => {
    expect(approach(99.7, 100, 16, 95, 0.5)).toBe(100);
    expect(approach(100.2, 100, 16, 95, 0.5)).toBe(100);
  });

  it('dt=0 이면 제자리(움직임 없음)', () => {
    expect(approach(10, 100, 0, 95)).toBe(10);
  });

  it('tau 가 작을수록 한 프레임 이동량이 크다(빠른 접근)', () => {
    const fast = approach(0, 100, 16, 30);
    const slow = approach(0, 100, 16, 200);
    expect(fast).toBeGreaterThan(slow);
  });

  it('비유한 입력에 안전(현재·목표 NaN 폴백)', () => {
    expect(approach(NaN, 50, 16, 95)).toBe(50);
    expect(approach(50, NaN, 16, 95)).toBe(50);
  });
});
