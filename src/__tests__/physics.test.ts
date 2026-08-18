import { describe, it, expect } from 'vitest';
import {
  createStep1World,
  makeWordBody,
  makeBoxBody,
  makeBubbleBody,
  addBody,
  addCeiling,
  clampBodyToStage,
  clampBoxBodyToStage,
  clampBodyAngle,
  stepEngine,
  MAX_WORD_ANGLE,
  WORD_DENSITY,
  BUBBLE_DENSITY,
  UNIFORM_BUBBLE_MASS,
  setUniformBubbleMass,
  setCircleRadius,
  freezeBody,
} from '../lib/physics';
import Matter from 'matter-js';

const W = 700;
const H = 500;
const R = 60;

/** 엔진을 n 프레임(≈16ms) 전진. */
function run(world: ReturnType<typeof createStep1World>, n: number) {
  for (let i = 0; i < n; i++) stepEngine(world, 16);
}

describe('물리 — 중력 낙하·바닥 안착', () => {
  it('단어 원이 중력으로 떨어져 바닥 위에서 멈춘다', () => {
    const world = createStep1World(W, H, 1);
    const body = makeWordBody(W / 2, -R, R); // 화면 위에서 출발
    addBody(world, body);
    run(world, 240); // ~4s

    // 바닥(y=H) 위에 안착 — 중심은 대략 H-R 부근, 바닥을 관통하지 않는다.
    expect(body.position.y).toBeGreaterThan(H / 2);
    expect(body.position.y + R).toBeLessThanOrEqual(H + 2);
    // 좌우 벽 안에 머문다.
    expect(body.position.x).toBeGreaterThan(0);
    expect(body.position.x).toBeLessThan(W);
  });

  it('중력 세기를 키우면 같은 시간에 더 멀리 떨어진다', () => {
    const slow = createStep1World(W, H, 0.5);
    const fast = createStep1World(W, H, 2);
    const bs = makeWordBody(W / 2, -R, R);
    const bf = makeWordBody(W / 2, -R, R);
    addBody(slow, bs);
    addBody(fast, bf);
    run(slow, 12);
    run(fast, 12);
    expect(bf.position.y).toBeGreaterThan(bs.position.y);
  });
});

describe('freezeBody (SOO-1114 채움 완료 후 물리 고정)', () => {
  it('고정 시 잔여 속도·각속도가 0 으로 클리어되고 정적이 된다', () => {
    const body = makeWordBody(W / 2, H / 2, R);
    Matter.Body.setVelocity(body, { x: 5, y: -8 });
    Matter.Body.setAngularVelocity(body, 0.6);
    freezeBody(body);
    expect(body.isStatic).toBe(true);
    expect(body.velocity.x).toBe(0);
    expect(body.velocity.y).toBe(0);
    expect(body.angularVelocity).toBe(0);
  });

  it('고정 후에는 중력·엔진 전진에도 미동조차 없다(지터 0)', () => {
    const world = createStep1World(W, H, 2);
    const body = makeWordBody(W / 2, H / 2, R);
    addBody(world, body);
    freezeBody(body);
    const px = body.position.x;
    const py = body.position.y;
    run(world, 120); // ~2s
    expect(body.position.x).toBe(px);
    expect(body.position.y).toBe(py);
    expect(body.speed).toBe(0);
  });

  it('고정 후에도 버블 성장(Body.scale)이 안전하다(반지름 갱신, 정적 유지, 무이동)', () => {
    const world = createStep1World(W, H, 1);
    const bubble = makeBubbleBody(W / 2, H / 2, 10);
    addBody(world, bubble);
    freezeBody(bubble);
    const px = bubble.position.x;
    const py = bubble.position.y;
    setCircleRadius(bubble, 30); // 고정 후 성장 호출
    expect(bubble.circleRadius).toBeCloseTo(30, 1);
    expect(bubble.isStatic).toBe(true);
    run(world, 60);
    expect(bubble.position.x).toBe(px);
    expect(bubble.position.y).toBe(py);
  });
});

describe('튕김 완화(restitution) — 보더 요청 SOO-1112 "충격량 완화를 조금 더 줄여"', () => {
  it('버블 튕김이 0 이다(반발 완전 제거)', () => {
    const bubble = makeBubbleBody(0, 0, R);
    expect(bubble.restitution).toBe(0);
  });

  it('단어 원 튕김이 더 완화되었다(0.05 이하)', () => {
    const word = makeWordBody(0, 0, R);
    expect(word.restitution).toBeLessThanOrEqual(0.05);
  });
});

describe('단어·버블 동일 비중(밀도) — 보더 요청 SOO-1112', () => {
  it('단어 밀도가 버블 밀도와 같다(SOO-1058 되돌림)', () => {
    expect(WORD_DENSITY).toBe(BUBBLE_DENSITY);
  });
});

describe('버블 무게 균일화 — 크기와 무관하게 동일(보더 요청 SOO-1112 후속)', () => {
  it('반지름이 달라도 버블 질량이 모두 UNIFORM_BUBBLE_MASS 로 동일하다', () => {
    const small = makeBubbleBody(0, 0, 6);
    const big = makeBubbleBody(0, 0, 60);
    // 밀도 기반이면 big.mass 가 (60/6)²=100배가 되지만, 균일화로 동일해야 한다.
    expect(small.mass).toBeCloseTo(UNIFORM_BUBBLE_MASS, 5);
    expect(big.mass).toBeCloseTo(UNIFORM_BUBBLE_MASS, 5);
    expect(small.mass).toBeCloseTo(big.mass, 5);
  });

  it('성장(setCircleRadius)으로 반지름이 커져도 setUniformBubbleMass 로 질량이 유지된다', () => {
    const bubble = makeBubbleBody(0, 0, 6);
    setCircleRadius(bubble, 48); // Body.scale 이 질량을 면적 비례로 키움
    expect(bubble.mass).toBeGreaterThan(UNIFORM_BUBBLE_MASS); // 재고정 전엔 커진다
    setUniformBubbleMass(bubble); // 훅이 성장 후 매 틱 호출하는 재고정
    expect(bubble.mass).toBeCloseTo(UNIFORM_BUBBLE_MASS, 5);
  });
});

describe('부력 제거 — 버블도 단어와 함께 아래로 가라앉는다(SOO-1112 후속)', () => {
  it('버블이 중력만 받으면(부력 미적용) 아래로 떨어져 바닥에 안착한다', () => {
    const world = createStep1World(W, H, 1);
    const bubble = makeBubbleBody(W / 2, H / 2, 20); // 화면 중앙에서 출발
    addBody(world, bubble);
    const startY = bubble.position.y;
    run(world, 240); // ~4s, 훅과 달리 buoyancyForce 를 싣지 않는다.
    // 아래(y 증가)로 떨어져 바닥 위에 머문다(위로 떠오르지 않음).
    expect(bubble.position.y).toBeGreaterThan(startY);
    expect(bubble.position.y + 20).toBeLessThanOrEqual(H + 2);
  });

  it('동일 비중이라 같은 높이에서 출발한 단어와 버블이 같은 속도로 떨어진다', () => {
    const world = createStep1World(W, H, 1);
    // 서로 간섭하지 않도록 좌·우로 떨어뜨려, 각자 자유낙하 궤적을 비교.
    const word = makeWordBody(W / 3, -R, R);
    const bubble = makeBubbleBody((2 * W) / 3, -R, R);
    addBody(world, word);
    addBody(world, bubble);
    run(world, 12); // 낙하 초기(바닥 도달 전) — 순수 자유낙하 구간.
    // 둘 다 아래로 내려갔고, 낙하 높이가 사실상 동일(동밀도·동일 공기저항 아님에 유의:
    // 단어 frictionAir 0.01 vs 버블 0.05 라 미세 차이 허용).
    expect(word.position.y).toBeGreaterThan(-R);
    expect(bubble.position.y).toBeGreaterThan(-R);
    expect(Math.abs(word.position.y - bubble.position.y)).toBeLessThan(R);
  });
});

describe('addCeiling — 상단 천장 벽 생성(SOO-1057, 잔존 방어선)', () => {
  it('천장이 있으면 강한 상방 힘에도 바디가 상단(y=0) 위로 넘어가지 않는다', () => {
    // 부력은 제거됐지만(버블은 이제 가라앉음) addCeiling 은 정착 후에도 호출돼,
    // 이례적 상방 힘으로도 바디가 화면 위로 튀지 않도록 하는 최후 방어선으로 남는다.
    const world = createStep1World(W, H, 1);
    addCeiling(world);
    const bubble = makeBubbleBody(W / 2, H - 6, 20);
    addBody(world, bubble);
    for (let i = 0; i < 300; i++) {
      // 강한 위로 힘(부력 대용) — 중력 가속도의 4배 상당(터널링 없이 천장에 눌리는 크기).
      bubble.force.y += -bubble.mass * world.engine.gravity.y * world.engine.gravity.scale * 4;
      stepEngine(world, 16);
    }
    // 천장에 막혀 중심이 상단(y=0)을 넘지 않는다.
    expect(bubble.position.y).toBeGreaterThan(0);
  });
});

describe('사각형 상자 — 회전 금지 낙하·적재(SOO-1056)', () => {
  const BW = 140;
  const BH = 56;

  it('inertia 가 무한대로 고정되어 회전 관성이 0 이다', () => {
    const box = makeBoxBody(100, 50, BW, BH);
    expect(box.inertia).toBe(Infinity);
    expect(box.inverseInertia).toBe(0);
    expect(box.angle).toBe(0);
  });

  it('상단에서 떨어져 회전 없이 바닥에 안착한다', () => {
    const world = createStep1World(W, H, 1);
    const box = makeBoxBody(W / 2, -BH, BW, BH);
    addBody(world, box);
    run(world, 240);

    // 각도 0 고정(회전 없음).
    expect(Math.abs(box.angle)).toBeLessThan(1e-9);
    // 바닥 위에 안착 — 상자 하단이 바닥을 관통하지 않는다.
    expect(box.position.y).toBeGreaterThan(H / 2);
    expect(box.position.y + BH / 2).toBeLessThanOrEqual(H + 2);
  });

  it('비대칭으로 충돌해도 상자가 회전하지 않는다(차곡차곡 적재)', () => {
    const world = createStep1World(W, H, 1);
    // 아래 상자 위 가장자리에 위 상자를 살짝 어긋나게 떨어뜨림.
    const bottom = makeBoxBody(W / 2, H - BH / 2, BW, BH);
    const top = makeBoxBody(W / 2 + BW / 3, -BH, BW, BH);
    addBody(world, bottom);
    addBody(world, top);
    run(world, 240);

    // 두 상자 모두 각도 0 유지 — 어긋난 충돌에도 기울지 않는다.
    expect(Math.abs(bottom.angle)).toBeLessThan(1e-9);
    expect(Math.abs(top.angle)).toBeLessThan(1e-9);
  });
});

describe('clampBodyToStage — 화면 이탈 절대 금지(SOO-1088)', () => {
  const SW = 764;
  const SH = 1024;
  const SR = 30;

  it('경계를 넘어간 원의 중심을 [r, size−r] 로 되돌리고 해당 축 속도를 0 으로', () => {
    const world = createStep1World(SW, SH, 1);
    const b = makeBubbleBody(SW + 500, SH + 500, SR); // 우·하단 밖으로 벗어난 상태
    addBody(world, b);
    b.velocity.x = 50;
    b.velocity.y = 50;
    const changed = clampBodyToStage(b, SW, SH, true);
    expect(changed).toBe(true);
    expect(b.position.x).toBeLessThanOrEqual(SW - SR);
    expect(b.position.y).toBeLessThanOrEqual(SH - SR);
    // 원의 어떤 부분도 경계 밖에 없음.
    expect(b.position.x + SR).toBeLessThanOrEqual(SW + 1e-6);
    expect(b.position.y + SR).toBeLessThanOrEqual(SH + 1e-6);
    // 클램프된 축 속도 0.
    expect(b.velocity.x).toBe(0);
    expect(b.velocity.y).toBe(0);
  });

  it('경계 안의 원은 손대지 않는다(false 반환·속도 보존)', () => {
    const world = createStep1World(SW, SH, 1);
    const b = makeBubbleBody(SW / 2, SH / 2, SR);
    addBody(world, b);
    const changed = clampBodyToStage(b, SW, SH, true);
    expect(changed).toBe(false);
    expect(b.position.x).toBeCloseTo(SW / 2);
    expect(b.position.y).toBeCloseTo(SH / 2);
  });

  it('clampTop=false 면 화면 위(y<0)에서 대기하는 낙하 진입 원을 막지 않는다', () => {
    const world = createStep1World(SW, SH, 1);
    const b = makeBubbleBody(SW / 2, -200, SR); // 화면 위에서 낙하 대기
    addBody(world, b);
    const changed = clampBodyToStage(b, SW, SH, false);
    expect(changed).toBe(false);
    expect(b.position.y).toBeCloseTo(-200);
  });

  it('매 틱 클램프 하에서 강한 상방 힘을 받아도 버블이 천장 위로 못 나간다', () => {
    const world = createStep1World(SW, SH, 1);
    const b = makeBubbleBody(SW / 2, SH - 40, 20);
    addBody(world, b);
    // 과도한 상방 힘(경계 밖 탈출 유발)을 매 틱 실으며 클램프 적용.
    for (let i = 0; i < 300; i++) {
      b.force.y += -b.mass * 5; // 강한 위로 힘
      stepEngine(world, 16);
      clampBodyToStage(b, SW, SH, true);
    }
    const r = b.circleRadius ?? 20;
    expect(b.position.y).toBeGreaterThanOrEqual(r - 1e-6);
    expect(b.position.y).toBeLessThanOrEqual(SH - r + 1e-6);
    expect(b.position.x).toBeGreaterThanOrEqual(r - 1e-6);
    expect(b.position.x).toBeLessThanOrEqual(SW - r + 1e-6);
  });
});

describe('clampBodyAngle — 문자 회전 ±45° 제한(SOO-1092)', () => {
  it('강한 각속도로 계속 회전시켜도 각도가 ±45° 를 넘지 않는다(단어 원)', () => {
    const world = createStep1World(W, H, 1);
    const body = makeWordBody(W / 2, H / 2, R);
    addBody(world, body);
    for (let i = 0; i < 300; i++) {
      // 매 틱 큰 각속도를 실어 계속 회전시키려 시도.
      Matter.Body.setAngularVelocity(body, 0.5);
      stepEngine(world, 16);
      clampBodyAngle(body);
      expect(Math.abs(body.angle)).toBeLessThanOrEqual(MAX_WORD_ANGLE + 1e-6);
    }
  });

  it('경계 이내(소각도)면 각도를 건드리지 않는다(clamped=false, 기존 거동 유지)', () => {
    const world = createStep1World(W, H, 1);
    const body = makeWordBody(W / 2, H / 2, R);
    Matter.Body.setAngle(body, 0.2); // < 45°
    addBody(world, body);
    const changed = clampBodyAngle(body);
    expect(changed).toBe(false);
    expect(body.angle).toBeCloseTo(0.2);
  });

  it('사각형 낱말 상자도 ±45° 안으로 유지된다(Step2)', () => {
    const world = createStep1World(W, H, 1);
    const box = makeBoxBody(W / 2, H / 2, 120, 52);
    // makeBoxBody 는 inertia=Infinity(비회전)이므로 회전 테스트 위해 유한 관성으로 되돌린다.
    Matter.Body.setInertia(box, 1000);
    addBody(world, box);
    for (let i = 0; i < 200; i++) {
      Matter.Body.setAngularVelocity(box, -0.5);
      stepEngine(world, 16);
      clampBodyAngle(box);
      expect(Math.abs(box.angle)).toBeLessThanOrEqual(MAX_WORD_ANGLE + 1e-6);
    }
  });
});

describe('clampBoxBodyToStage (SOO-1110 사각형 경계 이탈 방지)', () => {
  it('좌측으로 밀려난 상자 중심을 반폭만큼 안으로 되돌리고 x속도를 죽인다', () => {
    const world = createStep1World(W, H, 1);
    const box = makeBoxBody(-100, H / 2, 120, 52); // 화면 왼쪽 밖
    addBody(world, box);
    Matter.Body.setVelocity(box, { x: -5, y: 0 });
    const changed = clampBoxBodyToStage(box, 60, 26, W, H);
    expect(changed).toBe(true);
    expect(box.position.x).toBeCloseTo(60); // 반폭 = 60
    expect(box.velocity.x).toBe(0);
  });

  it('경계 안 상자는 보정하지 않는다(false)', () => {
    const world = createStep1World(W, H, 1);
    const box = makeBoxBody(W / 2, H / 2, 120, 52);
    addBody(world, box);
    expect(clampBoxBodyToStage(box, 60, 26, W, H)).toBe(false);
  });

  it('낙하 시뮬 내내 어떤 상자도 좌·우·하단 경계를 넘지 않는다(clampTop=false)', () => {
    const world = createStep1World(W, H, 1);
    const boxes = [
      makeBoxBody(50, -200, 200, 60),
      makeBoxBody(W - 30, -320, 200, 60),
      makeBoxBody(W / 2, -80, 160, 60),
    ];
    boxes.forEach((b) => addBody(world, b));
    for (let i = 0; i < 400; i++) {
      stepEngine(world, 16);
      for (const b of boxes) clampBoxBodyToStage(b, 100, 30, W, H, false);
    }
    for (const b of boxes) {
      expect(b.position.x - 100).toBeGreaterThanOrEqual(-1e-6); // 좌
      expect(b.position.x + 100).toBeLessThanOrEqual(W + 1e-6); // 우
      expect(b.position.y + 30).toBeLessThanOrEqual(H + 1e-6); // 하단
    }
  });

  it('top=false 면 위(y<0)에서 대기하는 낙하 진입은 클램프하지 않는다', () => {
    const world = createStep1World(W, H, 1);
    const box = makeBoxBody(W / 2, -300, 120, 52);
    addBody(world, box);
    // 방금 추가돼 아직 안 떨어진 상태: 상단은 강제되지 않아 y 보정 없음(x 도 경계 안이므로 false)
    expect(clampBoxBodyToStage(box, 60, 26, W, H, false)).toBe(false);
  });
});
