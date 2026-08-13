import { describe, it, expect } from 'vitest';
import {
  createStep1World,
  makeWordBody,
  makeBoxBody,
  makeBubbleBody,
  addBody,
  addCeiling,
  setCircleRadius,
  stepEngine,
  WORD_DENSITY,
  BUBBLE_DENSITY,
} from '../lib/physics';
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

describe('단어 무게 — 버블보다 무겁게 가라앉는 질감(SOO-1058)', () => {
  it('단어 밀도가 버블 밀도보다 크다', () => {
    expect(WORD_DENSITY).toBeGreaterThan(BUBBLE_DENSITY);
  });

  it('같은 반지름이면 단어 원이 버블보다 무겁다(질량↑)', () => {
    const word = makeWordBody(0, 0, R);
    const bubble = makeBubbleBody(0, 0, R);
    expect(word.mass).toBeGreaterThan(bubble.mass);
    // 밀도 비율만큼(면적 동일) 질량비가 밀도비와 일치한다.
    expect(word.mass / bubble.mass).toBeCloseTo(WORD_DENSITY / BUBBLE_DENSITY, 5);
  });

  it('무거운 단어는 같은 크기 버블의 부력에 덜 밀린다(가벼운 단어 대비)', () => {
    // 동일 초기 배치에서, 무거운 단어(실제)와 가벼운 단어(버블과 동밀도)를 비교해
    // 무거운 쪽이 버블에 덜 밀려 올라간다(가라앉는 질감).
    const lift = (wordDensity: number): number => {
      const world = createStep1World(W, H, 1);
      const word = makeWordBody(W / 2, -R, R);
      // 비교용으로 단어 밀도만 바꿔 재설정(matter Body.setDensity 대신 직접 계산 비교는
      // 물리 상호작용을 봐야 하므로 실제 시뮬레이션으로 측정한다).
      const scale = wordDensity / WORD_DENSITY;
      word.mass *= scale;
      word.inverseMass = 1 / word.mass;
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
      return peakLift; // 음수일수록 많이 밀려 올라감
    };
    const heavy = lift(WORD_DENSITY);
    const light = lift(BUBBLE_DENSITY);
    // 무거운 단어의 최고 리프트가 가벼운 단어보다 작다(덜 올라감 = 값이 더 큼/덜 음수).
    expect(heavy).toBeGreaterThan(light);
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
