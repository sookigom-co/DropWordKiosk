/**
 * Step 1 대상 선택 화면 장식 효과(단어 원 낙하 + 보라색 신규 원 생성) 파라미터.
 *
 * 상단 로고 클릭으로 열리는 설정 패널에서 실시간 조절한다(SOO-1045).
 * 순수 값 로직만 이 파일에 두어 유닛 테스트 가능하게 하고,
 * React 렌더링/타이머는 컴포넌트 쪽에서 소비한다.
 */
export interface FxSettings {
  /** 단어 원 낙하 속도 배율(클수록 빠르게 떨어짐). */
  fallSpeed: number;
  /** 보라색 신규 원 생성 간격(ms, 작을수록 자주 생성). */
  spawnIntervalMs: number;
  /** 보라색 원 성장 지속 시간(s, 작을수록 빨리 커짐). */
  growDurationSec: number;
  /** 보라색 원 최대 크기(단어 원 지름 대비 비율, 상한 < 1). */
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
  fallSpeed: { min: 0.4, max: 2.5, step: 0.1 },
  spawnIntervalMs: { min: 150, max: 2000, step: 50 },
  growDurationSec: { min: 0.4, max: 4, step: 0.1 },
  // 상한을 1 미만으로 강제 → 보라색 원이 단어 원보다 커지지 않는다.
  maxSizeRatio: { min: 0.2, max: 0.95, step: 0.05 },
  hue: { min: 240, max: 300, step: 1 },
};

export const DEFAULT_FX_SETTINGS: FxSettings = {
  fallSpeed: 1,
  spawnIntervalMs: 650,
  growDurationSec: 1.6,
  maxSizeRatio: 0.8,
  hue: 262,
};

/** 값을 [min, max] 로 클램프. NaN/비유한 값은 min 으로 안전화. */
export function clampRange(value: number, range: FxRange): number {
  if (!Number.isFinite(value)) return range.min;
  return Math.min(range.max, Math.max(range.min, value));
}

/** 부분 패치를 기존 설정에 병합하고 전 필드를 범위로 클램프. */
export function clampFx(patch: Partial<FxSettings>, base: FxSettings = DEFAULT_FX_SETTINGS): FxSettings {
  const merged = { ...base, ...patch };
  const out = {} as FxSettings;
  (Object.keys(FX_RANGES) as (keyof FxSettings)[]).forEach((key) => {
    out[key] = clampRange(merged[key], FX_RANGES[key]);
  });
  return out;
}

/**
 * 보라색 원 최대 지름(px). 단어 원 지름 상한을 절대 넘지 않는다
 * (ratio 는 항상 1 미만으로 클램프되므로 결과 < bubblePx).
 */
export function maxCirclePx(bubblePx: number, ratio: number): number {
  const r = clampRange(ratio, FX_RANGES.maxSizeRatio);
  return Math.max(0, bubblePx) * r;
}

/**
 * [최소, 상한] 사이의 랜덤 목표 지름(px).
 * rnd 는 0~1 난수(테스트 시 주입). 상한은 단어 원 크기를 넘지 않는다.
 */
export function randomTargetPx(bubblePx: number, ratio: number, rnd: number): number {
  const cap = maxCirclePx(bubblePx, ratio);
  const floor = Math.min(cap, Math.max(10, cap * 0.35));
  const t = Math.min(1, Math.max(0, Number.isFinite(rnd) ? rnd : 0));
  return floor + (cap - floor) * t;
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
