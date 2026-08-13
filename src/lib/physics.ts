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
    density: 0.0016,
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
 * 보라색 공(정적 강체) 생성. 정적이라 중력에 떨어지지 않고 제자리에서
 * 반지름이 커지며 주변 동적 단어 원을 밀어낸다(위로 들어 올린다).
 */
export function makePurpleBody(x: number, y: number, radius: number): Matter.Body {
  return Bodies.circle(x, y, Math.max(1, radius), {
    isStatic: true,
    friction: 0.4,
  });
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
