import { describe, expect, it } from 'vitest';
import {
  CASCADE,
  CASCADE_ITEM_COUNT,
  cascadeDelay,
  cascadeTotal,
} from '../lib/treatyCascade';

describe('treaty cascade 파라미터 (SOO-1123)', () => {
  it('제목(order 0)은 지연 없이 즉시 등장한다', () => {
    expect(cascadeDelay(0)).toBe(0);
  });

  it('제1조는 제목 선행 시간(titleLead) 후 등장한다', () => {
    expect(cascadeDelay(1)).toBeCloseTo(CASCADE.titleLead, 6);
  });

  it('등장 지연은 순번에 따라 단조 증가한다', () => {
    for (let order = 1; order < CASCADE_ITEM_COUNT; order += 1) {
      expect(cascadeDelay(order)).toBeGreaterThan(cascadeDelay(order - 1));
    }
  });

  it('연속 항목 간 등장 간격은 동일하다(공유 오프셋 리듬)', () => {
    // 보더 규칙: 제n조 시작 = 직전 항목 최종 + 동일 오프셋 → 시간축에서 일정한 step.
    for (let order = 2; order < CASCADE_ITEM_COUNT; order += 1) {
      const gap = cascadeDelay(order) - cascadeDelay(order - 1);
      expect(gap).toBeCloseTo(CASCADE.step, 6);
    }
  });

  it('오버랩 허용: 항목 간격(step) < 항목 지속시간(itemDur)', () => {
    // 이전 항목이 정착하는 중 다음 항목이 등장 시작해야 cascade 리듬이 산다.
    expect(CASCADE.step).toBeLessThan(CASCADE.itemDur);
  });

  it('전체 소요 시간 = 마지막 항목 지연 + 지속시간', () => {
    const last = CASCADE_ITEM_COUNT - 1;
    expect(cascadeTotal()).toBeCloseTo(cascadeDelay(last) + CASCADE.itemDur, 6);
  });

  it('공유 시작 오프셋과 흐림 시작값은 양수다', () => {
    expect(CASCADE.offsetY).toBeGreaterThan(0);
    expect(CASCADE.blurPx).toBeGreaterThan(0);
  });
});
