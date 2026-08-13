import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import { ScreenFrame } from '../components/ScreenFrame';
import { NextButton } from '../components/NextButton';
import { VERBS } from '../data/words';
import { createStep1World, makeBoxBody, addBody, stepEngine, bodyCenter } from '../lib/physics';

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNext: () => void;
}

/** 낱말 상자 높이(px). */
const CARD_H = 56;
/**
 * 낙하 릴리즈 밴드 — 상자를 위쪽 밖에서 순차적으로 떨어뜨려 차곡차곡 쌓이게 한다.
 * i 가 클수록 더 위(늦게 진입).
 */
const RELEASE_BASE = -80;
const RELEASE_STEP = 46;
const RELEASE_JITTER = 24;

/** 텍스트 길이로 상자 폭 추정(물리 바디와 DOM 박스 폭을 일치시킴). */
function cardWidth(text: string): number {
  return Math.round(text.length * 26 + 44);
}

interface CardRef {
  id: string;
  text: string;
  w: number;
  body: Matter.Body;
  el: HTMLButtonElement | null;
}

/**
 * 화면9 — STEP3 행동(동사) 선택.
 * 보라색 사각형 낱말 상자가 화면 상단에서 matter-js 중력으로 떨어져
 * 회전 없이(각도 0 고정) 바닥·서로 위에 차곡차곡 쌓인다.
 * Step 1/2 물리 트랙(useStep1Physics·lib/physics·lib/fx)과 같은 계열의 낙하 효과.
 * 상단 제목(eyebrow)은 렌더하지 않는다(SOO-1056 보더 요청).
 */
export function Step3Sorted({ selectedId, onSelect, onNext }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<CardRef[]>([]);
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

    const cards: CardRef[] = VERBS.map((verb, i) => {
      const w = cardWidth(verb.text);
      const x = clamp(40 + Math.random() * (W - 80), w / 2, W - w / 2);
      const y = RELEASE_BASE - i * RELEASE_STEP - Math.random() * RELEASE_JITTER; // 위쪽 밖
      const body = makeBoxBody(x, y, w, CARD_H); // 회전 금지(inertia = Infinity)
      // 각속도는 주지 않는다(회전 방지). 아래 방향 속도만 살짝.
      Matter.Body.setVelocity(body, { x: 0, y: 1 + Math.random() });
      addBody(world, body);
      return { id: verb.id, text: verb.text, w, body, el: null };
    });
    cardsRef.current = cards;

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
              className="word-card word-card--purple"
              aria-pressed={selectedId === c.id}
              style={{
                width: c.w,
                height: CARD_H,
                top: 0,
                left: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 18px',
                fontSize: 'clamp(20px, 3vw, 28px)',
              }}
              ref={(el) => {
                cardsRef.current[idx].el = el;
              }}
              onClick={() => onSelect(c.id)}
            >
              {c.text}
            </button>
          ))}
      </div>
      <NextButton onClick={onNext} disabled={selectedId === null} />
    </ScreenFrame>
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
