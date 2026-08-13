/**
 * Step 1 물리 시뮬레이션 헬퍼(SOO-1048) — matter-js 얇은 래퍼.
 *
 * matter-js 선택 근거: 이미 의존성에 포함(추가 번들 비용 0)되어 있고,
 * 순수 JS 강체 물리라 라즈베리파이 Chromium 키오스크에서 소수의 강체
 * (단어 원 11개 + 보라 공 소수)만 다루면 충분히 가볍다. 렌더링은 canvas 가
 * 아니라 DOM transform 으로 직접 하므로 matter 의 Render 모듈은 쓰지 않는다.
 *
 * 좌표는 필드(bubble-field) 좌상단 기준 px. y 는 아래로 증가.
 */
import Matter from 'matter-js';

const { Engine, Bodies, Composite, Body } = Matter;

export interface Step1World {
  engine: Matter.Engine;
  /** 좌·우·바닥 정적 벽(리사이즈 시 갱신용으로 보관). */
  walls: Matter.Body[];
  width: number;
  height: number;
}

/** 벽 두께(px) — 충분히 두꺼워 빠른 낙하에도 뚫리지 않게. */
const WALL = 200;

/**
 * 글자(단어) 상자 확대 배율(SOO-1061) — 보더 요청(SOO-1060): Step2·Step3 낱말 상자를
 * "현재 대비 1.5배"로 확대. 각 화면의 현재 박스 치수(폭·높이·폰트·패딩)와 matter-js
 * 물리 바디 치수에 동일하게 곱해 시각/물리 불일치(겹침·관통 회귀)를 방지한다.
 * 배율을 이 한 곳으로 모아 두어 산재된 하드코딩을 막는다(가이드 지시).
 * 범위: Step2 낱말카드·Step3 낱말 상자만 — Step1 버블·단어, Step3 장식 사각형,
 * 인쇄(협정문 canvas)는 대상 밖.
 */
export const WORD_BOX_SCALE = 1.5;

/**
 * 보라 버블 밀도(SOO-1057) — 부력으로 떠오르는 기준 밀도.
 * 순 부력(=mass·g·scale·(factor−1))이 질량에 비례하므로, 버블이 단어를 실제로
 * 밀어 올릴 힘을 갖도록 충분히 둔다.
 */
export const BUBBLE_DENSITY = 0.0016;

/**
 * 단어 상자 밀도(SOO-1058) — 버블보다 무겁게(약 1.9배) 두어 "가라앉는 질감"을 만든다.
 * 단어에는 부력을 싣지 않으므로 오직 중력만 받아 하단에 가라앉아 머무르고, 떠오르는
 * 버블이 밀어 올려도(버블 밀도 대비 무거워) 과도하게 떠오르지 않고 살짝 밀렸다가 다시
 * 가라앉는다. 보더 4차 요청(SOO-1047 코멘트 `90ac4a96`): "단어 자체는 살짝 무겁게".
 */
export const WORD_DENSITY = 0.003;

/**
 * 필드 크기에 맞는 물리 월드 생성. 좌·우·바닥에 정적 벽을 두어
 * 단어 원이 바닥에 쌓이게 한다(천장은 없음 — 위에서 떨어뜨리므로).
 */
export function createStep1World(width: number, height: number, gravityY = 1): Step1World {
  const engine = Engine.create();
  engine.gravity.x = 0;
  engine.gravity.y = gravityY;

  const opts: Matter.IChamferableBodyDefinition = { isStatic: true, friction: 0.6 };
  const floor = Bodies.rectangle(width / 2, height + WALL / 2, width + WALL * 2, WALL, opts);
  const left = Bodies.rectangle(-WALL / 2, height / 2, WALL, height * 3, opts);
  const right = Bodies.rectangle(width + WALL / 2, height / 2, WALL, height * 3, opts);
  const walls = [floor, left, right];
  Composite.add(engine.world, walls);

  return { engine, walls, width, height };
}

/**
 * 단어 원(동적 강체) 생성. 살짝 튕기고(restitution) 마찰이 있어
 * 자연스러운 비정렬 무더기로 쌓인다. world 에는 아직 추가하지 않는다.
 */
export function makeWordBody(x: number, y: number, radius: number): Matter.Body {
  return Bodies.circle(x, y, radius, {
    restitution: 0.18,
    friction: 0.55,
    frictionStatic: 0.9,
    frictionAir: 0.01,
    // 버블보다 무겁게(WORD_DENSITY > BUBBLE_DENSITY) — 가라앉는 질감(SOO-1058).
    density: WORD_DENSITY,
  });
}

/**
 * 사각형 낱말 상자(동적 강체) 생성 — Step 3 낙하 적재용(SOO-1056).
 *
 * `inertia = Infinity`(inverseInertia = 0)로 회전 관성을 무한대로 두어
 * 낙하·충돌 과정에서 토크가 각가속도로 전환되지 않는다. 초기 각도를 0 으로
 * 두고 각속도를 주지 않으면 상자는 각도 0 을 유지한 채 평평하게 떨어진다.
 * 높은 마찰·낮은 튕김으로 바닥과 서로 위에 차곡차곡 쌓인다.
 * world 에는 아직 추가하지 않는다.
 */
export function makeBoxBody(x: number, y: number, width: number, height: number): Matter.Body {
  const body = Bodies.rectangle(x, y, width, height, {
    restitution: 0.05,
    friction: 0.8,
    frictionStatic: 1,
    frictionAir: 0.01,
    density: 0.0016,
    angle: 0,
  });
  // 회전 금지: inertia 를 무한대로 고정(충돌 각충격량 = inverseInertia * ... = 0).
  Body.setInertia(body, Infinity);
  Body.setAngle(body, 0);
  return body;
}

/**
 * 보라색 버블(동적 강체) 생성 — SOO-1057.
 *
 * 정적 공(제자리 성장)에서 **동적 버블(하단 스폰 → 부력 상승)**으로 전환한다.
 * 낮은 밀도·낮은 마찰·약한 튕김으로 물속 기포처럼 가볍게 떠오르고, `frictionAir`
 * 로 완만한 종단속도를 갖는다. 부력·좌우 흔들림은 매 프레임 훅에서 force 로 준다
 * (`buoyancyForce`/`swayForce`). 동적 강체라 버블끼리·단어와 충돌 해소되어
 * 어떤 시점에도 서로 겹치지 않고(비중첩), 떠오르며 단어를 물리적으로 밀어 올린다.
 * world 에는 아직 추가하지 않는다.
 */
export function makeBubbleBody(x: number, y: number, radius: number): Matter.Body {
  return Bodies.circle(x, y, Math.max(1, radius), {
    restitution: 0.08,
    friction: 0.02,
    frictionStatic: 0.05,
    // 완만한 종단속도(물속 기포처럼) — 너무 빠르면 단어를 뚫고 지나가 못 밀어 올린다.
    frictionAir: 0.05,
    // 버블 기준 밀도(BUBBLE_DENSITY). 상승 속도는 밀도와 무관(가속도=g·scale·(factor−1))
    // 하지만, 순 부력(=mass·g·scale·(factor−1))은 질량에 비례하므로 밀도를 충분히 둬야
    // 떠오르는 버블이 단어를 밀어 올릴 힘을 갖는다(SOO-1057 요구 5). 단어(WORD_DENSITY)는
    // 이보다 무거워, 버블이 밀어도 살짝만 밀리고 다시 가라앉는다(SOO-1058).
    density: BUBBLE_DENSITY,
  });
}

/**
 * 필드 상단에 정적 "천장" 벽을 추가한다(SOO-1057).
 * 바닥선에서 스폰돼 부력으로 떠오른 버블이 화면 밖으로 날아가지 않고 상단에
 * 차곡차곡 쌓이도록 막는다(소멸 금지 — SOO-1049 영속 규칙 유지). 벽 하단 모서리가
 * y=0 에 오도록 배치. 단어 낙하가 끝난(정착) 뒤에 추가해 낙하 진입을 막지 않는다.
 */
export function addCeiling(world: Step1World): Matter.Body {
  const ceiling = Bodies.rectangle(world.width / 2, -WALL / 2, world.width + WALL * 2, WALL, {
    isStatic: true,
    friction: 0.4,
  });
  Composite.add(world.engine.world, ceiling);
  world.walls.push(ceiling);
  return ceiling;
}

/** world 에 강체 추가. */
export function addBody(world: Step1World, body: Matter.Body): void {
  Composite.add(world.engine.world, body);
}

/** world 에서 강체 제거. */
export function removeBody(world: Step1World, body: Matter.Body): void {
  Composite.remove(world.engine.world, body);
}

/**
 * 원형 강체의 반지름을 targetRadius 로 맞춘다(Body.scale 로 스케일).
 * matter 는 원의 circleRadius 를 갱신하므로 이후 충돌에 즉시 반영된다.
 */
export function setCircleRadius(body: Matter.Body, targetRadius: number): void {
  const cur = body.circleRadius ?? 1;
  const next = Math.max(0.5, targetRadius);
  if (cur <= 0) return;
  const s = next / cur;
  if (Math.abs(s - 1) < 1e-3) return;
  Body.scale(body, s, s);
}

/** 엔진을 dtMs(밀리초)만큼 전진. 큰 프레임 간격은 상한을 둬 폭주 방지. */
export function stepEngine(world: Step1World, dtMs: number): void {
  const clamped = Math.min(48, Math.max(1, dtMs));
  Engine.update(world.engine, clamped);
}

/** 강체 중심 좌표(px). */
export function bodyCenter(body: Matter.Body): { x: number; y: number; angle: number } {
  return { x: body.position.x, y: body.position.y, angle: body.angle };
}
