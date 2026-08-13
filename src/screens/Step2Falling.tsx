import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import { ScreenFrame } from '../components/ScreenFrame';
import { NextButton } from '../components/NextButton';
import { ADJECTIVES } from '../data/words';
import { purpleScaleRadius, referenceBubblePx, interleavedReleaseSlots } from '../lib/fx';
import { WORD_BOX_SCALE } from '../lib/physics';

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNext: () => void;
}

/**
 * 낱말카드 크기 배율 — SOO-1054 1.5배 후 보더 후속 요청으로 80% 축소(1.5×0.8=1.2).
 * SOO-1061: 보더 요청으로 재확대(최초 1.5배 → 후속 조정 1.3배) → 현재 배율(1.2)에 공용
 * `WORD_BOX_SCALE`(1.3)을 곱해 유효 배율 1.56. 폭·높이·폰트·패딩·물리 바디 모두 동일 반영.
 */
const CARD_SCALE = 1.2 * WORD_BOX_SCALE;
const CARD_H = Math.round(52 * CARD_SCALE);
/** 주황 원 크기 배율 — 보더 요청(SOO-1054 후속) 0.5배 축소. */
const CIRCLE_SCALE = 0.5;
const WALL = 60;
const PARTICLE_COUNT = 12;
/**
 * 낙하 회전 감소(SOO-1054) — 초기 기울기와 각속도를 대폭 줄인다.
 * 이전: 기울기 ±0.25rad, 각속도 ±0.03 → 현재: 기울기 ±0.06rad, 각속도 ±0.006.
 */
const INIT_ANGLE_RANGE = 0.12;
const INIT_ANGULAR_VELOCITY = 0.012;
/**
 * 낙하 릴리즈 밴드(SOO-1054 후속 — 보더 요청 "카드·원이 더 고르게 떨어지게").
 * 카드와 원을 하나의 공통 릴리즈 순서(슬롯) 위에 균등 교차 배치한다.
 * 이전엔 원이 카드보다 아래(-60 vs -80)에서 촘촘히 시작해 먼저 뭉쳐 진입했다.
 */
const RELEASE_BASE = -80;
const RELEASE_STEP = 40;
const RELEASE_JITTER = 24;

/** 슬롯 인덱스 → 초기 y(위쪽 밖). 슬롯이 클수록 더 위(늦게 진입). */
function slotY(slot: number): number {
  return RELEASE_BASE - slot * RELEASE_STEP - Math.random() * RELEASE_JITTER;
}

/** 텍스트 길이로 카드 폭 추정(물리 바디와 DOM 카드 폭을 일치시킴). CARD_SCALE 반영. */
function cardWidth(text: string): number {
  return Math.round((text.length * 26 + 36) * CARD_SCALE);
}

interface CardRef {
  id: string;
  text: string;
  w: number;
  body: Matter.Body;
  el: HTMLButtonElement | null;
}

interface ParticleRef {
  r: number;
  body: Matter.Body;
  el: HTMLDivElement | null;
}

/**
 * 화면7 — STEP2 형용사 선택.
 * 낱말카드가 상단에서 물리(matter.js)로 쏟아져 바닥에 쌓인다.
 * 속도·위치에 편차를 주고, 주황색 원 파티클이 함께 떨어져 카드 사이에서 튕긴다.
 * 카드를 탭하면 선택된다.
 */
export function Step2Falling({ selectedId, onSelect, onNext }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<CardRef[]>([]);
  const particlesRef = useRef<ParticleRef[]>([]);
  const [ready, setReady] = useState(false);
  // 선택 상태를 DOM className 으로 반영하기 위한 재렌더 트리거
  const [, force] = useState(0);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    if (W === 0 || H === 0) return;

    const engine = Matter.Engine.create();
    engine.gravity.y = 1;
    const world = engine.world;

    // 벽(바닥/좌/우) — 화면 밖으로 못 나가게
    const floor = Matter.Bodies.rectangle(W / 2, H + WALL / 2, W + WALL * 2, WALL, {
      isStatic: true,
    });
    const left = Matter.Bodies.rectangle(-WALL / 2, H / 2, WALL, H * 2, { isStatic: true });
    const right = Matter.Bodies.rectangle(W + WALL / 2, H / 2, WALL, H * 2, { isStatic: true });
    Matter.Composite.add(world, [floor, left, right]);

    // 카드·원을 하나의 릴리즈 순서에 균등 교차 배치(SOO-1054 후속).
    // 원이 배정받은 슬롯을 제외한 나머지 슬롯을 카드가 순서대로 차지한다.
    const circleSlotSet = new Set(interleavedReleaseSlots(ADJECTIVES.length, PARTICLE_COUNT));
    const cardSlots: number[] = [];
    for (let s = 0; cardSlots.length < ADJECTIVES.length; s++) {
      if (!circleSlotSet.has(s)) cardSlots.push(s);
    }
    const circleSlots = [...circleSlotSet].sort((a, b) => a - b);

    // 카드 바디 생성 (초기엔 화면 위쪽 밖에 배치했다가 순차 낙하 느낌)
    const cards: CardRef[] = ADJECTIVES.map((adj, i) => {
      const w = cardWidth(adj.text);
      const x = clamp(40 + Math.random() * (W - 80), w / 2, W - w / 2);
      const y = slotY(cardSlots[i]); // 위쪽 밖, 공통 릴리즈 밴드
      const body = Matter.Bodies.rectangle(x, y, w, CARD_H, {
        restitution: 0.35,
        friction: 0.35,
        frictionAir: 0.01,
        angle: (Math.random() - 0.5) * INIT_ANGLE_RANGE,
      });
      Matter.Body.setVelocity(body, { x: (Math.random() - 0.5) * 2, y: 1 + Math.random() * 2 });
      Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * INIT_ANGULAR_VELOCITY);
      return { id: adj.id, text: adj.text, w, body, el: null };
    });
    Matter.Composite.add(
      world,
      cards.map((c) => c.body),
    );
    cardsRef.current = cards;

    // 주황 원 파티클 — 크기는 Step1 보라 원과 같은 스케일 대역에서 랜덤(SOO-1054)
    const refBubble = referenceBubblePx(W);
    const particles: ParticleRef[] = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const r = purpleScaleRadius(refBubble, Math.random()) * CIRCLE_SCALE;
      const x = clamp(40 + Math.random() * (W - 80), r, W - r);
      const y = slotY(circleSlots[i]); // 카드와 동일한 공통 릴리즈 밴드(교차 배치)
      const body = Matter.Bodies.circle(x, y, r, {
        restitution: 0.6,
        friction: 0.2,
        frictionAir: 0.01,
      });
      // 카드와 비슷한 초기 하강 속도로 맞춰 원만 먼저 앞서 떨어지지 않게 함
      Matter.Body.setVelocity(body, { x: (Math.random() - 0.5) * 2, y: 1 + Math.random() * 2 });
      return { r, body, el: null };
    });
    Matter.Composite.add(
      world,
      particles.map((p) => p.body),
    );
    particlesRef.current = particles;

    setReady(true);

    // 수동 RAF 루프 (Matter.Runner 대신 브라우저 프레임에 동기화)
    let raf = 0;
    let last = 0;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick = (t: number) => {
      const dt = last ? Math.min(t - last, 32) : 16;
      last = t;
      Matter.Engine.update(engine, dt);
      for (const c of cards) {
        if (c.el) {
          const { x, y } = c.body.position;
          c.el.style.transform = `translate(${x - c.w / 2}px, ${y - CARD_H / 2}px) rotate(${c.body.angle}rad)`;
        }
      }
      for (const p of particles) {
        if (p.el) {
          const { x, y } = p.body.position;
          p.el.style.transform = `translate(${x - p.r}px, ${y - p.r}px)`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    // reduced-motion: 한 번만 정착시켜 애니메이션 최소화
    if (prefersReduced) {
      for (let i = 0; i < 240; i++) Matter.Engine.update(engine, 16);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      Matter.World.clear(world, false);
      Matter.Engine.clear(engine);
    };
  }, []);

  // selectedId 변경 시 카드 className 갱신
  useEffect(() => {
    force((n) => n + 1);
  }, [selectedId]);

  return (
    <ScreenFrame label="STEP2 수식어 선택 화면">
      <div className="card-stage" ref={stageRef} role="group" aria-label="선택한 대상을 표현할 말">
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
                // 물리 바디(CARD_SCALE)와 DOM 박스를 정확히 일치시키고 글자도 함께 비례 축소
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                // 패딩·폰트도 물리/시각 배율과 동일하게 1.5배(SOO-1061): 18→27px, 폰트 clamp ×1.5.
                padding: '0 27px',
                fontSize: 'clamp(33px, 5.04vw, 46px)',
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
          particlesRef.current.map((p, idx) => (
            <div
              key={`p-${idx}`}
              aria-hidden="true"
              ref={(el) => {
                particlesRef.current[idx].el = el;
              }}
              style={{
                position: 'absolute',
                width: p.r * 2,
                height: p.r * 2,
                borderRadius: '50%',
                background: 'var(--accent-orange)',
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
