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
  // 보더 요청(SOO-1049 후속): 최소 0.1s(=100ms)까지 빠르게 생성 허용.
  spawnIntervalMs: { min: 100, max: 5000, step: 100 },
  // 보더 요청: 최소 0.1s 까지 빠른 성장 허용.
  growDurationSec: { min: 0.1, max: 5, step: 0.1 },
  // 보라색 공은 단어 원을 밀어 올려야 하므로 단어 원보다 커질 수 있다(비율 > 1 허용).
  maxSizeRatio: { min: 0.3, max: 2.4, step: 0.05 },
  hue: { min: 240, max: 300, step: 1 },
};

/**
 * 기본 효과 설정. 보더 요청(SOO-1049 후속)에 맞춘 값:
 * - 생성 간격 0.1s(100ms) · 성장 시간 0.2s · 최대 크기 비율 100%(단어 원 지름과 동일).
 *   공 크기는 단어 원 지름의 50%(최소)~100%(최대) 사이에서 랜덤(보더 요청).
 */
export const DEFAULT_FX_SETTINGS: FxSettings = {
  gravity: 1,
  spawnIntervalMs: 100,
  growDurationSec: 0.2,
  maxSizeRatio: 1,
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
 * rnd 는 0~1 난수(테스트 시 주입). 상한은 maxCirclePx(=cap, 100%),
 * 최소는 cap 의 50%(보더 요청 SOO-1049 후속) — 즉 공은 최대 크기의 50%~100%.
 */
export function randomTargetPx(bubblePx: number, ratio: number, rnd: number): number {
  const cap = maxCirclePx(bubblePx, ratio);
  const floor = Math.min(cap, Math.max(10, cap * 0.5));
  const t = Math.min(1, Math.max(0, Number.isFinite(rnd) ? rnd : 0));
  return floor + (cap - floor) * t;
}

/**
 * 참조 단어 원 지름(px). Step1 물리 훅이 실제 DOM 원을 못 잴 때 쓰는 폴백 스케일이며,
 * Step2 낙하 도형이 "Step1 보라 원과 같은 스케일 대역"을 참조할 때도 이 값을 기준으로 삼는다.
 * (매직 넘버 중복 방지 — SOO-1054.)
 */
export const REFERENCE_BUBBLE_CAP_PX = 132;
export const REFERENCE_BUBBLE_WIDTH_RATIO = 0.2;

/** 화면 폭 기준 참조 단어 원 지름(px). 폭이 클수록 최대 REFERENCE_BUBBLE_CAP_PX 로 캡. */
export function referenceBubblePx(width: number): number {
  return Math.min(REFERENCE_BUBBLE_CAP_PX, Math.max(0, width) * REFERENCE_BUBBLE_WIDTH_RATIO);
}

/**
 * Step1 보라색 원과 동일한 스케일 대역에서 샘플링한 랜덤 반지름(px)(SOO-1054).
 * randomTargetPx(=보라 원 목표 지름: 참조 지름의 50%~100%)를 그대로 재사용해 지름을 얻고 /2.
 * ratio 기본값은 Step1 기본 설정(maxSizeRatio)과 동일 → 매직 넘버 중복 없이 같은 대역 보장.
 * rnd 는 0~1 난수(테스트 주입).
 */
export function purpleScaleRadius(
  bubblePx: number,
  rnd: number,
  ratio: number = DEFAULT_FX_SETTINGS.maxSizeRatio,
): number {
  return randomTargetPx(bubblePx, ratio, rnd) / 2;
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

/**
 * 필드 "전체"에서 스폰 지점을 고른다(보더 요청 SOO-1049 후속 "가득 채움").
 * 하단 밴드에 국한하지 않고 마진 안쪽 전 영역을 균일 커버해, 비중첩 패킹이
 * 화면 전체를 공으로 가득 채우도록 한다. rndX·rndY 는 0~1 난수(테스트 주입).
 */
export function pickSpawnPointFull(
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
  const my = Math.min(margin, h / 2);
  const x = mx + clamp01(rndX) * Math.max(0, w - mx * 2);
  const y = my + clamp01(rndY) * Math.max(0, h - my * 2);
  return { x, y };
}

/**
 * 필드의 세로 "밴드"(yLoRatio~yHiRatio, 높이 대비 0~1) 안에서 스폰 지점을 고른다.
 * 보더 요청 SOO-1049 후속 — 스폰 위치 우선순위(단어 사이 → 하단 → 상단)를 구현하기 위해
 * 하단 밴드·상단 밴드를 각각 별도 후보로 만들 때 사용한다. rndX·rndY 는 0~1 난수(테스트 주입).
 */
export function pickSpawnPointBand(
  width: number,
  height: number,
  rndX: number,
  rndY: number,
  yLoRatio: number,
  yHiRatio: number,
  margin = 40,
): { x: number; y: number } {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
  const lo = clamp01(yLoRatio);
  const hi = Math.max(lo, clamp01(yHiRatio));
  const mx = Math.min(margin, w / 2);
  const x = mx + clamp01(rndX) * Math.max(0, w - mx * 2);
  const y = h * (lo + clamp01(rndY) * (hi - lo));
  return { x, y };
}

/**
 * 정착한 단어 원들 "사이"에서 스폰 지점을 고른다(보더 요청 SOO-1049 후속).
 * 서로 다른 두 단어 원을 무작위로 골라 그 중점 부근(±jitter)을 반환한다 →
 * 공이 무더기 위가 아니라 단어들 사이에서 솟아오른다.
 * bodies 가 비면 null(→ pickSpawnPoint 폴백). 1개면 그 원 부근을 반환.
 * rndA·rndB 로 두 원을, jitterX·jitterY(0~1)로 중점 주변 흔들림을 결정(테스트 주입).
 */
export function spawnBetweenBodies(
  bodies: readonly { x: number; y: number }[],
  rndA: number,
  rndB: number,
  jitterX: number,
  jitterY: number,
  jitter = 24,
): { x: number; y: number } | null {
  const n = bodies.length;
  if (n === 0) return null;
  const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
  const pick = (r: number) => Math.min(n - 1, Math.floor(clamp01(r) * n));
  const jx = (clamp01(jitterX) - 0.5) * 2 * jitter;
  const jy = (clamp01(jitterY) - 0.5) * 2 * jitter;
  const i = pick(rndA);
  if (n === 1) {
    return { x: bodies[i].x + jx, y: bodies[i].y + jy };
  }
  let j = pick(rndB);
  if (j === i) j = (i + 1) % n;
  const a = bodies[i];
  const b = bodies[j];
  return { x: (a.x + b.x) / 2 + jx, y: (a.y + b.y) / 2 + jy };
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
 * 화면이 이 비율 이상 차면 신규 보라 공 생성을 멈춘다(SOO-1049 후속).
 * 이미 생성된 공은 유지(영속) — 스폰만 중단.
 * 보더 요청 변천: "2/3" → "4/5" → **"가득 채움"**(현재).
 * 1.0(=100%)로 두어 면적 상한이 조기 중단하지 않게 하고, 실질 상한은
 * 비중첩 패킹(빈 공간 소진)이 되도록 한다 — 즉 화면이 공으로 가득 찰 때까지 생성.
 * (비중첩 원들의 총 면적은 필드 면적을 넘을 수 없으므로 이 값은 안전한 상한 역할만.)
 */
export const FILL_STOP_RATIO = 1;

/**
 * 한 번의 스폰 틱에서 동시에 생성할 공 개수(3~5개 랜덤, 보더 요청 SOO-1049 후속).
 * rnd 는 0~1 난수(테스트 시 주입) — 1/3 미만이면 3개, 2/3 미만이면 4개, 이상이면 5개.
 */
export function burstCount(rnd: number): number {
  const t = Math.min(1, Math.max(0, Number.isFinite(rnd) ? rnd : 0));
  if (t < 1 / 3) return 3;
  if (t < 2 / 3) return 4;
  return 5;
}

/** 원들이 차지하는 총 면적(π·r² 합). 겹침은 무시(비중첩 배치 전제). */
export function circlesArea(circles: readonly Circle[]): number {
  let a = 0;
  for (const c of circles) {
    if (Number.isFinite(c.r) && c.r > 0) a += Math.PI * c.r * c.r;
  }
  return a;
}

/**
 * 점유 원들의 총 면적이 필드 면적의 threshold 비율 이상인지(스폰 중단 판정).
 * 겹침을 무시한 상한 근사라 실제보다 다소 크게 잡히지만, "가득 참" 판정에는 안전한 방향.
 */
export function areaFilled(
  occupied: readonly Circle[],
  fieldW: number,
  fieldH: number,
  threshold: number,
): boolean {
  const field = Math.max(1, Math.max(0, fieldW) * Math.max(0, fieldH));
  return circlesArea(occupied) >= field * threshold;
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
