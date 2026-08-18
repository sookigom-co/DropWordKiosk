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
import { clampToStage, clampBoxToStage, clampAngle } from './fx';

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
 * "현재 대비 1.1배"로 확대(최초 1.5배 → 1.3배 → 1.2배 → 보더 후속 조정으로 1.1배 하향). 각 화면의
 * 현재 박스 치수(폭·높이·폰트·패딩)와 matter-js 물리 바디 치수에 동일하게 곱해 시각/물리
 * 불일치(겹침·관통 회귀)를 방지한다.
 * 배율을 이 한 곳으로 모아 두어 산재된 하드코딩을 막는다(가이드 지시).
 * 범위: Step2 낱말카드·Step3 낱말 상자만 — Step1 버블·단어, Step3 장식 사각형,
 * 인쇄(협정문 canvas)는 대상 밖.
 */
export const WORD_BOX_SCALE = 1.1;

/**
 * 보라 버블 밀도(SOO-1057) — 부력으로 떠오르는 기준 밀도.
 * 순 부력(=mass·g·scale·(factor−1))이 질량에 비례하므로, 버블이 단어를 실제로
 * 밀어 올릴 힘을 갖도록 충분히 둔다.
 */
export const BUBBLE_DENSITY = 0.0016;

/**
 * 단어 원 밀도 — 보더 요청(SOO-1112): "단어 공과 버블은 같은 비중을 지니는 걸로".
 * SOO-1058(단어를 버블보다 ~1.9배 무겁게)을 되돌려 버블과 **동일 밀도**로 둔다.
 * 같은 반지름이면 단어와 버블의 질량이 같아, 떠오르는 버블이 단어를 동일한 비중으로
 * 자연스럽게 밀어 올린다. 단어에는 여전히 부력을 싣지 않으므로 중력만 받아 가라앉되,
 * 버블에 밀릴 때는 동밀도라 함께 떠오르는 질감이 된다.
 */
export const WORD_DENSITY = BUBBLE_DENSITY;

/**
 * 필드 크기에 맞는 물리 월드 생성. 좌·우·바닥에 정적 벽을 두어
 * 단어 원이 바닥에 쌓이게 한다(천장은 없음 — 위에서 떨어뜨리므로).
 */
export function createStep1World(width: number, height: number, gravityY = 1): Step1World {
  const engine = Engine.create();
  engine.gravity.x = 0;
  engine.gravity.y = gravityY;
  // 비중첩 강화(SOO-1063): 위치/속도 솔버 반복 횟수를 기본(6/4)보다 높여 적재 정착 시
  // 강체 간 잔여 관통(겹침)을 줄인다. 라즈베리파이에서도 강체 수가 적어 부하는 미미.
  engine.positionIterations = 10;
  engine.velocityIterations = 8;

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
    // 튕김 완전 제거(SOO-1112 후속, 보더 "왜 튕겨나가지 그냥 밀려만 나야"): 0.18 → 0.1 → 0.05 → 0.
    // 낙하·충돌 반발을 0 으로 둬 단어가 착지·충돌 시 튀지 않고 밀리기만 한다.
    restitution: 0,
    friction: 0.55,
    frictionStatic: 0.9,
    frictionAir: 0.01,
    // 버블과 동일 비중(WORD_DENSITY === BUBBLE_DENSITY) — 보더 요청(SOO-1112).
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
 * 보라색 버블(동적 강체) 생성 — SOO-1057 → SOO-1112 후속(부력 제거).
 *
 * 보더 요청(SOO-1112 후속, "왜 버블이 떠오르지? 워드 볼과 버블 모두 아래로 내려가도록
 * 같은 비중"): 기존 부력 상승을 폐기하고 버블도 **단어 원과 동일하게 중력만 받아 아래로
 * 가라앉게** 한다. 밀도는 단어와 동일(BUBBLE_DENSITY === WORD_DENSITY)이라 같은 반지름이면
 * 질량이 같아, 둘이 같은 비중으로 함께 떨어져 바닥에 쌓인다(부력·좌우 흔들림 force 는
 * 훅에서 더 이상 싣지 않는다). 동적 강체라 버블끼리·단어와 충돌이 해소돼 어떤 시점에도
 * 서로 겹치지 않는다(비중첩). world 에는 아직 추가하지 않는다.
 */
export function makeBubbleBody(x: number, y: number, radius: number): Matter.Body {
  const body = Bodies.circle(x, y, Math.max(1, radius), {
    // 튕김 완화(SOO-1112 후속, 보더 요청 "충격량 완화를 조금 더 줄여"): 0.08 → 0.02 → 0.
    // 낙하·충돌 반발을 완전히 제거해 버블이 튀지 않고 차곡차곡 쌓인다.
    restitution: 0,
    friction: 0.02,
    frictionStatic: 0.05,
    // 완만한 공기저항 — 낙하 종단속도를 부드럽게(회전·미끄러짐 안정화).
    frictionAir: 0.05,
    // 단어와 동일 비중(BUBBLE_DENSITY === WORD_DENSITY) — 보더 요청(SOO-1112 후속).
    // 같은 반지름이면 단어와 질량이 같아 같은 비중으로 함께 아래로 가라앉는다.
    density: BUBBLE_DENSITY,
  });
  // 무게 균일화(SOO-1112 후속, 보더 "원의 크기와 상관없이 무게를 동일하게"):
  // 밀도 기반이면 mass = density·π·r² 라 큰 버블일수록 무거워 단어를 더 세게 누른다.
  // 스폰 직후 UNIFORM_BUBBLE_MASS 로 질량을 고정해, 버블 크기와 무관하게 동일한 무게로
  // 단어를 밀어내도록 한다(성장 시에도 setUniformBubbleMass 로 재적용).
  setUniformBubbleMass(body);
  return body;
}

/**
 * 버블 균일 질량(SOO-1112 후속) — 보더 요청 "원의 크기와 상관없이 무게를 동일하게".
 *
 * 밀도 기반 질량(density·π·r²)은 반지름 제곱에 비례해, 큰 버블이 단어를 과하게 눌렀다.
 * 모든 버블의 질량을 이 상수로 고정하면 시각 크기와 무관하게 동일한 무게로 거동한다.
 * 값은 기준 단어 원(density BUBBLE_DENSITY, 반지름 ≈36px = 72px 원)의 질량과 같은
 * 크기 규모로 두어, 버블 한 개가 단어 한 개와 비슷한 무게가 되게 한다. Body.scale(성장)이
 * 질량을 다시 면적 비례로 바꾸므로, 성장 후에도 setUniformBubbleMass 로 재고정한다.
 */
export const UNIFORM_BUBBLE_MASS = BUBBLE_DENSITY * Math.PI * 36 * 36;

/** 버블 질량을 UNIFORM_BUBBLE_MASS 로 고정(생성·성장 후 호출). */
export function setUniformBubbleMass(body: Matter.Body): void {
  Body.setMass(body, UNIFORM_BUBBLE_MASS);
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

/**
 * 단어(문자) 최대 기울기 각도(SOO-1092) — ±45°(π/4 rad).
 * 보더 요청(SOO-1091): Step1·Step2 에서 문자가 45° 이상 회전하지 않게 한다.
 */
export const MAX_WORD_ANGLE = Math.PI / 4;

/**
 * 동적 강체의 회전각을 ±limit(기본 MAX_WORD_ANGLE=45°) 안으로 강제 클램프(SOO-1092).
 *
 * 매 틱 stepEngine 이후 호출한다. 각도가 경계를 넘으면 `Body.setAngle` 로 되돌리고,
 * 바깥으로 미는 각속도만 `Body.setAngularVelocity` 로 제거해(안쪽 회복 각속도는 유지)
 * 급격한 스냅 없이 자연스럽게 경계에서 되돌아오게 한다. 경계 이내면 아무것도 하지 않아
 * 기존 물리 거동(작은 기울임)은 그대로 유지된다.
 *
 * Step1 단어 원은 회전이 충돌 형상에 영향을 주지 않으므로(원형) 이 클램프는 순수하게
 * 시각적(문자 기울기)이라 물리 거동 회귀가 없다. Step2 낱말 상자(사각형)는 각도가 충돌
 * 형상에 영향을 주지만, 45° 이내로만 유지될 뿐 낙하·적재 거동 자체는 바뀌지 않는다.
 *
 * @returns 각도를 실제로 보정했으면 true.
 */
export function clampBodyAngle(body: Matter.Body, limit = MAX_WORD_ANGLE): boolean {
  const c = clampAngle(body.angle, body.angularVelocity, limit);
  if (!c.clamped) return false;
  Body.setAngle(body, c.angle);
  Body.setAngularVelocity(body, c.angularVelocity);
  return true;
}

/**
 * 바디의 잔여 운동을 제거하고 정적으로 고정한다(SOO-1114).
 *
 * 보더 피드백: 채움이 끝난 뒤에도 솔버가 잔여 접촉을 해소하며 바디가 "부르르" 미세 진동한다.
 * 채움 완료 2초 뒤 이 함수로 각 바디를 고정하면 이후 어떤 접촉·힘에도 미동조차 없다(지터 0).
 *
 * 순서가 중요하다: 먼저 선속도·각속도를 0 으로 클리어해 고정 순간의 잔여 속도가 위치 스냅으로
 * 새어 나오지 않게 한 뒤(자연스러운 정지), `Body.setStatic(true)` 로 고정한다. 고정된 바디는
 * mass=Infinity·inverseMass=0 이 되어 솔버가 밀어도 움직이지 않으며, `Engine.update` 의 적분에서도
 * 제외된다. `Body.scale`(버블 성장)은 정적 바디의 질량을 재계산하지 않으므로 고정 후에도 안전하다.
 */
export function freezeBody(body: Matter.Body): void {
  Body.setVelocity(body, { x: 0, y: 0 });
  Body.setAngularVelocity(body, 0);
  Body.setStatic(body, true);
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

/**
 * 강체를 지정 위치로 즉시 이동(SOO-1112) — 스폰 시 겹치는 단어를 사전 계산한 자리로 밀어올릴 때.
 * matter `Body.setPosition` 은 이전 위치(positionPrev)도 함께 갱신하므로 순간이동에 따른 허위
 * 속도가 생기지 않는다. 위로 밀어올린 뒤 곧바로 아래로 튕겨 내려가지 않도록 세로 속도만 0 으로
 * 초기화한다(가로 속도는 유지 — 좌우 거동 회귀 없음).
 */
export function setBodyPosition(body: Matter.Body, x: number, y: number): void {
  Body.setPosition(body, { x, y });
  Body.setVelocity(body, { x: body.velocity.x, y: 0 });
}

/**
 * 원형 강체를 스테이지 경계 안으로 강제 클램프(SOO-1088 최후 방어선).
 *
 * 매 틱 stepEngine 이후 호출해, 벽·솔버가 놓친 터널링·고속 탈출로 반지름만큼이라도
 * 경계를 넘어간 바디의 중심을 [r, size−r] 로 되돌린다(어떤 원도 화면 밖으로 못 나감).
 * 클램프가 일어난 축의 속도는 0 으로 눌러 경계에서 반복적으로 튀거나 힘이 누적돼
 * 다시 탈출하는 것을 막는다.
 *
 * `clampTop === false` 면 상단 경계는 강제하지 않아, 위(y<0)에서 떨어져 들어오는
 * 낙하 진입 단어 원을 방해하지 않는다(하단·좌·우는 항상 강제).
 *
 * @returns 위치를 실제로 보정했으면 true.
 */
export function clampBodyToStage(
  body: Matter.Body,
  width: number,
  height: number,
  clampTop = true,
): boolean {
  const r = body.circleRadius ?? 0;
  const c = clampToStage(body.position.x, body.position.y, r, width, height, { top: clampTop });
  if (!c.clampedX && !c.clampedY) return false;
  Body.setPosition(body, { x: c.x, y: c.y });
  Body.setVelocity(body, {
    x: c.clampedX ? 0 : body.velocity.x,
    y: c.clampedY ? 0 : body.velocity.y,
  });
  return true;
}

/**
 * 사각형(낱말 상자) 강체를 스테이지 경계 안으로 강제 클램프(SOO-1110 최후 방어선).
 *
 * `clampBodyToStage`(원 전용, circleRadius 사용)는 사각형 바디에서 circleRadius 가 undefined 라
 * r=0 으로 취급돼 상자 절반이 경계를 넘어도 못 막는다. 이 함수는 상자의 반폭·반높이를 직접 받아
 * 매 틱 stepEngine 이후 중심을 [half, size−half] 로 되돌린다(어떤 상자 모서리도 화면 밖으로 못 나감).
 * 클램프된 축의 속도는 0 으로 눌러 경계에서 반복 튐·힘 누적 재탈출을 막는다.
 * `clampTop === false` 면 상단 경계는 강제하지 않아 위(y<0)에서 떨어져 들어오는 낙하 진입을 방해하지
 * 않는다(하단·좌·우는 항상 강제).
 *
 * makeBoxBody 는 inertia=∞·angle 0 고정이라 반폭·반높이가 상수 → 회전에 따른 외접 보정 불필요.
 *
 * @returns 위치를 실제로 보정했으면 true.
 */
export function clampBoxBodyToStage(
  body: Matter.Body,
  halfW: number,
  halfH: number,
  width: number,
  height: number,
  clampTop = true,
): boolean {
  const c = clampBoxToStage(body.position.x, body.position.y, halfW, halfH, width, height, {
    top: clampTop,
  });
  if (!c.clampedX && !c.clampedY) return false;
  Body.setPosition(body, { x: c.x, y: c.y });
  Body.setVelocity(body, {
    x: c.clampedX ? 0 : body.velocity.x,
    y: c.clampedY ? 0 : body.velocity.y,
  });
  return true;
}
