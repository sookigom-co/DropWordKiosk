import { describe, it, expect } from 'vitest';
import {
  createStep1World,
  makeWordBody,
  makePurpleBody,
  addBody,
  setCircleRadius,
  stepEngine,
} from '../lib/physics';

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

describe('물리 — 보라 공 성장이 단어 원을 밀어 올린다', () => {
  it('정적 보라 공이 커지면 위에 있는 단어 원이 위로 밀린다', () => {
    const world = createStep1World(W, H, 1);
    const word = makeWordBody(W / 2, -R, R);
    addBody(world, word);
    run(world, 240); // 바닥에 안착
    const restY = word.position.y;

    // 단어 원 바로 아래(바닥 근처)에 보라 공 생성 후 점점 키운다.
    const purple = makePurpleBody(W / 2, H, 6);
    addBody(world, purple);
    for (let i = 1; i <= 60; i++) {
      setCircleRadius(purple, 6 + (i / 60) * 150); // 6 → 156px 반지름
      stepEngine(world, 16);
    }

    // 밀어 올려져 안착 높이보다 위(y 감소)로 이동.
    expect(word.position.y).toBeLessThan(restY - 5);
  });
});
