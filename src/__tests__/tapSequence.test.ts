import { describe, it, expect } from 'vitest';
import {
  ADMIN_TAP_COUNT,
  ADMIN_TAP_WINDOW_MS,
  pushTap,
  tapTriggered,
} from '../lib/tapSequence';

describe('tapSequence (SOO-1170)', () => {
  it('시간 창 안의 5회 연속 탭이면 트리거된다', () => {
    let history: number[] = [];
    // 0, 200, 400, 600, 800ms 에 탭 → 3초 창 안 5회
    for (const t of [0, 200, 400, 600, 800]) {
      history = pushTap(history, t, ADMIN_TAP_WINDOW_MS);
    }
    expect(history).toHaveLength(5);
    expect(tapTriggered(history, ADMIN_TAP_COUNT)).toBe(true);
  });

  it('창을 벗어난 오래된 탭은 버려져 오탐하지 않는다', () => {
    let history: number[] = [];
    // 3초 넘게 띄엄띄엄 누르면 이력이 5개까지 쌓이지 않는다
    for (const t of [0, 1000, 2000, 3100, 4200]) {
      history = pushTap(history, t, ADMIN_TAP_WINDOW_MS);
    }
    // 마지막 탭(4200) 기준 창(1200~4200) 안: 2000, 3100, 4200 → 3개
    expect(history).toEqual([2000, 3100, 4200]);
    expect(tapTriggered(history, ADMIN_TAP_COUNT)).toBe(false);
  });

  it('4회로는 트리거되지 않는다(오탐 방지)', () => {
    let history: number[] = [];
    for (const t of [0, 100, 200, 300]) {
      history = pushTap(history, t, ADMIN_TAP_WINDOW_MS);
    }
    expect(tapTriggered(history, ADMIN_TAP_COUNT)).toBe(false);
  });

  it('경계값: 정확히 window 만큼 지난 탭은 창에서 제외된다', () => {
    let history: number[] = [0];
    history = pushTap(history, ADMIN_TAP_WINDOW_MS, ADMIN_TAP_WINDOW_MS);
    // now - t < windowMs 이므로 now-0 = 3000 은 < 3000 이 아님 → 0 은 제외
    expect(history).toEqual([ADMIN_TAP_WINDOW_MS]);
  });
});
