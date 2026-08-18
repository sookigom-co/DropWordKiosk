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
 * - 생성 간격 0.1s(100ms) · 성장 시간 0.4s · 최대 크기 비율 100%(단어 원 지름과 동일).
 *   공 크기는 단어 원 지름의 50%(최소)~100%(최대) 사이에서 랜덤(보더 요청).
 * - 성장 시간 0.2s → 0.4s: 보더 요청(SOO-1112 후속)으로 **성장 속도를 50%로** 감속.
 *   (앞선 80% 감속 값 0.25s 를 이번에 원래 속도의 50%까지 추가로 낮춘 것 = 0.2s/0.5.)
 *   같은 목표 반지름을 2배 더 긴 시간에 걸쳐 키우면 틱당 반경 증가(=이웃 침투)가 줄어
 *   충돌 해소 충격량이 작아져 버블이 덜 튕겨 나간다.
 */
export const DEFAULT_FX_SETTINGS: FxSettings = {
  gravity: 1,
  spawnIntervalMs: 100,
  growDurationSec: 0.4,
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

/**
 * 보라 버블 하단 스폰 지점(SOO-1057).
 * 스테이지 바닥선 근처(하단)에서 x 는 마진 안 좌우 랜덤으로 고르고, y 는 바닥
 * 바로 위(반지름만큼 안쪽)에 둔다 → 버블이 "아래에서" 생성돼 부력으로 떠오른다.
 * 기존 "빈 공간 3티어 스폰"(pickSpawnPointBand/spawnBetweenBodies)을 대체한다.
 * rndX 는 0~1 난수(테스트 시 주입). 결과 x 는 항상 마진 안.
 */
export function bottomSpawnPoint(
  width: number,
  height: number,
  rndX: number,
  startR: number,
  margin = 40,
): { x: number; y: number } {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
  const mx = Math.min(margin, w / 2);
  const x = mx + clamp01(rndX) * Math.max(0, w - mx * 2);
  // 바닥선(y=height) 바로 위 — 반지름만큼 안쪽에 두어 바닥을 뚫지 않게.
  const r = Math.max(0, Number.isFinite(startR) ? startR : 0);
  const y = Math.max(0, h - r - 1);
  return { x, y };
}

/**
 * 보라 버블 상단 스폰 지점(SOO-1059).
 * `bottomSpawnPoint` 의 상하 대칭 — 스테이지 천장선(y=0) 바로 아래(반지름만큼 안쪽)에서
 * x 는 마진 안 좌우 랜덤으로 고른다 → 버블이 "위에서" 생성돼 (감쇠된) 중력으로 내려온다.
 * 하단 스폰(부력 상승)과 짝을 이뤄 스폰을 이원화(절반 상단·절반 하단)한다.
 * rndX 는 0~1 난수(테스트 시 주입). 결과 x 는 항상 마진 안, y 는 항상 필드 안(>=0).
 */
export function topSpawnPoint(
  width: number,
  height: number,
  rndX: number,
  startR: number,
  margin = 40,
): { x: number; y: number } {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
  const mx = Math.min(margin, w / 2);
  const x = mx + clamp01(rndX) * Math.max(0, w - mx * 2);
  // 천장선(y=0) 바로 아래 — 반지름만큼 안쪽에 두어 천장을 뚫지 않게. 필드 안으로 클램프.
  const r = Math.max(0, Number.isFinite(startR) ? startR : 0);
  const y = Math.min(h, r + 1);
  return { x, y };
}

/**
 * 보라 버블 가운데 스폰 지점(SOO-1088).
 * 스테이지 세로 중앙 밴드(`midLo`~`midHi`, 높이 대비 0~1) 안에서 x·y 를 좌우/상하 랜덤으로
 * 고른다. 하단/상단 스폰과 짝을 이뤄 스폰을 3등분(하·상·중)한다.
 * 가운데 버블은 중립 부력으로 대략 제자리에 떠 있다가 사행하므로, 이 밴드 안에서 태어나면
 * 자연스럽게 "화면 가운데에 떠 있는" 거동을 보인다. 결과 x·y 는 항상 반지름만큼 경계 안쪽.
 * rndX·rndY 는 0~1 난수(테스트 시 주입).
 */
export function midSpawnPoint(
  width: number,
  height: number,
  rndX: number,
  rndY: number,
  startR: number,
  margin = 40,
  midLo = 0.4,
  midHi = 0.6,
): { x: number; y: number } {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
  const r = Math.max(0, Number.isFinite(startR) ? startR : 0);
  const mx = Math.min(margin, w / 2);
  const x = mx + clamp01(rndX) * Math.max(0, w - mx * 2);
  const lo = clamp01(midLo);
  const hi = Math.max(lo, clamp01(midHi));
  const yRaw = h * (lo + clamp01(rndY) * (hi - lo));
  // 반지름만큼 상·하 경계 안쪽으로 클램프(경계 관통 방지).
  const yLo = Math.min(r, h / 2);
  const yHi = Math.max(yLo, h - r);
  const y = Math.min(yHi, Math.max(yLo, yRaw));
  return { x, y };
}

/** 보라 버블 스폰 구역(SOO-1088) — 세로 3등분. */
export type SpawnZone = 'bottom' | 'top' | 'middle';

/** 성공 스폰마다 순환하는 3등분 구역 순서(하 → 상 → 중). */
const SPAWN_ZONE_CYCLE: readonly SpawnZone[] = ['bottom', 'top', 'middle'];

/**
 * 스폰 카운터 → 스폰 구역(SOO-1088).
 * 성공 스폰마다 1 씩 증가하는 카운터를 하 → 상 → 중 순서로 라운드로빈 매핑해,
 * 장시간 구동 시 세 구역이 대략 1/3 씩 균등하게 채워지도록 한다(결정적, 랜덤 없음).
 * 음수·비유한 입력은 0(=하단)으로 안전화.
 */
export function spawnZoneFor(counter: number): SpawnZone {
  const n = Number.isFinite(counter) ? Math.floor(counter) : 0;
  const i = ((n % SPAWN_ZONE_CYCLE.length) + SPAWN_ZONE_CYCLE.length) % SPAWN_ZONE_CYCLE.length;
  return SPAWN_ZONE_CYCLE[i];
}

/**
 * 보라 버블 "완전 랜덤" 스폰 지점(SOO-1088 후속, 보더 요청).
 * 3등분(하·상·중) 라운드로빈·밴드 국한을 폐기하고 스테이지 전 영역에서 균일 난수로 한 점을
 * 고른다 → 화면 곳곳에 무작위로 태어나는 인상을 준다.
 * 반지름 startR 과 margin 을 함께 고려해 어떤 원도 경계를 벗어나지 않는 안쪽 [lo, hi] 로
 * 클램프하므로 화면 이탈 절대 금지 invariant 를 스폰 단계에서 이미 보장한다.
 * (margin 보다 반지름이 크면 반지름이 우선 — 큰 원도 항상 안쪽에서 태어난다.)
 * rndX·rndY 는 0~1 난수(테스트 주입). 결과 x·y 는 항상 반지름/마진만큼 경계 안쪽.
 */
export function randomSpawnPoint(
  width: number,
  height: number,
  rndX: number,
  rndY: number,
  startR: number,
  margin = 40,
): { x: number; y: number } {
  const w = Number.isFinite(width) ? Math.max(0, width) : 0;
  const h = Number.isFinite(height) ? Math.max(0, height) : 0;
  const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
  const r = Math.max(0, Number.isFinite(startR) ? startR : 0);
  const m = Math.max(0, Number.isFinite(margin) ? margin : 0);
  const inset = Math.max(r, m);
  const axis = (rnd: number, size: number): number => {
    const lo = Math.min(inset, size / 2);
    const hi = Math.max(lo, size - inset);
    return lo + clamp01(rnd) * (hi - lo);
  };
  return { x: axis(rndX, w), y: axis(rndY, h) };
}

/**
 * 완전 랜덤 스폰 버블의 거동(부력 구역)을 난수로 고른다(SOO-1088 후속, 보더 요청).
 * 위치가 전 영역 랜덤이므로 거동도 상승(bottom)·하강(top)·제자리부유(middle) 중 균등 난수로
 * 골라, 화면 전체에 다양한 움직임의 버블이 무작위로 태어나게 한다. 세 구역 확률은 각 1/3.
 * rnd 는 0~1 난수(테스트 주입). 비유한·범위 밖 입력은 0~1 로 안전화.
 */
export function randomSpawnZone(rnd: number): SpawnZone {
  const t = Math.min(1, Math.max(0, Number.isFinite(rnd) ? rnd : 0));
  if (t < 1 / 3) return 'bottom';
  if (t < 2 / 3) return 'top';
  return 'middle';
}

/** 스테이지 경계 클램프 결과(SOO-1088). 각 축이 실제로 클램프됐는지 함께 반환. */
export interface StageClamp {
  readonly x: number;
  readonly y: number;
  readonly clampedX: boolean;
  readonly clampedY: boolean;
}

/**
 * 바디 중심(cx·cy)을 스테이지(0..width, 0..height) 안으로 클램프(SOO-1088 최후 방어선).
 * 반지름 r 을 고려해 어떤 원도 경계를 벗어나지 않도록 중심을 [r, size−r] 로 제한한다.
 * 벽/솔버가 놓친 터널링·고속 탈출을 매 틱 위치 보정으로 확정 차단한다.
 *
 * `opts.top === false` 면 상단(y 음수 방향) 경계는 클램프하지 않는다 — 위에서 떨어져
 * 들어오는(낙하 진입) 단어 원이 화면 위(y<0)에서 대기·낙하하는 것을 막지 않기 위함.
 * 하단·좌·우 경계는 항상 강제한다.
 * 크기가 지름보다 작은(r>size/2) 극단 케이스는 중심(size/2)으로 모은다.
 */
export function clampToStage(
  cx: number,
  cy: number,
  r: number,
  width: number,
  height: number,
  opts: { top?: boolean } = {},
): StageClamp {
  const enforceTop = opts.top !== false;
  const rr = Math.max(0, Number.isFinite(r) ? r : 0);
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const axis = (v: number, size: number, low: boolean, high: boolean): number => {
    const val = Number.isFinite(v) ? v : rr;
    const loBound = Math.min(rr, size / 2);
    const hiBound = Math.max(loBound, size - rr);
    let out = val;
    if (low) out = Math.max(loBound, out);
    if (high) out = Math.min(hiBound, out);
    return out;
  };
  const x = axis(cx, w, true, true);
  const y = axis(cy, h, enforceTop, true);
  return { x, y, clampedX: x !== cx, clampedY: y !== cy };
}

/**
 * 사각형(낱말 상자) 중심을 스테이지(0..width, 0..height) 안으로 클램프(SOO-1110).
 *
 * `clampToStage`(원 전용, 단일 반지름 r)의 사각형 버전 — x 는 반폭(halfW), y 는 반높이(halfH)를
 * 각각 인셋으로 써서 상자의 어느 모서리도 경계를 넘지 않도록 중심을 [half, size−half] 로 제한한다.
 * Step3 낱말 상자는 `makeBoxBody`(inertia=∞, angle 0 고정)라 반폭·반높이가 상수 → 회전 보정 불필요.
 *
 * `opts.top === false` 면 상단(y<0) 경계는 강제하지 않아, 위에서 떨어져 들어오는 낙하 진입 상자를
 * 막지 않는다(하단·좌·우는 항상 강제). Step1 `clampToStage` 와 동형 규약.
 */
export function clampBoxToStage(
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  width: number,
  height: number,
  opts: { top?: boolean } = {},
): StageClamp {
  const enforceTop = opts.top !== false;
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const hw = Math.max(0, Number.isFinite(halfW) ? halfW : 0);
  const hh = Math.max(0, Number.isFinite(halfH) ? halfH : 0);
  const axis = (v: number, size: number, inset: number, low: boolean, high: boolean): number => {
    const val = Number.isFinite(v) ? v : inset;
    const lo = Math.min(inset, size / 2);
    const hi = Math.max(lo, size - inset);
    let out = val;
    if (low) out = Math.max(lo, out);
    if (high) out = Math.min(hi, out);
    return out;
  };
  const x = axis(cx, w, hw, true, true);
  const y = axis(cy, h, hh, enforceTop, true);
  return { x, y, clampedX: x !== cx, clampedY: y !== cy };
}

/**
 * 결정적 의사난수 생성기(mulberry32, SOO-1110).
 * 32비트 시드로 초기화되는 순수 함수형 PRNG — 호출마다 0(포함)~1(미포함) 난수를 반환한다.
 * `Math.random()` 을 컴포넌트 마운트 시 한 번 써 시드를 뽑고, 실제 난수열은 이 시드 기반으로
 * 재생하면 "세션마다 랜덤 + 한 마운트 내에서는 결정적"이라 테스트·디버깅이 가능하다.
 */
export function mulberry32(seed: number): () => number {
  let a = (Number.isFinite(seed) ? Math.floor(seed) : 0) >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * [0, count) 인덱스의 랜덤 순열(Fisher-Yates, SOO-1110).
 * rng 는 0~1 난수 공급 함수(테스트 시 결정적 PRNG 주입). 결과는 0..count-1 을 한 번씩 담은 배열.
 * Step3 낙하 순서(어느 상자가 먼저/위에서 떨어질지)를 무작위화하는 데 쓴다.
 */
export function shuffleIndices(count: number, rng: () => number): number[] {
  const n = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(i);
  for (let i = n - 1; i > 0; i--) {
    const r = rng();
    const j = Math.floor((Number.isFinite(r) ? Math.min(0.9999999, Math.max(0, r)) : 0) * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * 폭 안에서 상자(반폭 halfW)가 경계를 넘지 않는 랜덤 중심 x(SOO-1110).
 * 인셋 = max(halfW, margin) 로 좌우 여백과 상자 반폭을 함께 고려해 [inset, width−inset] 사이에서
 * rnd(0~1)로 균일 샘플링한다 → 낙하 x 위치를 무작위화하되 화면 이탈은 스폰 단계에서 이미 차단.
 * rnd 는 0~1 난수(테스트 시 주입). width 가 좁으면 중앙으로 모은다.
 */
export function randomBoxX(rnd: number, width: number, halfW: number, margin = 40): number {
  const w = Math.max(0, Number.isFinite(width) ? width : 0);
  const hw = Math.max(0, Number.isFinite(halfW) ? halfW : 0);
  const m = Math.max(0, Number.isFinite(margin) ? margin : 0);
  const inset = Math.max(hw, m);
  const lo = Math.min(inset, w / 2);
  const hi = Math.max(lo, w - inset);
  const t = Math.min(1, Math.max(0, Number.isFinite(rnd) ? rnd : 0));
  return lo + t * (hi - lo);
}

/** 회전각 클램프 결과(SOO-1092). 각도·각속도 보정값과 실제 클램프 여부를 함께 반환. */
export interface AngleClamp {
  readonly angle: number;
  readonly angularVelocity: number;
  readonly clamped: boolean;
}

/**
 * 바디 회전각을 [-limit, +limit] 안으로 클램프(SOO-1092).
 *
 * matter-js 강체가 낙하·충돌·구름 과정에서 문자(단어)가 limit(기본 ±45°) 이상 기울지
 * 않도록, 매 틱 stepEngine 이후 각도를 경계로 되돌린다. 이때 "바깥으로 미는" 각속도만
 * 0 으로 눌러(경계에 붙어 계속 밀어붙이지 못하게) 하고, 안쪽(0 을 향해 회복)으로 도는
 * 각속도는 그대로 살려 급격한 스냅 없이 자연스럽게 경계에서 되돌아오게 한다.
 * (clampToStage 위치 클램프와 동형 패턴 — 위치 대신 각도, 속도 대신 각속도.)
 *
 * limit 이내면 각도·각속도를 그대로 통과(clamped=false)시켜 기존 물리 거동(작은 기울임·
 * 흔들림)은 체감상 그대로 유지된다. 비유한 입력은 0 으로 안전화.
 */
export function clampAngle(angle: number, angularVelocity: number, limit: number): AngleClamp {
  const a = Number.isFinite(angle) ? angle : 0;
  const av = Number.isFinite(angularVelocity) ? angularVelocity : 0;
  const lim = Math.abs(Number.isFinite(limit) ? limit : 0);
  // +경계 초과: 각도를 +lim 으로, 바깥(양수=계속 +방향)으로 미는 각속도만 제거.
  if (a > lim) return { angle: lim, angularVelocity: Math.min(0, av), clamped: true };
  // −경계 초과: 각도를 −lim 으로, 바깥(음수=계속 −방향)으로 미는 각속도만 제거.
  if (a < -lim) return { angle: -lim, angularVelocity: Math.max(0, av), clamped: true };
  return { angle: a, angularVelocity: av, clamped: false };
}

/**
 * 부력(위로 뜨는 힘, SOO-1057) — matter 가 매 스텝 body.force.y 에 더하는 중력
 * (mass·gravityY·gravityScale)을 factor 배로 되갚아 상쇄·역전한다.
 * 반환값(음수)을 body.force.y 에 더한 뒤 matter 가 중력을 더하면 최종
 * force.y = mass·g·scale·(1 − factor) → factor>1 이면 위(matter 는 위가 음수 y)로
 * 순힘이 생겨 떠오른다. 가속도 = force/mass = g·scale·(1−factor) 로 질량(크기)과
 * 무관 → 크고 작은 버블이 같은 속도로 떠오른다.
 */
export function buoyancyForce(
  mass: number,
  gravityY: number,
  gravityScale: number,
  factor: number,
): number {
  const m = Number.isFinite(mass) ? mass : 0;
  const g = Number.isFinite(gravityY) ? gravityY : 0;
  const s = Number.isFinite(gravityScale) ? gravityScale : 0;
  const f = Number.isFinite(factor) ? factor : 0;
  return -m * g * s * f;
}

/**
 * 좌우 흔들림 힘(풍선/기포 느낌, SOO-1057) — 위상(phase)에 따른 사인 힘.
 * mass 에 비례시켜 흔들림 가속도(=force/mass=amplitude·sin)가 크기와 무관하게
 * 균일하게 보이도록 한다. phase 는 시간·시드 기반(런타임 주입), amplitude 는 세기.
 */
export function swayForce(mass: number, phase: number, amplitude: number): number {
  const m = Number.isFinite(mass) ? mass : 0;
  const a = Number.isFinite(amplitude) ? amplitude : 0;
  const p = Number.isFinite(phase) ? phase : 0;
  return m * a * Math.sin(p);
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
 * 하단 밴드에서 시작 반지름 기준 비겹침 스폰 자리(SOO-1112 재수정, 보더 피드백).
 *
 * 보더 피드백("겹치지 않는으로 계산하니까 위에만 생성되잖아 … 기본적으로 밀어올려야 해"):
 * 버블은 화면 위쪽 빈 공간이 아니라 **아래(단어 무더기)에서 태어나 위로 밀어 올려야** 한다.
 * 그래서 스폰 후보를 하단 밴드(`bottomSpawnPoint`)로만 만들고, 시작 반지름(작음)+pad 가
 * **기존 버블**과 겹치지 않는 첫 자리를 고른다. 단어는 "밀어 올릴 대상"이라 겹침 검사에서
 * 제외하고(호출부가 `bubbles` 에 버블만 넘김) `upwardPushTargets` 로 따로 사전에 밀어올린다.
 * 모든 후보가 기존 버블과 겹치면 null → 이번 틱 스폰 보류(겹친 채 생성 금지, 버블 영속).
 * rnds 는 후보 x 를 정할 0~1 난수 목록(테스트 주입) — 길이가 후보 시도 횟수.
 */
export function bottomFreeSpawn(
  width: number,
  height: number,
  startR: number,
  bubbles: readonly Circle[],
  rnds: readonly number[],
  pad = 0,
  margin = 40,
): { x: number; y: number } | null {
  const candidates = rnds.map((r) => bottomSpawnPoint(width, height, r, startR, margin));
  return firstFreeSpawn(candidates, startR, bubbles, pad);
}

/**
 * 스테이지 전 영역에서 비겹침 스폰 자리(SOO-1112 재재수정, 보더 피드백).
 *
 * 보더 피드백("버블 생성은 다시 랜덤으로 부탁해, 아래에서만 올라오면 의미가 없어"):
 * 하단 밴드 국한(`bottomFreeSpawn`)을 폐기하고, `randomSpawnPoint` 로 스테이지 곳곳에 균일
 * 난수로 후보를 뿌린 뒤 **기존 버블**과 겹치지 않는 첫 자리를 고른다 → 버블이 화면 어디서든
 * 무작위로 태어난다(SOO-1088 완전 랜덤 스폰 분포 복원). 단어는 겹침 검사에서 제외하고
 * (호출부가 `bubbles` 에 버블만 넘김) `upwardPushTargets` 로 태어나는 순간 위로 사전에
 * 밀어올린다 — "버블이 단어를 밀어 올린다" invariant 유지(스폰 위치가 랜덤이어도 성립).
 * 모든 후보가 기존 버블과 겹치면 null → 이번 틱 스폰 보류(겹친 채 생성 금지, 버블 영속).
 * rndPairs 는 후보 (x, y) 를 정할 [0~1, 0~1] 난수쌍 목록(테스트 주입) — 길이가 후보 시도 횟수.
 */
export function randomFreeSpawn(
  width: number,
  height: number,
  startR: number,
  bubbles: readonly Circle[],
  rndPairs: readonly (readonly [number, number])[],
  pad = 0,
  margin = 40,
): { x: number; y: number } | null {
  const candidates = rndPairs.map(([rx, ry]) =>
    randomSpawnPoint(width, height, rx, ry, startR, margin),
  );
  return firstFreeSpawn(candidates, startR, bubbles, pad);
}

/**
 * 신규 버블 자리를 비우도록 겹치는 단어를 "위로" 밀어올린 목표 y 를 사전 계산(SOO-1112 재수정).
 *
 * 보더 피드백("밀어올리는 것까지 사전에 계산해서 진행하라"): 버블이 겹친 채 태어나 물리 솔버가
 * 부르르 떨며 밀어내는 대신, 스폰 순간 겹치는 단어를 필요한 만큼 위로 이동시켜 겹침을 즉시
 * 해소한다(= 밀어올림의 사전 계산). `bubble.r` 에 **버블의 목표(성장 후) 반지름**을 넣으면
 * 다 자란 뒤에도 겹치지 않도록 자리를 미리 비운다.
 *
 * 각 단어는 버블 중심 기준으로 **위쪽으로만**(y 감소) 이동한다. 두 원이 (r합+pad) 만큼 떨어지는
 * 최소 수직 거리까지 올리되, 수평으로 이미 벗어난 단어(|dx| ≥ r합+pad)·현재 겹치지 않는 단어·
 * 이미 그보다 위에 있는 단어는 건드리지 않는다(아래로는 절대 내리지 않는다). 반환은 이동이
 * 필요한 단어만 { index, y }(입력 순서).
 */
export function upwardPushTargets(
  bubble: Circle,
  words: readonly Circle[],
  pad = 0,
): { index: number; y: number }[] {
  const out: { index: number; y: number }[] = [];
  const R = Math.max(0, Number.isFinite(bubble.r) ? bubble.r : 0);
  const bx = Number.isFinite(bubble.x) ? bubble.x : 0;
  const by = Number.isFinite(bubble.y) ? bubble.y : 0;
  const p = Math.max(0, Number.isFinite(pad) ? pad : 0);
  for (let i = 0; i < words.length; i++) {
    const wch = words[i];
    const wr = Math.max(0, Number.isFinite(wch.r) ? wch.r : 0);
    const need = R + wr + p;
    const wx = Number.isFinite(wch.x) ? wch.x : 0;
    const wy = Number.isFinite(wch.y) ? wch.y : 0;
    const dx = wx - bx;
    if (Math.abs(dx) >= need) continue; // 수평으로 이미 벗어남 → 이동 불필요
    const dy = wy - by;
    if (dx * dx + dy * dy >= need * need) continue; // 현재 겹치지 않음 → 이동 불필요
    const targetY = by - Math.sqrt(need * need - dx * dx); // 버블 위쪽으로 need 만큼 떨어진 y
    if (wy <= targetY) continue; // 이미 그보다 위 → 아래로 내리지 않는다
    out.push({ index: i, y: targetY });
  }
  return out;
}

/**
 * 화면이 이 비율 이상 차면 신규 보라 공 생성을 멈춘다(SOO-1049 후속).
 * 이미 생성된 공은 유지(영속) — 스폰만 중단.
 * 보더 요청 변천: "2/3" → "4/5" → "가득 채움(1.0)" → "0.9(90%)" → "0.6(60%)" → **"0.8(80%)"**(현재, SOO-1112).
 *
 * 밀도 트레이드오프(겹침 0 ↔ 빽빽한 채움):
 * 이 값은 "원 면적의 합 ÷ 필드 면적"의 상한이다. 원(圓)은 아무리 잘 배치해도 서로
 * 겹치지 않고는 면적의 ~90%(완벽 육각 패킹의 이론값)를 넘길 수 없다. 90% 를 목표로 두면
 * 버블 겹침이 기하학적으로 불가피해 60% 까지 낮췄으나(화면이 다소 비어 보임), 보더가
 * 다시 "80% 로 올려 달라" 요청(SOO-1112 최신). 80% 는 이론 상한(~90%) 아래이면서 화면을
 * 더 빽빽하게 채운다. 스폰은 여전히 `firstFreeSpawn` 기준 비중첩 자리에서만 이뤄지므로
 * 스폰 순간 겹침은 없고, 채움만 늘어난다(자유 공간이 없으면 그 틱은 보류).
 */
export const FILL_STOP_RATIO = 0.8;

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

/**
 * Step2 낙하 릴리즈 슬롯 배정(SOO-1054 후속 — 카드·원 균등 교차 낙하).
 *
 * 카드와 원을 개수가 달라도 하나의 릴리즈 순서 위에 균등하게 흩뿌린다.
 * 반환값은 각 원(circle)에 배정된 릴리즈 슬롯 인덱스이며, 나머지 슬롯은
 * 카드가 채운다. 슬롯이 클수록 위쪽(더 늦게 진입)에 배치된다.
 *
 * 예) 카드 21 · 원 12 → 총 33 슬롯. 원은 (j+0.5)*33/12 로 균등 분포되어
 * 처음부터 끝까지 카드 사이사이에 섞인다(원이 먼저 뭉쳐 떨어지지 않음).
 *
 * @param cardCount   카드 개수
 * @param circleCount 원 개수
 * @returns 길이 circleCount 의 슬롯 인덱스 배열(오름차순, 0..total-1, 중복 없음)
 */
export function interleavedReleaseSlots(cardCount: number, circleCount: number): number[] {
  if (circleCount <= 0) return [];
  const total = cardCount + circleCount;
  const used = new Set<number>();
  const slots: number[] = [];
  for (let j = 0; j < circleCount; j++) {
    // 원 j 의 이상적 위치를 균등 분포로 잡고, 이미 쓴 슬롯이면 다음 빈 슬롯으로 밀어낸다.
    let s = Math.min(total - 1, Math.floor(((j + 0.5) * total) / circleCount));
    while (used.has(s) && s < total - 1) s++;
    while (used.has(s) && s > 0) s--;
    used.add(s);
    slots.push(s);
  }
  return slots.sort((a, b) => a - b);
}

/**
 * 균형 적재용 결정적 x-레인 중심 좌표(SOO-1063).
 * 폭을 laneCount 개의 균등한 세로 레인으로 나눠 각 레인의 중심 x(px)를 반환한다.
 * 좌우 대칭(가장 바깥 레인은 마진 안쪽 끝, 가운데 레인은 화면 중앙)이라
 * 레인에 순서대로 떨어뜨리면 좌우로 치우치지 않고 고르게 쌓인다.
 * laneCount<=1 이면 화면 중앙 한 곳만 반환.
 */
export function laneCenters(width: number, laneCount: number, margin = 40): number[] {
  const w = Math.max(0, width);
  const n = Math.max(1, Math.floor(Number.isFinite(laneCount) ? laneCount : 1));
  const mx = Math.min(margin, w / 2);
  if (n === 1) return [w / 2];
  const usable = Math.max(0, w - mx * 2);
  const step = usable / (n - 1);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(mx + step * i);
  return out;
}

/**
 * 레인 채움 순서 — 가운데 레인부터 바깥으로 좌우 교대(SOO-1063).
 * 예) 5 → [2,3,1,4,0], 4 → [1,2,0,3]. 이 순서로 라운드로빈 배정하면 낙하가
 * 진행되는 동안 좌우가 번갈아 채워져 한쪽 쏠림이 생기지 않고, 가운데가 살짝 먼저·많이
 * 채워져 자연스러운 피라미드형 무더기가 된다. 랜덤을 쓰지 않는 결정적 순서.
 */
export function centerOutLaneOrder(laneCount: number): number[] {
  const n = Math.max(0, Math.floor(Number.isFinite(laneCount) ? laneCount : 0));
  if (n <= 0) return [];
  const order: number[] = [];
  const mid = Math.floor((n - 1) / 2);
  order.push(mid);
  for (let d = 1; order.length < n; d++) {
    const r = mid + d;
    const l = mid - d;
    if (r < n) order.push(r);
    if (l >= 0) order.push(l);
  }
  return order;
}

/**
 * 폭·아이템 폭 기준 권장 레인 수(SOO-1063).
 * 아이템이 대략 나란히 설 수 있는 레인 수를 [min, max] 로 클램프해 반환한다.
 */
export function laneCountForWidth(
  width: number,
  itemW: number,
  margin = 40,
  min = 3,
  max = 7,
): number {
  const usable = Math.max(1, Math.max(0, width) - margin * 2);
  const iw = Math.max(1, Number.isFinite(itemW) ? itemW : 1);
  const n = Math.floor(usable / iw);
  return Math.min(max, Math.max(min, n));
}

/**
 * slot(방출 순서 인덱스) → 결정적 균형 x 중심(px)(SOO-1063).
 * 레인을 가운데-바깥 순서(centerOutLaneOrder)로 라운드로빈 배정해, 카드·장식이
 * 낙하하는 동안 좌우가 고르게 채워지도록 한다. 같은 레인에 배정된 아이템은 같은 x 로
 * 떨어져 세로로 차곡차곡 쌓인다. 랜덤 없이 slot 만으로 결정 → 반복 실행에도 동일 배치.
 */
export function balancedLaneX(slot: number, width: number, laneCount: number, margin = 40): number {
  const centers = laneCenters(width, laneCount, margin);
  const order = centerOutLaneOrder(centers.length);
  if (order.length === 0) return Math.max(0, width) / 2;
  const s = Number.isFinite(slot) ? Math.max(0, Math.floor(slot)) : 0;
  return centers[order[s % order.length]];
}

/**
 * 벽돌쌓기 격자 좌표(SOO-1063 재수정).
 * 카드 index(0..)를 **아래 행부터 좌우로** 채운다. 한 행이 cols 칸을 다 채우면 다음(위) 행으로.
 * - 행 내부는 가운데-바깥(centerOutLaneOrder) 순서로 배치 → 부분만 찬 맨 위 행이 가운데로 모여
 *   "가운데가 약간 높은 낮고 넓은 피라미드"가 된다.
 * - 홀수 행은 반 칸(cellW/2) 오른쪽 오프셋 → 벽돌 어긋쌓기(위 카드가 아래 두 카드 사이에 얹힘).
 *
 * 레인 중심 고정(balancedLaneX)과 달리 같은 열이라도 **행마다 x 가 반 칸씩 어긋나** 세로 타워가
 * 생기지 않는다. 랜덤 없이 index·cols·width 만으로 결정 → 반복 실행에도 동일 배치.
 * 반환 x 는 [margin, width-margin] 로 클램프(호출부에서 아이템 반폭으로 추가 클램프).
 */
export function brickStackX(index: number, cols: number, width: number, margin = 40): number {
  const w = Math.max(0, width);
  const c = Math.max(1, Math.floor(Number.isFinite(cols) ? cols : 1));
  const i = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  const mx = Math.min(margin, w / 2);
  const usable = Math.max(1, w - mx * 2);
  const cellW = usable / c;
  const row = Math.floor(i / c);
  const fillCol = i % c;
  const order = centerOutLaneOrder(c);
  const visCol = order[fillCol % order.length];
  const brick = row % 2 === 1 ? cellW / 2 : 0;
  const x = mx + cellW * (visCol + 0.5) + brick;
  return Math.min(w - mx, Math.max(mx, x));
}

/**
 * 장식(보라 사각형) 전용 균등 분산 x(SOO-1063 재수정).
 * count 개를 화면 폭에 **고르게** 흩뿌린다(index 마다 서로 다른 x) — 카드 레인과 슬롯을 공유하지
 * 않으므로 세로 보라 기둥이 생기지 않는다. 결정적(랜덤 없음).
 */
export function spreadX(index: number, count: number, width: number, margin = 40): number {
  const w = Math.max(0, width);
  const n = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1));
  const i = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  const mx = Math.min(margin, w / 2);
  const usable = Math.max(1, w - mx * 2);
  return mx + usable * ((i + 0.5) / n);
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
