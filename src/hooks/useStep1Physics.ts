import { useCallback, useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import {
  createStep1World,
  makeWordBody,
  makeBubbleBody,
  addBody,
  clampBodyToStage,
  clampBodyAngle,
  freezeBody,
  stepEngine,
  bodyCenter,
  type Step1World,
} from '../lib/physics';
import {
  areaFilled,
  bodiesSettled,
  FILL_STOP_RATIO,
  FREEZE_DELAY_MS,
  freezeDue,
  purpleColor,
  randomTargetPx,
  referenceBubblePx,
  topDropFreeSpawn,
  type Circle,
  type FxSettings,
} from '../lib/fx';
import type { WordItem } from '../data/words';

/** 렌더할 보라색 버블(React 상태 — 생성/제거 시에만 변경, 위치는 명령형). */
export interface PurpleView {
  id: number;
  color: string;
}

/**
 * 세션 동안 유지되는 보라색 버블 상한(성능 안전판).
 * 버블은 소멸하지 않으므로(SOO-1049) 채움 상한(FILL_STOP_RATIO)이 실질 상한을 만들지만,
 * 라즈베리파이 부하 폭주를 막기 위한 하드 캡을 둔다.
 */
const MAX_PURPLE = 160;
/** 단어 원 낙하 시작 간격(ms) — 우수수 떨어지는 스태거. */
const RELEASE_STAGGER = 110;
/**
 * 상단 낙하 스폰 자유 자리 후보 시도 횟수(SOO-1208) — 상단선에서 이 횟수만큼 랜덤 x 를 뽑아,
 * 목표 반지름이 상단 근처에서 낙하 중인 기존 버블과 겹치지 않는 첫 자리를 고른다. 다 겹치면
 * 이번 틱 스폰 보류(상단선이 아직 붐빔 → 다음 프레임 재시도).
 */
const SPAWN_TRIES = 30;
/** 스폰 시 이웃과 유지할 최소 여유 간격(px) — 상단선에서 바짝 붙어 태어나는 겹침 방지. */
const SPAWN_PAD = 4;
/** 정착 판정 속도 임계값(matter speed). 이 이하가 유지되면 멈춘 것으로 본다. */
const SETTLE_SPEED = 0.4;
/** 정착 유지 시간(ms) — 임계 이하가 이만큼 지속돼야 낙하 완료로 확정. */
const SETTLE_HOLD_MS = 450;
/** 보라 버블 렌더 투명도(고정) — 성장이 사라져 알파 애니메이션도 없앴다(SOO-1208). */
const PURPLE_ALPHA = 0.55;

interface WordSim {
  id: string;
  body: import('matter-js').Body;
  releaseAt: number; // ms(엔진 시작 기준)
  released: boolean;
}

interface PurpleSim {
  id: number;
  body: import('matter-js').Body;
  /** 반지름(px) — 상단에서 목표 크기 그대로 태어나 고정(성장 없음, SOO-1208). */
  r: number;
  /**
   * 상단 경계 안으로 진입했는지 — false 인 동안(스폰 직후, 화면 밖에서 낙하 중)엔 상단 클램프를
   * 걸지 않아 화면 위(y<0)에서 떨어져 들어오는 것을 막지 않는다. 중심이 필드 안으로 들어오면
   * true 로 바뀌어 이후 상단까지 클램프(화면 이탈 최후 방어선).
   */
  entered: boolean;
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
 * Step1 물리 시뮬레이션 구동 훅(SOO-1048 → SOO-1057 → SOO-1112 → SOO-1208 낙하·적재 전환
 * → SOO-1208 후속 글자·보라 원 혼합 낙하).
 *
 * matter-js 로 단어 원과 보라색 버블이 **화면 상단 밖에서 함께 떨어져** 바닥·서로 위에 섞여
 * 쌓이는 것을 시뮬레이션한다(부모 SOO-1207 보더 요청: "제자리 생성·성장"을 "위에서 떨어져
 * 쌓이는" 방식으로 교체 + 후속 "글자·보라 원을 다 섞어서 떨어뜨려 달라"). 단어 원은 시작과 함께
 * 스태거로 낙하하고, 보라 버블은 **단어 정착을 기다리지 않고 동시에** 상단에서 목표 크기 그대로
 * 태어나 떨어진다 → 둘이 서로 섞여 쌓인다. 버블은 상단선에서 **기존 버블·낙하 중인 단어 원과
 * 겹치지 않는 랜덤 x**(`topDropFreeSpawn`)로만 태어나 스폰 순간 관통을 원천 차단하고, 낙하·적재
 * 중 겹침 해소는 동적 강체 충돌(restitution 0, positionIterations 10)이 맡는다. 원형·보라색·
 * 랜덤(크기·x)은 유지하되 제자리 스폰·성장·부력·밀어올림 로직은 제거했다.
 *
 * 매 프레임 DOM transform 을 직접 갱신한다(React 리렌더 최소화 → 라즈베리파이 부하↓).
 * 채움 상한(70% FILL_STOP_RATIO 또는 MAX_PURPLE)에 도달해 스폰이 멈추고 단어 원·보라 버블이
 * 모두 정착하면(= 좌표 안정) 그때를 채움 완료로 보고, 약 2초(FREEZE_DELAY_MS) 뒤 전체 바디를 정적 고정
 * (freezeBody)하고 rAF 루프를 멈춰 잔여 접촉 해소 떨림(지터)을 제거한다(SOO-1114).
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
    // 단어 낙하 완료(정착) 판정 상태 — 정착해야 보라 버블 낙하를 시작한다.
    let settled = false;
    let settleSince = -1; // 속도 임계 이하 진입 시각(ms), 리셋되면 -1
    // 스폰 중단(채움 상한 도달) 래치 — 한 번 서면 유지(버블 영속).
    let spawnStopped = false;
    let bubbleSettleSince = -1; // 스폰 중단 후 낙하 버블이 임계 이하로 진입한 시각(ms)
    // 물리 고정(SOO-1114) — 채움 완료 후 유예 뒤 전체 바디 정적 고정으로 지터 제거.
    let fillCompleteAt = -1; // 채움 완료(스폰 중단+정착) 최초 도달 시각(ms), 래치.
    let frozen = false; // 고정 완료 여부. true 면 rAF 루프를 멈춰 이후 물리·갱신이 없다.

    /**
     * 현재 점유 영역(기존 보라 버블 + 낙하 완료된 단어 원)을 원 목록으로 수집.
     * 버블은 목표 크기 그대로 태어나므로(성장 없음, SOO-1208) 실측 반지름을 그대로 쓴다.
     * 면적 채움 판정(스폰 중단, FILL_STOP_RATIO=0.70)에 쓴다.
     */
    const collectFootprint = (): Circle[] => {
      const occupied: Circle[] = [];
      for (const p of purpleSims) {
        occupied.push({ x: p.body.position.x, y: p.body.position.y, r: p.r });
      }
      for (const ws of wordSims) {
        if (ws.released) {
          occupied.push({ x: ws.body.position.x, y: ws.body.position.y, r: radius });
        }
      }
      return occupied;
    };

    /**
     * 보라 버블 하나를 화면 상단 밖에서 낙하 스폰(SOO-1208).
     *
     * 목표(랜덤) 크기 그대로 상단선(y=−r) 위에서 태어나 중력으로 떨어진다. 상단 근처에서 낙하
     * 중인 기존 버블과 겹치지 않는 랜덤 x(`topDropFreeSpawn`)를 골라 스폰 순간 관통을 막는다.
     * 붐벼서 빈 x 가 없으면 false → 이번 틱 스폰 보류(다음 프레임 재시도). 낙하·적재 중 겹침
     * 해소는 동적 강체 충돌이 맡는다(밀어올림·부력·성장 없음).
     */
    const trySpawnPurple = (): boolean => {
      const s = settingsRef.current;
      const r = randomTargetPx(bubblePx, s.maxSizeRatio, Math.random()) / 2;
      // 상단 근처에서 낙하 중인 것만 실질 배제(바닥에 쌓인 것은 y=−r 후보와 멀어 무영향).
      // 보라 버블뿐 아니라 **함께 낙하 중인 단어 원**도 후보 배제에 넣어(SOO-1208 혼합 낙하)
      // 상단선에서 단어 위로 보라 원이 겹쳐 태어나는 스폰 순간 관통을 막는다.
      const obstacles: Circle[] = purpleSims.map((p) => ({
        x: p.body.position.x,
        y: p.body.position.y,
        r: p.r,
      }));
      for (const ws of wordSims) {
        if (ws.released) {
          obstacles.push({ x: ws.body.position.x, y: ws.body.position.y, r: radius });
        }
      }
      const rnds: number[] = [];
      for (let k = 0; k < SPAWN_TRIES; k++) rnds.push(Math.random());
      const spot = topDropFreeSpawn(width, r, obstacles, rnds, SPAWN_PAD);
      if (!spot) return false; // 상단선 붐빔 → 이번 스폰 건너뜀(영속 유지).
      const body = makeBubbleBody(spot.x, spot.y, r);
      // 아래 방향으로 살짝 속도 시드(좌우 편향 없음) — Step3 낙하 관례와 동일한 안정적 진입.
      Matter.Body.setVelocity(body, { x: 0, y: 1 });
      addBody(world, body);
      const id = ++purpleId;
      purpleSims.push({ id, body, r, entered: false });
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

      stepEngine(world, dt);

      // 화면 이탈 절대 금지(SOO-1088 최후 방어선): 매 틱 stepEngine 이후 모든 바디 중심을
      // 스테이지 [r, size−r] 안으로 강제 클램프한다.
      // - 보라 버블: 상단 밖(y<0)에서 떨어져 들어오므로 필드 안으로 진입(entered)하기 전에는
      //   상단을 클램프하지 않는다(낙하 진입 비방해). 진입 후에는 상·하·좌·우 전부 클램프.
      // - 단어 원: 위(y<0)에서 떨어져 들어오므로 정착 전에는 상단을 클램프하지 않는다.
      for (const p of purpleSims) {
        if (!p.entered && p.body.position.y >= p.r) p.entered = true;
        clampBodyToStage(p.body, width, height, p.entered);
      }
      for (const sim of wordSims) {
        if (sim.released) {
          clampBodyToStage(sim.body, width, height, settled);
          // 문자 회전 ±45° 제한(SOO-1092). 단어 원은 원형이라 회전이 충돌에 영향 없음 →
          // 순수 시각적 클램프(거동 회귀 없음). 보라 버블은 문자가 없어 제외.
          clampBodyAngle(sim.body);
        }
      }

      const allReleased = wordSims.every((s) => s.released);

      // 정착 판정(단어 원): 모든 단어가 방출되고 전 속도가 임계 이하로 SETTLE_HOLD_MS 유지.
      // 단어 top-클램프(화면 위 낙하 진입 허용 여부, 아래 참조)에만 쓴다. 보라 버블이 함께
      // 떨어지며 단어를 계속 건드리므로 실제로는 낙하가 모두 잦아드는 후반에야 settled 가
      // 된다(무해 — 그전엔 중력으로 아래로만 향해 상단 이탈 위험이 없다).
      if (!settled) {
        const speeds = allReleased ? wordSims.map((s) => s.body.speed) : [];
        if (allReleased && bodiesSettled(speeds, SETTLE_SPEED)) {
          if (settleSince < 0) settleSince = nowMs;
          else if (nowMs - settleSince >= SETTLE_HOLD_MS) settled = true;
        } else {
          settleSince = -1;
        }
      }

      // 보라 버블 낙하 스폰(SOO-1208 후속 — 글자·보라 원 혼합 낙하, 부모 SOO-1207 보더 요청
      // "다 섞어서"). 단어 정착을 기다리지 않고 단어 낙하와 **동시에** 상단에서 떨어뜨려 둘이
      // 섞여 쌓이게 한다. spawnIntervalMs 간격으로 상단선 비겹침 자리를 찾아 스폰(붐비면 다음
      // 프레임 재시도), 채움 상한(70% FILL_STOP_RATIO)·MAX_PURPLE 전까지.
      if (
        !spawnStopped &&
        nowMs - lastSpawn >= settingsRef.current.spawnIntervalMs &&
        purpleSims.length < MAX_PURPLE
      ) {
        // 화면이 75% 차면 신규 스폰 중단(이미 쌓인 버블은 유지 — 영속).
        if (areaFilled(collectFootprint(), width, height, FILL_STOP_RATIO)) {
          spawnStopped = true;
        } else if (trySpawnPurple()) {
          lastSpawn = nowMs;
        }
      }
      if (purpleSims.length >= MAX_PURPLE) spawnStopped = true;

      // 채움 완료 감지(SOO-1114, SOO-1208 혼합 낙하 재해석): 모든 단어가 방출되고 스폰이
      // 멈춘(채움 상한 도달) 뒤, **단어 원 + 보라 버블 전체**가 임계 속도 이하로 SETTLE_HOLD_MS
      // 유지되면 그때를 채움 완료로 래치한다. 이 시점부터 FREEZE_DELAY_MS 뒤 전체 고정.
      // 바디가 없으면(엣지) 곧바로 완료로 본다.
      if (allReleased && spawnStopped && fillCompleteAt < 0) {
        const speeds = [
          ...wordSims.filter((s) => s.released).map((s) => s.body.speed),
          ...purpleSims.map((p) => p.body.speed),
        ];
        if (speeds.length === 0 || bodiesSettled(speeds, SETTLE_SPEED)) {
          if (bubbleSettleSince < 0) bubbleSettleSince = nowMs;
          else if (nowMs - bubbleSettleSince >= SETTLE_HOLD_MS) fillCompleteAt = nowMs;
        } else {
          bubbleSettleSince = -1;
        }
      }

      // 보라 버블 위치 반영(영속 — 수축·제거 없음, 반지름·투명도 고정).
      for (const p of purpleSims) {
        const el = purpleEls.current.get(p.id);
        if (el) writePurple(el, bodyCenter(p.body), p.r, PURPLE_ALPHA);
      }

      // 단어 원 위치 반영.
      for (const sim of wordSims) {
        if (!sim.released) continue;
        const el = bubbleEls.current.get(sim.id);
        if (el) writeBubble(el, bodyCenter(sim.body));
      }

      // 물리 고정(SOO-1114): 채움 완료 후 FREEZE_DELAY_MS 유예가 지나면 이번 프레임에서 방금
      // 그린 위치 그대로(스냅/튐 없음) 모든 바디의 잔여 속도를 0 으로 클리어하고 정적 고정한다.
      // 고정 뒤에는 다음 프레임을 요청하지 않아 rAF 루프가 멈춘다 → 물리·솔버가 더 이상 돌지
      // 않으므로 잔여 접촉 해소 떨림(지터)이 0 이고, 갱신 루프 부작용·콘솔 에러도 없다.
      if (!frozen && freezeDue(fillCompleteAt < 0 ? null : fillCompleteAt, nowMs, FREEZE_DELAY_MS)) {
        for (const sim of wordSims) {
          if (!sim.released) continue;
          freezeBody(sim.body);
        }
        for (const p of purpleSims) {
          freezeBody(p.body);
        }
        frozen = true;
        return; // 다음 프레임 미요청 → 루프 종료(정지 상태 유지).
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
