import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createStep1World,
  makeWordBody,
  makePurpleBody,
  addBody,
  removeBody,
  setCircleRadius,
  stepEngine,
  bodyCenter,
  type Step1World,
} from '../lib/physics';
import {
  easeOutCubic,
  growthRadius,
  pickSpawnPoint,
  purpleColor,
  randomTargetPx,
  type FxSettings,
} from '../lib/fx';
import type { WordItem } from '../data/words';

/** 렌더할 보라색 공(React 상태 — 생성/제거 시에만 변경, 위치·크기는 명령형). */
export interface PurpleView {
  id: number;
  color: string;
}

/** 동시에 떠 있는 보라색 공 상한(성능 보호). */
const MAX_PURPLE = 5;
/** 단어 원 낙하 시작 간격(ms) — 우수수 떨어지는 스태거. */
const RELEASE_STAGGER = 110;
/** 보라 공 유지·수축 시간(ms). */
const PURPLE_HOLD_MS = 900;
const PURPLE_SHRINK_MS = 700;
/** 보라 공 시작 반지름(px). */
const PURPLE_START_R = 6;

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
}

export interface Step1PhysicsApi {
  /** 물리 활성 여부(측정 완료 + reduced 아님). false 면 일반 배치로 폴백. */
  engaged: boolean;
  /** 단어 원 버튼 ref 등록. */
  registerBubble: (id: string) => (el: HTMLButtonElement | null) => void;
  /** 렌더 대상 보라색 공 목록. */
  purples: PurpleView[];
  /** 보라색 공 span ref 등록. */
  registerPurple: (id: number) => (el: HTMLSpanElement | null) => void;
}

/**
 * Step1 물리 시뮬레이션 구동 훅(SOO-1048).
 * matter-js 로 단어 원 중력 낙하·쌓임과 보라색 공 성장·밀어올림을 시뮬레이션하고,
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
    const bubblePx = firstEl?.offsetWidth || Math.min(132, width * 0.2);
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

    const spawnPurple = (nowMs: number) => {
      const s = settingsRef.current;
      const { x, y } = pickSpawnPoint(width, height, Math.random(), Math.random());
      const targetR = randomTargetPx(bubblePx, s.maxSizeRatio, Math.random()) / 2;
      const body = makePurpleBody(x, y, PURPLE_START_R);
      addBody(world, body);
      const id = ++purpleId;
      purpleSims.push({ id, body, bornAt: nowMs, targetR, growDurMs: s.growDurationSec * 1000 });
      setPurples((ps) => [...ps, { id, color: purpleColor(s.hue, { alpha: 0.5 }) }]);
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

      stepEngine(world, dt);

      // 보라 공 생성.
      if (nowMs - lastSpawn >= settingsRef.current.spawnIntervalMs && purpleSims.length < MAX_PURPLE) {
        spawnPurple(nowMs);
        lastSpawn = nowMs;
      }

      // 보라 공 성장·유지·수축·제거.
      for (let i = purpleSims.length - 1; i >= 0; i--) {
        const p = purpleSims[i];
        const age = nowMs - p.bornAt;
        const grow = p.growDurMs;
        const holdEnd = grow + PURPLE_HOLD_MS;
        const lifeEnd = holdEnd + PURPLE_SHRINK_MS;
        let r: number;
        let alpha: number;
        if (age <= grow) {
          r = growthRadius(PURPLE_START_R, p.targetR, age / 1000, grow / 1000);
          alpha = 0.15 + 0.4 * easeOutCubic(age / grow);
        } else if (age <= holdEnd) {
          r = p.targetR;
          alpha = 0.55;
        } else if (age <= lifeEnd) {
          const k = (age - holdEnd) / PURPLE_SHRINK_MS;
          r = p.targetR * (1 - k);
          alpha = 0.55 * (1 - k);
        } else {
          removeBody(world, p.body);
          purpleSims.splice(i, 1);
          const rid = p.id;
          setPurples((ps) => ps.filter((v) => v.id !== rid));
          continue;
        }
        setCircleRadius(p.body, r);
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

/** 보라색 공 DOM 위치·크기·투명도 갱신. */
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
