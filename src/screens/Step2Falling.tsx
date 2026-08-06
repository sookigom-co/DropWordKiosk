import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import { ScreenFrame } from '../components/ScreenFrame';
import { NextButton } from '../components/NextButton';
import { ADJECTIVES } from '../data/words';

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNext: () => void;
}

const CARD_H = 52;
const WALL = 60;
const PARTICLE_COUNT = 12;
const PARTICLE_R = 12;

/** 텍스트 길이로 카드 폭 추정(물리 바디와 DOM 카드 폭을 일치시킴) */
function cardWidth(text: string): number {
  return Math.round(text.length * 26 + 36);
}

interface CardRef {
  id: string;
  text: string;
  w: number;
  body: Matter.Body;
  el: HTMLButtonElement | null;
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
  const particlesRef = useRef<{ body: Matter.Body; el: HTMLDivElement | null }[]>([]);
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

    // 카드 바디 생성 (초기엔 화면 위쪽 밖에 배치했다가 순차 낙하 느낌)
    const cards: CardRef[] = ADJECTIVES.map((adj, i) => {
      const w = cardWidth(adj.text);
      const x = clamp(40 + Math.random() * (W - 80), w / 2, W - w / 2);
      const y = -80 - i * 46 - Math.random() * 40; // 위쪽 밖, 편차
      const body = Matter.Bodies.rectangle(x, y, w, CARD_H, {
        restitution: 0.35,
        friction: 0.35,
        frictionAir: 0.01,
        angle: (Math.random() - 0.5) * 0.5,
      });
      Matter.Body.setVelocity(body, { x: (Math.random() - 0.5) * 2, y: 1 + Math.random() * 2 });
      Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.06);
      return { id: adj.id, text: adj.text, w, body, el: null };
    });
    Matter.Composite.add(
      world,
      cards.map((c) => c.body),
    );
    cardsRef.current = cards;

    // 주황 원 파티클
    const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const x = 40 + Math.random() * (W - 80);
      const y = -60 - i * 30 - Math.random() * 60;
      const body = Matter.Bodies.circle(x, y, PARTICLE_R, {
        restitution: 0.6,
        friction: 0.2,
        frictionAir: 0.01,
      });
      Matter.Body.setVelocity(body, { x: (Math.random() - 0.5) * 3, y: 1 });
      return { body, el: null as HTMLDivElement | null };
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
          p.el.style.transform = `translate(${x - PARTICLE_R}px, ${y - PARTICLE_R}px)`;
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
      <p className="screen__eyebrow">STEP 2. 수식어 선택</p>
      <div className="card-stage" ref={stageRef} role="group" aria-label="선택한 대상을 표현할 말">
        {ready &&
          cardsRef.current.map((c, idx) => (
            <button
              key={c.id}
              type="button"
              className="word-card"
              aria-pressed={selectedId === c.id}
              style={{ width: c.w, top: 0, left: 0 }}
              ref={(el) => {
                cardsRef.current[idx].el = el;
              }}
              onClick={() => onSelect(c.id)}
            >
              {c.text}
            </button>
          ))}
        {ready &&
          particlesRef.current.map((_p, idx) => (
            <div
              key={`p-${idx}`}
              aria-hidden="true"
              ref={(el) => {
                particlesRef.current[idx].el = el;
              }}
              style={{
                position: 'absolute',
                width: PARTICLE_R * 2,
                height: PARTICLE_R * 2,
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
