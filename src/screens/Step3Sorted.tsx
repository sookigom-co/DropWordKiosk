import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import { ScreenFrame } from '../components/ScreenFrame';
import { NextButton } from '../components/NextButton';
import { VERBS } from '../data/words';
import {
  createStep1World,
  makeBoxBody,
  addBody,
  stepEngine,
  bodyCenter,
  WORD_BOX_SCALE,
} from '../lib/physics';
import { interleavedReleaseSlots } from '../lib/fx';

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNext: () => void;
}

/**
 * 낱말 상자 높이(px). SOO-1061: 보더 요청으로 확대(최초 1.5배 → 후속 조정 1.3배) →
 * 공용 `WORD_BOX_SCALE`(1.3) 반영(56→73). 폭(cardWidth)·폰트·패딩·물리 바디도 동일 배율.
 * 장식 보라 사각형(SQUARE_*)은 낱말 상자가 아니므로 대상 밖 — 크기 유지.
 */
const CARD_H = Math.round(56 * WORD_BOX_SCALE);
/**
 * 장식용 보라색 사각형 개수(SOO-1056 보더 재요청 `8b1b6614`).
 * Step 2 의 주황(노란) 원과 같은 역할 — 글자 없고 아무 기능 없는 순수 장식 파티클.
 */
const SQUARE_COUNT = 10;
/** 장식 사각형 한 변 길이(px) 범위 — 낱말 상자보다 작게 랜덤. */
const SQUARE_MIN = 30;
const SQUARE_RANGE = 24;
/**
 * 낙하 릴리즈 밴드 — 상자·장식 사각형을 위쪽 밖에서 순차적으로 떨어뜨려
 * 차곡차곡 쌓이게 한다. 슬롯이 클수록 더 위(늦게 진입).
 */
const RELEASE_BASE = -80;
const RELEASE_STEP = 46;
const RELEASE_JITTER = 24;

/** 슬롯 인덱스 → 초기 y(위쪽 밖). */
function slotY(slot: number): number {
  return RELEASE_BASE - slot * RELEASE_STEP - Math.random() * RELEASE_JITTER;
}

/** 텍스트 길이로 상자 폭 추정(물리 바디와 DOM 박스 폭을 일치시킴). WORD_BOX_SCALE(1.3) 반영. */
function cardWidth(text: string): number {
  return Math.round((text.length * 26 + 44) * WORD_BOX_SCALE);
}

interface CardRef {
  id: string;
  text: string;
  w: number;
  body: Matter.Body;
  el: HTMLButtonElement | null;
}

interface SquareRef {
  size: number;
  body: Matter.Body;
  el: HTMLDivElement | null;
}

/**
 * 화면9 — STEP3 행동(동사) 선택.
 *
 * 보더 재요청(SOO-1056 코멘트 `8b1b6614`): 텍스트가 든 **낱말 상자는 Step 2 와 동일하게
 * 검은 테두리·흰 바탕**(`.word-card`)으로 두고, 여기에 **글자 없고 아무 기능 없는
 * 보라색 사각형**이 함께 떨어진다. 이 보라 사각형은 Step 2 의 주황(노란) 원과 같은
 * 순수 장식 역할이다.
 *
 * 낱말 상자·장식 사각형 모두 `makeBoxBody`(inertia = Infinity)로 회전 없이(각도 0 고정)
 * 화면 상단에서 matter-js 중력으로 떨어져 바닥·서로 위에 차곡차곡 쌓인다.
 * Step 1/2 물리 트랙(lib/physics·lib/fx)과 같은 계열의 낙하 효과.
 * 상단 제목(eyebrow)은 렌더하지 않는다.
 */
export function Step3Sorted({ selectedId, onSelect, onNext }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<CardRef[]>([]);
  const squaresRef = useRef<SquareRef[]>([]);
  const [ready, setReady] = useState(false);
  // 선택 상태를 DOM className 으로 반영하기 위한 재렌더 트리거
  const [, force] = useState(0);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    if (W === 0 || H === 0) return;

    // Step 1 물리 월드 재사용(좌·우·바닥 벽 — 천장 없음, 위에서 떨어뜨림).
    const world = createStep1World(W, H, 1);

    // 낱말 상자와 장식 사각형을 하나의 공통 릴리즈 순서에 균등 교차 배치(Step 2 방식).
    // 사각형이 배정받은 슬롯을 제외한 나머지를 낱말 상자가 순서대로 차지한다.
    const squareSlotSet = new Set(interleavedReleaseSlots(VERBS.length, SQUARE_COUNT));
    const cardSlots: number[] = [];
    for (let s = 0; cardSlots.length < VERBS.length; s++) {
      if (!squareSlotSet.has(s)) cardSlots.push(s);
    }
    const squareSlots = [...squareSlotSet].sort((a, b) => a - b);

    const cards: CardRef[] = VERBS.map((verb, i) => {
      const w = cardWidth(verb.text);
      const x = clamp(40 + Math.random() * (W - 80), w / 2, W - w / 2);
      const y = slotY(cardSlots[i]); // 위쪽 밖, 공통 릴리즈 밴드
      const body = makeBoxBody(x, y, w, CARD_H); // 회전 금지(inertia = Infinity)
      // 각속도는 주지 않는다(회전 방지). 아래 방향 속도만 살짝.
      Matter.Body.setVelocity(body, { x: 0, y: 1 + Math.random() });
      addBody(world, body);
      return { id: verb.id, text: verb.text, w, body, el: null };
    });
    cardsRef.current = cards;

    // 장식용 보라 사각형 — 글자·기능 없음(aria-hidden). 회전 없이 낱말 상자와 함께 적재.
    const squares: SquareRef[] = Array.from({ length: SQUARE_COUNT }, (_, i) => {
      const size = Math.round(SQUARE_MIN + Math.random() * SQUARE_RANGE);
      const x = clamp(40 + Math.random() * (W - 80), size / 2, W - size / 2);
      const y = slotY(squareSlots[i]); // 낱말 상자와 동일한 공통 릴리즈 밴드(교차 배치)
      const body = makeBoxBody(x, y, size, size); // 회전 금지(inertia = Infinity)
      Matter.Body.setVelocity(body, { x: 0, y: 1 + Math.random() });
      addBody(world, body);
      return { size, body, el: null };
    });
    squaresRef.current = squares;

    setReady(true);

    // 수동 RAF 루프 (Matter.Runner 대신 브라우저 프레임에 동기화)
    let raf = 0;
    let last = 0;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick = (t: number) => {
      const dt = last ? Math.min(t - last, 32) : 16;
      last = t;
      stepEngine(world, dt);
      for (const c of cards) {
        if (c.el) {
          const { x, y } = bodyCenter(c.body);
          // 회전 없이 위치만 반영(각도 0 고정).
          c.el.style.transform = `translate(${x - c.w / 2}px, ${y - CARD_H / 2}px)`;
        }
      }
      for (const sq of squares) {
        if (sq.el) {
          const { x, y } = bodyCenter(sq.body);
          sq.el.style.transform = `translate(${x - sq.size / 2}px, ${y - sq.size / 2}px)`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    // reduced-motion: 한 번만 정착시켜 애니메이션 최소화
    if (prefersReduced) {
      for (let i = 0; i < 240; i++) stepEngine(world, 16);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      Matter.World.clear(world.engine.world, false);
      Matter.Engine.clear(world.engine);
    };
  }, []);

  // selectedId 변경 시 카드 className 갱신
  useEffect(() => {
    force((n) => n + 1);
  }, [selectedId]);

  return (
    <ScreenFrame label="STEP3 행동 선택 화면">
      <div className="card-stage" ref={stageRef} role="group" aria-label="약속을 완성할 행동">
        {ready &&
          cardsRef.current.map((c, idx) => (
            <button
              key={c.id}
              type="button"
              className="word-card"
              aria-pressed={selectedId === c.id}
              style={{
                width: c.w,
                height: CARD_H,
                top: 0,
                left: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                // 패딩·폰트도 물리/시각 배율과 동일하게 1.5배(SOO-1061): 18→27px, 폰트 clamp ×1.5.
                padding: '0 27px',
                fontSize: 'clamp(30px, 4.5vw, 42px)',
              }}
              ref={(el) => {
                cardsRef.current[idx].el = el;
              }}
              onClick={() => onSelect(c.id)}
            >
              {c.text}
            </button>
          ))}
        {ready &&
          squaresRef.current.map((sq, idx) => (
            <div
              key={`sq-${idx}`}
              aria-hidden="true"
              ref={(el) => {
                squaresRef.current[idx].el = el;
              }}
              style={{
                position: 'absolute',
                width: sq.size,
                height: sq.size,
                borderRadius: 6,
                background: 'var(--accent-purple)',
                top: 0,
                left: 0,
                pointerEvents: 'none',
              }}
            />
          ))}
      </div>
      <NextButton onClick={onNext} disabled={selectedId === null} />
    </ScreenFrame>
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
