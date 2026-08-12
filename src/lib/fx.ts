/**
 * Step 1 대상 선택 화면 물리 효과 파라미터(SOO-1048).
 *
 * 단어 원은 중력으로 낙하해 바닥에 랜덤하게 쌓이고, 빈 공간에서 보라색 공이
 * 랜덤 크기로 생성되어 점점 커지며 쌓인 단어 원들을 밀어 올린다.
 * 상단 로고 클릭으로 열리는 설정 패널에서 실시간 조절한다.
 *
 * 순수 값 로직만 이 파일에 두어 유닛 테스트 가능하게 하고,
 * matter-js 물리 시뮬레이션/React 렌더링은 컴포넌트·훅 쪽에서 소비한다.
 */
export interface FxSettings {
  /** 중력 세기 배율(클수록 빠르게 떨어지고 무겁게 쌓임). */
  gravity: number;
  /** 보라색 공 생성 간격(ms, 작을수록 자주 생성). */
  spawnIntervalMs: number;
  /** 보라색 공 성장 지속 시간(s, 작을수록 빨리 커짐). */
  growDurationSec: number;
  /** 보라색 공 최대 지름(단어 원 지름 대비 비율). */
  maxSizeRatio: number;
  /** 보라색 톤(HSL 색상각, 240~300 = 보라 계열). */
  hue: number;
}

export interface FxRange {
  readonly min: number;
  readonly max: number;
  /** 슬라이더 step */
  readonly step: number;
}

/** 각 파라미터의 허용 범위(패널 슬라이더 + clamp 공용). */
export const FX_RANGES: Readonly<Record<keyof FxSettings, FxRange>> = {
  gravity: { min: 0.4, max: 2, step: 0.1 },
  spawnIntervalMs: { min: 900, max: 5000, step: 100 },
  growDurationSec: { min: 0.8, max: 5, step: 0.1 },
  // 보라색 공은 단어 원을 밀어 올려야 하므로 단어 원보다 커질 수 있다(비율 > 1 허용).
  maxSizeRatio: { min: 0.6, max: 2.4, step: 0.05 },
  hue: { min: 240, max: 300, step: 1 },
};

export const DEFAULT_FX_SETTINGS: FxSettings = {
  gravity: 1,
  spawnIntervalMs: 2200,
  growDurationSec: 2.6,
  maxSizeRatio: 1.5,
  hue: 262,
};

/** 값을 [min, max] 로 클램프. NaN/비유한 값은 min 으로 안전화. */
export function clampRange(value: number, range: FxRange): number {
  if (!Number.isFinite(value)) return range.min;
  return Math.min(range.max, Math.max(range.min, value));
}

/** 부분 패치를 기존 설정에 병합하고 전 필드를 범위로 클램프. */
export function clampFx(
  patch: Partial<FxSettings>,
  base: FxSettings = DEFAULT_FX_SETTINGS,
): FxSettings {
  const merged = { ...base, ...patch };
  const out = {} as FxSettings;
  (Object.keys(FX_RANGES) as (keyof FxSettings)[]).forEach((key) => {
    out[key] = clampRange(merged[key], FX_RANGES[key]);
  });
  return out;
}

/**
 * 보라색 공 최대 지름(px). 단어 원 지름 대비 maxSizeRatio 배.
 * 비율이 1 을 넘으면 단어 원보다 커져 더 세게 밀어 올린다.
 */
export function maxCirclePx(bubblePx: number, ratio: number): number {
  const r = clampRange(ratio, FX_RANGES.maxSizeRatio);
  return Math.max(0, bubblePx) * r;
}

/**
 * [최소, 상한] 사이의 랜덤 목표 지름(px).
 * rnd 는 0~1 난수(테스트 시 주입). 상한은 maxCirclePx.
 */
export function randomTargetPx(bubblePx: number, ratio: number, rnd: number): number {
  const cap = maxCirclePx(bubblePx, ratio);
  const floor = Math.min(cap, Math.max(10, cap * 0.45));
  const t = Math.min(1, Math.max(0, Number.isFinite(rnd) ? rnd : 0));
  return floor + (cap - floor) * t;
}

/** easeOutCubic — 성장이 처음엔 빠르고 끝에서 느려지는 곡선. */
export function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  return 1 - Math.pow(1 - x, 3);
}

/**
 * 보라색 공의 현재 반지름(px). 성장(0→dur)·유지·수축 단계를 하나의 함수로 표현한다.
 * - phase 'grow'   : startR → targetR (easeOutCubic)
 * - phase 'shrink' : targetR → 0 (선형)
 * elapsedSec 가 durationSec 를 넘으면 targetR 로 고정(유지 단계).
 */
export function growthRadius(
  startR: number,
  targetR: number,
  elapsedSec: number,
  durationSec: number,
): number {
  const dur = Math.max(0.01, durationSec);
  const t = easeOutCubic(elapsedSec / dur);
  return startR + (targetR - startR) * t;
}

/**
 * 보라색 공 생성 지점(px). 필드 하단(쌓인 단어 무더기 영역)에서 좌우 랜덤으로 고른다.
 * rndX·rndY 는 0~1 난수(테스트 시 주입). 결과는 항상 필드 내부(마진 안).
 */
export function pickSpawnPoint(
  width: number,
  height: number,
  rndX: number,
  rndY: number,
  margin = 40,
): { x: number; y: number } {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
  const mx = Math.min(margin, w / 2);
  const x = mx + clamp01(rndX) * Math.max(0, w - mx * 2);
  // 하단 45%~88% 영역(무더기 속·아래에서 솟아오르며 밀어 올린다).
  const y = h * (0.45 + clamp01(rndY) * 0.43);
  return { x, y };
}

/** 원(중심 x·y, 반지름 r) — 겹침 판정·스폰 배치 공용 표현. */
export interface Circle {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/**
 * 두 원이 시각적으로 겹치는지(중심 거리 < 반지름 합 + pad).
 * pad 는 여유 간격(px) — 살짝 떨어뜨려 배치하고 싶을 때 양수.
 */
export function circlesOverlap(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
  pad = 0,
): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const rr = ar + br + pad;
  return dx * dx + dy * dy < rr * rr;
}

/**
 * 성장 중 다른 공과 겹치지 않도록 허용되는 최대 반지름(px).
 * 각 이웃 공에 대해 (중심거리 - 이웃반지름 - pad) 이하로 제한한다.
 * 이웃이 없으면 desired 를 그대로 반환. 음수는 0 으로 안전화.
 * (단어 원은 물리로 밀어 올리므로 여기 others 에 넣지 않는다 — 공끼리만 비중첩.)
 */
export function maxGrowRadius(
  x: number,
  y: number,
  desired: number,
  others: readonly Circle[],
  pad = 0,
): number {
  let cap = desired;
  for (const o of others) {
    const dx = x - o.x;
    const dy = y - o.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const allowed = dist - o.r - pad;
    if (allowed < cap) cap = allowed;
  }
  return Math.max(0, cap);
}

/**
 * 후보 지점들 중 기존 점유 원(occupied)과 겹치지 않는 첫 지점을 반환.
 * 모든 후보가 겹치면 null(→ 빈 공간 없음, 신규 스폰 중단 신호).
 * r 은 신규 공의 시작 반지름.
 */
export function firstFreeSpawn(
  candidates: readonly { x: number; y: number }[],
  r: number,
  occupied: readonly Circle[],
  pad = 0,
): { x: number; y: number } | null {
  for (const c of candidates) {
    let free = true;
    for (const o of occupied) {
      if (circlesOverlap(c.x, c.y, r, o.x, o.y, o.r, pad)) {
        free = false;
        break;
      }
    }
    if (free) return c;
  }
  return null;
}

/**
 * 모든 단어 바디가 정착했는지 — 전 속도(speed)가 임계값 이하.
 * 비어 있으면(측정 전) false 로 보수적 처리(스폰 대기).
 */
export function bodiesSettled(speeds: readonly number[], threshold: number): boolean {
  if (speeds.length === 0) return false;
  for (const s of speeds) {
    if (!(Math.abs(s) <= threshold)) return false;
  }
  return true;
}

/** 보라색 HSL 문자열. alpha < 1 이면 반투명. */
export function purpleColor(
  hue: number,
  opts: { sat?: number; light?: number; alpha?: number } = {},
): string {
  const h = clampRange(hue, FX_RANGES.hue);
  const sat = opts.sat ?? 68;
  const light = opts.light ?? 62;
  const alpha = opts.alpha ?? 1;
  return alpha >= 1 ? `hsl(${h} ${sat}% ${light}%)` : `hsl(${h} ${sat}% ${light}% / ${alpha})`;
}
