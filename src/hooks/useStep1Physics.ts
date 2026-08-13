import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createStep1World,
  makeWordBody,
  makeBubbleBody,
  addBody,
  addCeiling,
  setCircleRadius,
  stepEngine,
  bodyCenter,
  type Step1World,
} from '../lib/physics';
import {
  areaFilled,
  bodiesSettled,
  bottomSpawnPoint,
  buoyancyForce,
  burstCount,
  easeOutCubic,
  FILL_STOP_RATIO,
  firstFreeSpawn,
  growthRadius,
  purpleColor,
  randomTargetPx,
  referenceBubblePx,
  swayForce,
  type Circle,
  type FxSettings,
} from '../lib/fx';
import type { WordItem } from '../data/words';

/** 렌더할 보라색 버블(React 상태 — 생성/제거 시에만 변경, 위치·크기는 명령형). */
export interface PurpleView {
  id: number;
  color: string;
}

/**
 * 세션 동안 유지되는 보라색 버블 상한(성능 안전판).
 * 버블은 소멸하지 않으므로(SOO-1049) 비중첩 스폰·물리 충돌이 실질 상한을 만들지만,
 * 라즈베리파이 부하 폭주를 막기 위한 하드 캡을 둔다.
 */
const MAX_PURPLE = 160;
/** 단어 원 낙하 시작 간격(ms) — 우수수 떨어지는 스태거. */
const RELEASE_STAGGER = 110;
/** 보라 버블 시작 반지름(px) — 하단에서 작게 태어나 상승하며 목표 크기로 성장. */
const PURPLE_START_R = 6;
/**
 * 하단 스폰 후보 시도 횟수(SOO-1057) — 이 횟수 안에 바닥선에서 다른 버블과
 * 겹치지 않는 자리를 못 찾으면 이번 스폰을 건너뛴다(기존 버블은 유지 — 영속).
 */
const SPAWN_TRIES = 24;
/** 스폰 시 기존 버블과 유지할 최소 여유 간격(px). */
const SPAWN_PAD = 3;
/** 정착 판정 속도 임계값(matter speed). 이 이하가 유지되면 멈춘 것으로 본다. */
const SETTLE_SPEED = 0.4;
/** 정착 유지 시간(ms) — 임계 이하가 이만큼 지속돼야 낙하 완료로 확정. */
const SETTLE_HOLD_MS = 450;
/**
 * 부력 배율(SOO-1057) — matter 중력의 몇 배 힘을 위로 실을지. 1 초과면 순힘이
 * 위를 향해 버블이 떠오른다(가속도 = g·scale·(factor−1), 질량 무관).
 */
const BUOYANCY_FACTOR = 1.7;
/** 좌우 흔들림 세기(가속도 진폭) — 풍선/기포 느낌의 자연스러운 사행. */
const SWAY_AMPLITUDE = 0.0006;
/** 좌우 흔들림 각속도(rad/s). */
const SWAY_FREQ = 1.6;

interface WordSim {
  id: string;
  body: import('matter-js').Body;
  releaseAt: number; // ms(엔진 시작 기준)
  released: boolean;
}

interface PurpleSim {
  id: number;
  body: import('matter-js').Body;
  bornAt: number; // ms
  targetR: number;
  growDurMs: number;
  /** 현재 렌더 반지름(px) — 단조 증가, 절대 줄지 않는다. */
  curR: number;
  /** 좌우 흔들림 위상 시드(버블마다 다르게 사행). */
  phase: number;
}

export interface Step1PhysicsApi {
  /** 물리 활성 여부(측정 완료 + reduced 아님). false 면 일반 배치로 폴백. */
  engaged: boolean;
  /** 단어 원 버튼 ref 등록. */
  registerBubble: (id: string) => (el: HTMLButtonElement | null) => void;
  /** 렌더 대상 보라색 버블 목록. */
  purples: PurpleView[];
  /** 보라색 버블 span ref 등록. */
  registerPurple: (id: number) => (el: HTMLSpanElement | null) => void;
}

/**
 * Step1 물리 시뮬레이션 구동 훅(SOO-1048 → SOO-1057 개편).
 * matter-js 로 단어 원 중력 낙하·쌓임을 시뮬레이션하고, 낙하 완료 후에는 보라색
 * 버블이 **스테이지 하단에서 생성되어 부력으로 떠오르며**(동적 강체) 단어를 물리적으로
 * 밀어 올린다. 버블끼리는 스폰 시 겹침 회피 + 동적 충돌로 어떤 시점에도 겹치지 않는다.
 * 매 프레임 DOM transform 을 직접 갱신한다(React 리렌더 최소화 → 라즈베리파이 부하↓).
 */
export function useStep1Physics(
  fieldRef: React.RefObject<HTMLDivElement | null>,
  words: readonly WordItem[],
  settings: FxSettings,
  reduced: boolean,
): Step1PhysicsApi {
  const bubbleEls = useRef(new Map<string, HTMLButtonElement>());
  const purpleEls = useRef(new Map<number, HTMLSpanElement>());
  const [purples, setPurples] = useState<PurpleView[]>([]);
  const [engaged, setEngaged] = useState(false);

  // 최신 설정을 rAF 콜백에서 참조(엔진 재생성 없이 실시간 반영).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const registerBubble = useCallback(
    (id: string) => (el: HTMLButtonElement | null) => {
      if (el) bubbleEls.current.set(id, el);
      else bubbleEls.current.delete(id);
    },
    [],
  );
  const registerPurple = useCallback(
    (id: number) => (el: HTMLSpanElement | null) => {
      if (el) purpleEls.current.set(id, el);
      else purpleEls.current.delete(id);
    },
    [],
  );

  useEffect(() => {
    const field = fieldRef.current;
    if (reduced || !field) {
      setEngaged(false);
      return;
    }
    const width = field.clientWidth;
    const height = field.clientHeight;
    if (width <= 0 || height <= 0) return;

    // 단어 원 실측 반지름(첫 버튼 기준).
    const firstEl = bubbleEls.current.values().next().value as HTMLButtonElement | undefined;
    const bubblePx = firstEl?.offsetWidth || referenceBubblePx(width);
    const radius = bubblePx / 2;

    const world: Step1World = createStep1World(width, height, settingsRef.current.gravity);

    // 낙하 순서를 섞어 "우수수 랜덤" 스태거를 만든다.
    const order = words.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      // 결정적 셔플(Math.random) — 진입마다 다른 무더기.
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    const wordSims: WordSim[] = words.map((w, i) => {
      const startX = radius + Math.random() * Math.max(1, width - radius * 2);
      const startY = -radius - Math.random() * height * 0.5;
      const body = makeWordBody(startX, startY, radius);
      const slot = order.indexOf(i);
      return { id: w.id, body, releaseAt: slot * RELEASE_STAGGER, released: false };
    });

    // 초기 위치를 즉시 그려 first paint 부터 화면 위(낙하 대기)에 놓는다.
    for (const sim of wordSims) {
      const el = bubbleEls.current.get(sim.id);
      if (el) writeBubble(el, bodyCenter(sim.body));
    }
    setEngaged(true);

    const purpleSims: PurpleSim[] = [];
    let purpleId = 0;
    let startTs = -1;
    let lastTs = -1;
    let lastSpawn = -Infinity;
    let raf = 0;
    // 낙하 완료(정착) 판정 상태.
    let settled = false;
    let settleSince = -1; // 속도 임계 이하 진입 시각(ms), 리셋되면 -1
    let ceilingAdded = false; // 정착 후 상단 벽 1회 추가(버블이 화면 밖으로 날아가지 않게).

    /**
     * 현재 점유 영역(기존 보라 버블 + 낙하 완료된 단어 원)을 원 목록으로 수집.
     * 면적 채움 판정(스폰 중단)에 쓴다.
     */
    const collectOccupied = (): Circle[] => {
      const occupied: Circle[] = [];
      for (const p of purpleSims) {
        occupied.push({ x: p.body.position.x, y: p.body.position.y, r: p.curR });
      }
      for (const ws of wordSims) {
        if (ws.released) {
          occupied.push({ x: ws.body.position.x, y: ws.body.position.y, r: radius });
        }
      }
      return occupied;
    };

    /**
     * 하단(바닥선 근처)에 보라 버블 하나 스폰 시도(SOO-1057).
     * 다른 버블과 겹치지 않는 바닥 자리를 SPAWN_TRIES 안에 찾으면 동적 버블을 만들어
     * true, 못 찾으면 생성하지 않고 false. (false 여도 기존 버블은 유지 — 영속.)
     * 단어는 스폰 겹침 판정에서 제외 — 버블이 단어 사이/아래에서 솟아 단어를 밀어 올린다.
     */
    const trySpawnPurple = (nowMs: number): boolean => {
      const s = settingsRef.current;
      // 비중첩 기준 = 기존 버블들만(현재 반지름 + 여유). 단어는 밀어 올림 대상이라 제외.
      const bubbleOccupied: Circle[] = purpleSims.map((p) => ({
        x: p.body.position.x,
        y: p.body.position.y,
        r: p.curR,
      }));
      const candidates: { x: number; y: number }[] = [];
      for (let k = 0; k < SPAWN_TRIES; k++) {
        candidates.push(bottomSpawnPoint(width, height, Math.random(), PURPLE_START_R));
      }
      const spot = firstFreeSpawn(candidates, PURPLE_START_R, bubbleOccupied, SPAWN_PAD);
      if (!spot) return false; // 바닥에 빈 자리 없음 → 이번 스폰 건너뜀.
      const targetR = randomTargetPx(bubblePx, s.maxSizeRatio, Math.random()) / 2;
      const body = makeBubbleBody(spot.x, spot.y, PURPLE_START_R);
      addBody(world, body);
      const id = ++purpleId;
      purpleSims.push({
        id,
        body,
        bornAt: nowMs,
        targetR,
        growDurMs: s.growDurationSec * 1000,
        curR: PURPLE_START_R,
        phase: Math.random() * Math.PI * 2,
      });
      setPurples((ps) => [...ps, { id, color: purpleColor(s.hue, { alpha: 0.5 }) }]);
      return true;
    };

    const frame = (ts: number) => {
      if (startTs < 0) {
        startTs = ts;
        lastTs = ts;
      }
      const nowMs = ts - startTs;
      const dt = ts - lastTs;
      lastTs = ts;

      world.engine.gravity.y = settingsRef.current.gravity;

      // 스태거 낙하: 시간이 된 단어를 world 에 투입.
      for (const sim of wordSims) {
        if (!sim.released && nowMs >= sim.releaseAt) {
          addBody(world, sim.body);
          sim.released = true;
        }
      }

      // 부력·좌우 흔들림: matter 가 중력을 더하기 전에 버블에 위로 뜨는 힘을 싣는다.
      const gScale = world.engine.gravity.scale;
      const gY = world.engine.gravity.y;
      for (const p of purpleSims) {
        p.body.force.y += buoyancyForce(p.body.mass, gY, gScale, BUOYANCY_FACTOR);
        const phase = (nowMs / 1000) * SWAY_FREQ + p.phase;
        p.body.force.x += swayForce(p.body.mass, phase, SWAY_AMPLITUDE);
      }

      stepEngine(world, dt);

      // 정착 판정: 모든 단어가 방출되고 전 속도가 임계 이하로 SETTLE_HOLD_MS 유지.
      if (!settled) {
        const allReleased = wordSims.every((s) => s.released);
        const speeds = allReleased ? wordSims.map((s) => s.body.speed) : [];
        if (allReleased && bodiesSettled(speeds, SETTLE_SPEED)) {
          if (settleSince < 0) settleSince = nowMs;
          else if (nowMs - settleSince >= SETTLE_HOLD_MS) settled = true;
        } else {
          settleSince = -1;
        }
      }
      // 정착 직후 상단 천장 1회 추가 — 떠오른 버블이 상단에 쌓이고 화면 밖으로 안 날아감.
      if (settled && !ceilingAdded) {
        addCeiling(world);
        ceilingAdded = true;
      }

      // 보라 버블 생성 — 낙하 완료 후에만, 바닥에 빈 자리가 있고 화면이 가득 차기 전까지.
      // 한 틱에 3~5개를 랜덤하게 동시 생성.
      if (
        settled &&
        nowMs - lastSpawn >= settingsRef.current.spawnIntervalMs &&
        purpleSims.length < MAX_PURPLE
      ) {
        const burst = burstCount(Math.random());
        let spawnedAny = false;
        for (let b = 0; b < burst; b++) {
          if (purpleSims.length >= MAX_PURPLE) break;
          // 화면이 가득 차면 신규 스폰 중단(이미 생성된 버블은 유지 — 영속).
          if (areaFilled(collectOccupied(), width, height, FILL_STOP_RATIO)) break;
          if (trySpawnPurple(nowMs)) spawnedAny = true;
          else break; // 바닥에 빈 자리 없음 → 이번 버스트 종료.
        }
        if (spawnedAny) lastSpawn = nowMs;
      }

      // 보라 버블 성장(영속 — 수축·제거 없음). 동적 강체라 성장 시 겹치면 충돌로 밀려난다.
      for (let i = 0; i < purpleSims.length; i++) {
        const p = purpleSims[i];
        const age = nowMs - p.bornAt;
        const desired =
          age >= p.growDurMs
            ? p.targetR
            : growthRadius(PURPLE_START_R, p.targetR, age / 1000, p.growDurMs / 1000);
        // 단조 증가: 절대 줄지 않는다(버블 영속).
        const r = Math.max(p.curR, desired);
        p.curR = r;
        setCircleRadius(p.body, r);
        const alpha = 0.15 + 0.4 * easeOutCubic(Math.min(1, age / p.growDurMs));
        const el = purpleEls.current.get(p.id);
        if (el) writePurple(el, bodyCenter(p.body), r, alpha);
      }

      // 단어 원 위치 반영.
      for (const sim of wordSims) {
        if (!sim.released) continue;
        const el = bubbleEls.current.get(sim.id);
        if (el) writeBubble(el, bodyCenter(sim.body));
      }

      raf = window.requestAnimationFrame(frame);
    };
    raf = window.requestAnimationFrame(frame);

    return () => {
      window.cancelAnimationFrame(raf);
      // matter 월드 정리.
      world.engine.world.bodies.length = 0;
      setPurples([]);
      setEngaged(false);
    };
    // fieldRef 는 안정적. words/reduced 변경 또는 재마운트 시 재구성.
    // 설정(gravity 등)은 settingsRef 로 실시간 반영하므로 deps 에서 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, words]);

  return { engaged, registerBubble, purples, registerPurple };
}

/** 단어 원 DOM 위치 갱신(중심을 물리 좌표에 맞춤). */
function writeBubble(el: HTMLElement, c: { x: number; y: number; angle: number }) {
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  el.style.transform = `translate(${c.x - w / 2}px, ${c.y - h / 2}px) rotate(${c.angle}rad)`;
}

/** 보라색 버블 DOM 위치·크기·투명도 갱신. */
function writePurple(
  el: HTMLElement,
  c: { x: number; y: number; angle: number },
  radius: number,
  alpha: number,
) {
  const d = radius * 2;
  el.style.width = `${d}px`;
  el.style.height = `${d}px`;
  el.style.opacity = String(alpha);
  el.style.transform = `translate(${c.x - radius}px, ${c.y - radius}px)`;
}
