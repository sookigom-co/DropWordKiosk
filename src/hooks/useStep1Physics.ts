import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createStep1World,
  makeWordBody,
  makeBubbleBody,
  addBody,
  addCeiling,
  clampBodyToStage,
  clampBodyAngle,
  setCircleRadius,
  setBodyPosition,
  stepEngine,
  bodyCenter,
  type Step1World,
} from '../lib/physics';
import {
  approach,
  areaFilled,
  bodiesSettled,
  burstCount,
  easeOutCubic,
  FILL_STOP_RATIO,
  growthRadius,
  maxGrowRadius,
  purpleColor,
  randomFreeSpawn,
  randomTargetPx,
  referenceBubblePx,
  upwardPushTargets,
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
 * 버블은 소멸하지 않으므로(SOO-1049) 비중첩 스폰(빈 공간 소진)이 실질 상한을 만들지만,
 * 라즈베리파이 부하 폭주를 막기 위한 하드 캡을 둔다.
 */
const MAX_PURPLE = 160;
/** 단어 원 낙하 시작 간격(ms) — 우수수 떨어지는 스태거. */
const RELEASE_STAGGER = 110;
/** 보라 버블 시작 반지름(px) — 작게 태어나 목표 크기까지 성장(자리는 목표 크기 기준 예약). */
const PURPLE_START_R = 6;
/**
 * 하단 스폰 자유 자리 후보 시도 횟수(SOO-1112 재수정) — 하단 밴드에서 이 횟수만큼 랜덤 x 를
 * 뽑아, 시작 반지름이 기존 버블과 겹치지 않는 첫 자리를 고른다. 다 겹치면 이번 틱 스폰 보류.
 */
const SPAWN_TRIES = 30;
/** 스폰·성장·밀어올림 시 이웃과 유지할 최소 여유 간격(px) — 바짝 붙어 태어나는 떨림 방지. */
const SPAWN_PAD = 4;
/** 정착 판정 속도 임계값(matter speed). 이 이하가 유지되면 멈춘 것으로 본다. */
const SETTLE_SPEED = 0.4;
/** 정착 유지 시간(ms) — 임계 이하가 이만큼 지속돼야 낙하 완료로 확정. */
const SETTLE_HOLD_MS = 450;
/**
 * 밀어올림 글라이드 시간 상수(ms) — 보더 요청("좀 부드럽게, 튕겨나가지 말고 그냥 밀려만").
 * 버블 스폰 시 겹치는 단어를 한 프레임 순간이동으로 튕겨 올리는 대신, 이 시간 상수로 매 프레임
 * 목표 자리까지 지수 감쇠(ease-out)로 부드럽게 미끄러뜨린다. 작을수록 빠르게, 클수록 느긋하게.
 */
const PUSH_TAU_MS = 95;

interface WordSim {
  id: string;
  body: import('matter-js').Body;
  releaseAt: number; // ms(엔진 시작 기준)
  released: boolean;
  /**
   * 밀어올림 목표 y(px) — 버블 스폰 시 겹친 단어가 부드럽게 미끄러져 올라갈 목표 위치.
   * null 이면 물리(중력)만 작용. 목표에 도달하면 다시 null 로 풀려 중력으로 복귀한다.
   */
  pushTargetY: number | null;
}

interface PurpleSim {
  id: number;
  body: import('matter-js').Body;
  bornAt: number; // ms
  targetR: number;
  growDurMs: number;
  /** 현재 렌더 반지름(px) — 단조 증가, 절대 줄지 않는다. */
  curR: number;
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
 * Step1 물리 시뮬레이션 구동 훅(SOO-1048 → SOO-1057 → SOO-1112 재수정).
 * matter-js 로 단어 원 중력 낙하·쌓임을 시뮬레이션하고, 낙하 완료 후에는 보라색 버블이
 * **화면 전역 랜덤 위치에서 생성되어**(동적 강체) 단어와 **동일 비중으로 중력만 받아 아래로
 * 가라앉는다**(SOO-1112 후속, 보더 피드백: "왜 버블이 떠오르지? 모두 아래로 내려가도록"). 버블은
 * **기존 버블과 겹치지 않는 자리에서만** 작게 태어나고(비겹침 스폰), 겹치는 단어는 스폰 순간
 * 목표(성장 후) 반지름 기준으로 **밀어내(upwardPushTargets)** 자리를 비운다 — 겹친 채 태어나
 * 솔버가 "부르르 떨리는" 현상 없이 스폰 직후 프레임부터 겹침 0. 빈자리가 없으면 이번 틱 스폰을
 * 건너뛰고(영속 유지), 화면은 70%(FILL_STOP_RATIO)까지 채운다(비중첩 스폰 유지, 채움 조절).
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
      return { id: w.id, body, releaseAt: slot * RELEASE_STAGGER, released: false, pushTargetY: null };
    });

    // 초기 위치를 즉시 그려 first paint 부터 화면 위(낙하 대기)에 놓는다.
    for (const sim of wordSims) {
      const el = bubbleEls.current.get(sim.id);
      if (el) writeBubble(el, bodyCenter(sim.body));
    }
    setEngaged(true);

    const purpleSims: PurpleSim[] = [];
    let purpleId = 0;
    // 스폰은 스테이지 전역 랜덤(SOO-1112 재재수정, 보더 피드백 "다시 랜덤으로") — 버블이 화면
    // 어디서든 무작위로 태어나 단어와 동일 비중으로 중력만 받아 아래로 가라앉는다(부력 제거,
    // SOO-1112 후속). randomFreeSpawn 으로 기존 버블과 안 겹치는 랜덤 자리를 고른다(빈자리
    // 없으면 이번 틱 보류 — 겹친 채 생성 금지).
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
     * 버블은 **목표(성장 후) 반지름**으로 예약해, 아직 다 자라지 않았어도 최종 점유 자리를
     * 미리 반영한다(SOO-1112). 면적 채움 판정(스폰 중단, FILL_STOP_RATIO=0.7)에 쓴다 —
     * 신규 버블이 화면 70% 를 넘겨 계속 태어나지 않도록 하는 상한 근사(비중첩 스폰 유지).
     */
    const collectFootprint = (): Circle[] => {
      const occupied: Circle[] = [];
      for (const p of purpleSims) {
        // 성장 후 자리를 미리 예약 — 신규 버블이 이웃의 최종 크기를 피해 태어난다.
        occupied.push({ x: p.body.position.x, y: p.body.position.y, r: Math.max(p.curR, p.targetR) });
      }
      for (const ws of wordSims) {
        if (ws.released) {
          occupied.push({ x: ws.body.position.x, y: ws.body.position.y, r: radius });
        }
      }
      return occupied;
    };

    /**
     * 보라 버블 하나 스폰(SOO-1057 → … → SOO-1112 재재수정: 랜덤 스폰 + 밀어올림 사전 계산).
     *
     * 보더 피드백("버블 생성은 다시 랜덤으로 부탁해, 아래에서만 올라오면 의미가 없어"): 하단 밴드
     * 국한을 폐기하고 화면 어디서든 무작위로 태어나게 한다(SOO-1088 완전 랜덤 분포 복원). 그래서
     *  1) **스테이지 전역**에서 랜덤 후보를 만들고(`randomFreeSpawn`), 시작 반지름이 **기존 버블**과
     *     겹치지 않는 자리에서 작게 태어난다(단어는 겹침 검사 제외 — 밀어 올릴 대상).
     *  2) 태어나는 순간 겹치는 단어를 **목표(성장 후) 반지름 기준으로 밀어내**
     *     (`upwardPushTargets` → `setBodyPosition`) 자리를 비운다 → 겹친 채 태어나 솔버가 부르르
     *     떠는 현상 없이, 스폰 직후 프레임부터 버블-버블·버블-단어 겹침 0.
     *  3) 부력을 싣지 않으므로 버블은 단어와 동일 비중으로 중력만 받아 아래로 가라앉는다
     *     (SOO-1112 후속). 자리를 비운 뒤 버블·단어가 함께 바닥으로 떨어져 쌓인다.
     * 기존 버블과 겹치지 않는 자리가 없으면 이번 틱 스폰을 건너뛰고 false(버블 영속).
     */
    const trySpawnPurple = (nowMs: number): boolean => {
      const s = settingsRef.current;
      const targetR = randomTargetPx(bubblePx, s.maxSizeRatio, Math.random()) / 2;
      // 랜덤 스폰 자리: 시작 반지름이 기존 버블과 겹치지 않는 스테이지 전역 랜덤 자리(단어 제외).
      const bubbleCircles: Circle[] = purpleSims.map((p) => ({
        x: p.body.position.x,
        y: p.body.position.y,
        r: p.curR,
      }));
      const rndPairs: [number, number][] = [];
      for (let k = 0; k < SPAWN_TRIES; k++) rndPairs.push([Math.random(), Math.random()]);
      const spot = randomFreeSpawn(width, height, PURPLE_START_R, bubbleCircles, rndPairs, SPAWN_PAD);
      if (!spot) return false; // 빈자리 없음 → 이번 스폰 건너뜀(영속 유지).
      const body = makeBubbleBody(spot.x, spot.y, PURPLE_START_R);
      addBody(world, body);
      const id = ++purpleId;
      // 밀어올림 사전 계산: 목표 크기 기준으로 겹치는 단어를 위로 올려 자리를 미리 비운다.
      const releasedWords = wordSims.filter((w) => w.released);
      const wordCircles: Circle[] = releasedWords.map((w) => ({
        x: w.body.position.x,
        y: w.body.position.y,
        r: radius,
      }));
      const pushes = upwardPushTargets({ x: spot.x, y: spot.y, r: targetR }, wordCircles, SPAWN_PAD);
      for (const push of pushes) {
        const w = releasedWords[push.index];
        // 순간이동(튕겨나감) 대신 목표 y 만 기록 — 프레임 루프에서 `approach` 로 부드럽게 밀어올린다
        // (보더 요청 "튕겨나가지 말고 그냥 밀려만"). 목표는 상단 경계(반지름) 안으로 클램프해
        // clampBodyToStage 와 충돌해 글라이드가 멈추지 않게 한다. 이미 더 위(작은 y) 목표가 있으면 유지.
        const ty = Math.max(radius, push.y);
        w.pushTargetY = w.pushTargetY == null ? ty : Math.min(w.pushTargetY, ty);
      }
      purpleSims.push({
        id,
        body,
        bornAt: nowMs,
        targetR,
        growDurMs: s.growDurationSec * 1000,
        curR: PURPLE_START_R,
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

      // 부력 제거(SOO-1112 후속, 보더 요청 "왜 버블이 떠오르지? 모두 아래로 내려가도록"):
      // 버블에 더 이상 위로 뜨는 힘·좌우 흔들림을 싣지 않는다. 버블은 단어와 동일 비중으로
      // 중력만 받아 아래로 가라앉아 바닥에 함께 쌓인다.
      stepEngine(world, dt);

      // 밀어올림 글라이드(SOO-1112 후속, 보더 "튕겨나가지 말고 그냥 밀려만"): 버블 스폰 시 겹친
      // 단어를 순간이동으로 튕겨 올리는 대신, 목표 y 까지 매 프레임 지수 감쇠로 부드럽게 미끄러뜨린다.
      // 세로 속도는 setBodyPosition 이 0 으로 눌러 중력과 싸우지 않고 매끄럽게 올라가며, 목표에
      // 도달하면 pushTargetY 를 풀어 다시 중력으로 자연스럽게 가라앉는다(튕김 없음).
      for (const sim of wordSims) {
        if (sim.pushTargetY == null) continue;
        const nextY = approach(sim.body.position.y, sim.pushTargetY, dt, PUSH_TAU_MS);
        setBodyPosition(sim.body, sim.body.position.x, nextY);
        if (nextY === sim.pushTargetY) sim.pushTargetY = null;
      }

      // 화면 이탈 절대 금지(SOO-1088 최후 방어선): 매 틱 stepEngine 이후 모든 바디 중심을
      // 스테이지 [r, size−r] 안으로 강제 클램프해, 벽·솔버가 놓친 터널링·고속 탈출을 확정 차단.
      // - 보라 버블: 스폰 순간부터 필드 안에 있으므로 상·하·좌·우 전부 클램프.
      // - 단어 원: 위(y<0)에서 떨어져 들어오므로 정착 전에는 상단은 클램프하지 않는다
      //   (하단·좌·우는 항상). 정착 후에는 상단까지 클램프해 완전히 가둔다.
      for (const p of purpleSims) {
        clampBodyToStage(p.body, width, height, true);
      }
      for (const sim of wordSims) {
        if (sim.released) {
          clampBodyToStage(sim.body, width, height, settled);
          // 문자 회전 ±45° 제한(SOO-1092). 단어 원은 원형이라 회전이 충돌에 영향 없음 →
          // 순수 시각적 클램프(거동 회귀 없음). 보라 버블은 문자가 없어 제외.
          clampBodyAngle(sim.body);
        }
      }

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
          // 화면이 90% 차면 신규 스폰 중단(이미 생성된 버블은 유지 — 영속). 목표 크기 예약 기준.
          if (areaFilled(collectFootprint(), width, height, FILL_STOP_RATIO)) break;
          // 랜덤 스폰 + 밀어올림 사전 계산(SOO-1112 재재수정) — 어디서든 태어나 단어를 밀어 올린다.
          if (trySpawnPurple(nowMs)) {
            spawnedAny = true;
          } else break; // 빈 자리 없음 → 이번 버스트 종료.
        }
        if (spawnedAny) lastSpawn = nowMs;
      }

      // 보라 버블 성장(영속 — 수축·제거 없음). 스폰 시 목표 크기 자리를 예약하므로 대개
      // 이웃과 겹치지 않고 목표까지 자란다. 다만 부력 이동으로 이웃이 근접했을 때를 대비해
      // 성장 구간 동안에만 maxGrowRadius 로 이웃(현재 반지름) 비중첩 상한을 건다(SOO-1112 #3).
      for (let i = 0; i < purpleSims.length; i++) {
        const p = purpleSims[i];
        const age = nowMs - p.bornAt;
        const growing = age < p.growDurMs;
        const desired = growing
          ? growthRadius(PURPLE_START_R, p.targetR, age / 1000, p.growDurMs / 1000)
          : p.targetR;
        let capped = desired;
        if (growing) {
          // 성장 중에만 이웃 비중첩 상한 계산(성장 완료 후엔 스킵 → 라즈베리파이 부하 억제).
          const others: Circle[] = [];
          for (let j = 0; j < purpleSims.length; j++) {
            if (j === i) continue;
            const q = purpleSims[j];
            others.push({ x: q.body.position.x, y: q.body.position.y, r: q.curR });
          }
          capped = Math.min(
            desired,
            maxGrowRadius(p.body.position.x, p.body.position.y, desired, others, SPAWN_PAD),
          );
        }
        // 단조 증가: 절대 줄지 않는다(버블 영속). 상한이 현재보다 작아도 유지(수축 금지).
        const r = Math.max(p.curR, capped);
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
