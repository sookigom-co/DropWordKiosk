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
  setCircleRadius,
  stepEngine,
  MAX_WORD_ANGLE,
  WORD_DENSITY,
  BUBBLE_DENSITY,
} from '../lib/physics';
import Matter from 'matter-js';
import { buoyancyForce } from '../lib/fx';

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

describe('튕김 완화(restitution) — 보더 요청 SOO-1112 "덜 튕겨나가게"', () => {
  it('버블 튕김이 거의 0 에 가깝다(0.02 이하)', () => {
    const bubble = makeBubbleBody(0, 0, R);
    expect(bubble.restitution).toBeLessThanOrEqual(0.02);
  });

  it('단어 원 튕김이 완화되었다(0.1 이하)', () => {
    const word = makeWordBody(0, 0, R);
    expect(word.restitution).toBeLessThanOrEqual(0.1);
  });
});

describe('단어·버블 동일 비중(밀도) — 보더 요청 SOO-1112', () => {
  it('단어 밀도가 버블 밀도와 같다(SOO-1058 되돌림)', () => {
    expect(WORD_DENSITY).toBe(BUBBLE_DENSITY);
  });

  it('같은 반지름이면 단어 원과 버블의 질량이 같다', () => {
    const word = makeWordBody(0, 0, R);
    const bubble = makeBubbleBody(0, 0, R);
    // 면적 동일 + 밀도 동일 → 질량 동일.
    expect(word.mass).toBeCloseTo(bubble.mass, 5);
  });

  it('떠오르는 버블이 단어를 위로 밀어 올린다(밀어올림 invariant 유지)', () => {
    // 단어와 버블이 동밀도여도, 버블에만 부력이 실려 위로 떠오르며 단어를 밀어 올린다.
    const world = createStep1World(W, H, 1);
    const word = makeWordBody(W / 2, -R, R);
    addBody(world, word);
    run(world, 240);
    addCeiling(world);
    const restY = word.position.y;
    const bubble = makeBubbleBody(word.position.x, H - 6, 6);
    addBody(world, bubble);
    let peakLift = 0;
    for (let i = 1; i <= 300; i++) {
      bubble.force.y += buoyancyForce(
        bubble.mass,
        world.engine.gravity.y,
        world.engine.gravity.scale,
        1.7,
      );
      setCircleRadius(bubble, Math.min(R, 6 + (i / 60) * R));
      stepEngine(world, 16);
      peakLift = Math.min(peakLift, word.position.y - restY);
    }
    // 음수 = 밀려 올라감. 부력을 받은 버블이 단어를 실제로 밀어 올린다.
    expect(peakLift).toBeLessThan(0);
  });
});

describe('물리 — 떠오르는 보라 버블이 단어 원을 밀어 올린다(SOO-1057)', () => {
  it('하단 스폰 동적 버블이 부력으로 떠오른다', () => {
    const world = createStep1World(W, H, 1);
    const bubble = makeBubbleBody(W / 2, H - 6, 6); // 바닥선 근처에서 출발
    addBody(world, bubble);
    const startY = bubble.position.y;
    for (let i = 0; i < 120; i++) {
      // 매 스텝 중력을 상쇄·역전하는 부력을 실어 위로 띄운다.
      bubble.force.y += buoyancyForce(
        bubble.mass,
        world.engine.gravity.y,
        world.engine.gravity.scale,
        2,
      );
      stepEngine(world, 16);
    }
    // 위(y 감소)로 떠올랐다.
    expect(bubble.position.y).toBeLessThan(startY - 20);
  });

  it('떠오르는 버블이 위의 단어 원을 밀어 올린다', () => {
    const world = createStep1World(W, H, 1);
    const word = makeWordBody(W / 2, -R, R);
    addBody(world, word);
    run(world, 240); // 바닥에 안착
    addCeiling(world); // 정착 후 천장(실제 훅과 동일) — 버블이 밖으로 날아가지 않게.
    const restY = word.position.y;

    // 정착한 단어 바로 아래(바닥 근처)에 버블 생성 → 부력으로 떠오르며 성장,
    // 단어에 닿아 위로 밀어 올린다(BUOYANCY_FACTOR 와 같은 완만한 부력).
    const bubble = makeBubbleBody(word.position.x, H - 6, 6);
    addBody(world, bubble);
    // 상승 중 단어의 최고점(y 최소)을 추적 — 리프트는 과도(단어가 옆으로 미끄러져
    // 다시 내려올 수 있음)이므로 순간 최고점으로 상호작용을 검증한다.
    let peakLift = 0;
    for (let i = 1; i <= 300; i++) {
      bubble.force.y += buoyancyForce(
        bubble.mass,
        world.engine.gravity.y,
        world.engine.gravity.scale,
        1.7, // 실제 훅의 BUOYANCY_FACTOR
      );
      setCircleRadius(bubble, Math.min(R, 6 + (i / 60) * R)); // 성장
      stepEngine(world, 16);
      peakLift = Math.min(peakLift, word.position.y - restY);
    }

    // 상승 과정에서 단어가 안착 높이보다 뚜렷하게 위로 밀려 올라갔다.
    expect(peakLift).toBeLessThan(-20);
  });
});

describe('addCeiling — 떠오른 버블이 화면 밖으로 날아가지 않는다(SOO-1057)', () => {
  it('천장이 있으면 강한 부력에도 버블이 상단(y=0) 위로 넘어가지 않는다', () => {
    const world = createStep1World(W, H, 1);
    addCeiling(world);
    const bubble = makeBubbleBody(W / 2, H - 6, 20);
    addBody(world, bubble);
    for (let i = 0; i < 300; i++) {
      bubble.force.y += buoyancyForce(
        bubble.mass,
        world.engine.gravity.y,
        world.engine.gravity.scale,
        5, // 매우 강한 부력
      );
      stepEngine(world, 16);
    }
    // 천장에 막혀 중심이 반지름(≈20)만큼 아래에 머문다(상단을 뚫지 않음).
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
