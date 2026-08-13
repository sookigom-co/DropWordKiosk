import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FX_SETTINGS,
  FILL_STOP_RATIO,
  FX_RANGES,
  areaFilled,
  bodiesSettled,
  burstCount,
  circlesArea,
  circlesOverlap,
  clampFx,
  clampRange,
  easeOutCubic,
  firstFreeSpawn,
  growthRadius,
  interleavedReleaseSlots,
  maxCirclePx,
  maxGrowRadius,
  pickSpawnPoint,
  pickSpawnPointBand,
  pickSpawnPointFull,
  purpleColor,
  purpleScaleRadius,
  randomTargetPx,
  REFERENCE_BUBBLE_CAP_PX,
  referenceBubblePx,
  spawnBetweenBodies,
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

describe('DEFAULT_FX_SETTINGS (SOO-1049 후속 보더 요청 값)', () => {
  it('생성 간격 100ms · 성장 0.2s · 최대 비율 50%', () => {
    expect(DEFAULT_FX_SETTINGS.spawnIntervalMs).toBe(100);
    expect(DEFAULT_FX_SETTINGS.growDurationSec).toBe(0.2);
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
  it('FILL_STOP_RATIO 는 1(가득 채움 — 면적 상한 조기 중단 없음)', () => {
    expect(FILL_STOP_RATIO).toBe(1);
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
