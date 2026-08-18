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
  clampBoxBodyToStage,
  WORD_BOX_SCALE,
} from '../lib/physics';
import { mulberry32, shuffleIndices, randomBoxX } from '../lib/fx';

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNext: () => void;
}

/**
 * 낱말 상자 높이(px). SOO-1061: 보더 요청으로 확대(최초 1.5배 → 1.3배 → 후속 조정 1.2배) →
 * 공용 `WORD_BOX_SCALE`(1.1) 반영(56→62). 폭(cardWidth)·폰트·패딩·물리 바디도 동일 배율.
 * 장식 보라 사각형(SQUARE_*)은 낱말 상자가 아니므로 대상 밖 — 크기 유지.
 */
const CARD_H = Math.round(56 * WORD_BOX_SCALE);
/**
 * 장식용 보라색 사각형 개수(SOO-1056 보더 재요청 `8b1b6614`).
 * Step 2 의 주황(노란) 원과 같은 역할 — 글자 없고 아무 기능 없는 순수 장식 파티클.
 * SOO-1110: 카드와 같은 랜덤 낙하 순서·랜덤 x 풀을 공유한다(세로 보라 기둥·슬롯 공유 문제 해소).
 */
const SQUARE_COUNT = 6;
/** 장식 사각형 한 변 길이(px) 기준·증분 — 결정적(랜덤 제거, index 로 변주). */
const SQUARE_MIN = 30;
const SQUARE_STEP = 6;
/**
 * 낙하 릴리즈 밴드 — 상자·장식 사각형을 위쪽 밖에서 순차적으로 떨어뜨려
 * 차곡차곡 쌓이게 한다. 슬롯이 클수록 더 위(늦게 진입).
 *
 * SOO-1110: 낙하 순서를 랜덤화(`shuffleIndices`)하고 x 위치도 랜덤(`randomBoxX`)으로 바꾼다.
 * 스폰 겹침을 원천 차단하기 위해 릴리즈 간격(RELEASE_STEP)을 가장 큰 낙하 상자 높이(CARD_H=62)
 * 보다 크게(90) 둔다 → 두 상자가 같은 x 로 나더라도 스폰 시점에 세로로 절대 겹치지 않는다.
 * 정착 후 겹침은 matter-js 솔버(positionIterations 10)가 밀어내 해소한다.
 */
const RELEASE_BASE = -80;
const RELEASE_STEP = 90;

/** 슬롯 인덱스 → 초기 y(위쪽 밖). 결정적. */
function slotY(slot: number): number {
  return RELEASE_BASE - slot * RELEASE_STEP;
}

/** 텍스트 길이로 상자 폭 추정(물리 바디와 DOM 박스 폭을 일치시킴). WORD_BOX_SCALE(1.1) 반영. */
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

    // SOO-1110 낙하 랜덤화: 기존 '기억된 고정 위치(brickStackX/spreadX)' 대신
    // ①낙하 순서(어느 상자가 먼저·아래에서 떨어질지)와 ②x 위치를 모두 무작위로 정한다.
    // 세션마다 다른 배치를 위해 마운트 시 Math.random() 으로 시드를 뽑고, 실제 난수열은
    // 그 시드 기반 결정적 PRNG(mulberry32)로 재생 → 한 마운트 안에서는 재현 가능(디버깅 용이).
    const rng = mulberry32(Math.floor(Math.random() * 0xffffffff));

    // 카드(18) + 장식 사각형(6) 을 하나의 릴리즈 순서 위에 무작위로 흩뿌린다.
    // slots[k] = k번째 아이템(0..N-1)에 배정된 릴리즈 슬롯 = 낙하 순서. RELEASE_STEP(90)>최대
    // 상자 높이(62)라 슬롯이 다르면 스폰 시점에 세로로 절대 겹치지 않는다(스폰 겹침 원천 차단).
    const N = VERBS.length + SQUARE_COUNT;
    const slots = shuffleIndices(N, rng);

    const cards: CardRef[] = VERBS.map((verb, i) => {
      const w = cardWidth(verb.text);
      const x = randomBoxX(rng(), W, w / 2); // 낙하 x 위치 랜덤(경계 안으로 이미 클램프)
      const y = slotY(slots[i]); // 낙하 순서 랜덤
      const body = makeBoxBody(x, y, w, CARD_H); // 회전 금지(inertia = Infinity)
      // 각속도는 주지 않는다(회전 방지). 아래 방향 속도만 살짝(좌우 편향 없음).
      Matter.Body.setVelocity(body, { x: 0, y: 1 });
      addBody(world, body);
      return { id: verb.id, text: verb.text, w, body, el: null };
    });
    cardsRef.current = cards;

    // 장식용 보라 사각형 — 글자·기능 없음(aria-hidden). 카드와 같은 릴리즈 순서 풀을 공유해
    // 무작위 슬롯·무작위 x 로 떨어진다(카드 사이사이에 자연스럽게 섞임).
    const squares: SquareRef[] = Array.from({ length: SQUARE_COUNT }, (_, i) => {
      const size = SQUARE_MIN + (i % 4) * SQUARE_STEP; // 30~48px 결정적 변주
      const x = randomBoxX(rng(), W, size / 2); // 낙하 x 위치 랜덤
      const y = slotY(slots[VERBS.length + i]); // 낙하 순서 랜덤(카드와 공유 풀)
      const body = makeBoxBody(x, y, size, size); // 회전 금지(inertia = Infinity)
      Matter.Body.setVelocity(body, { x: 0, y: 1 });
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
      // SOO-1110 경계 이탈 방지(최후 방어선): 매 틱 상자 중심을 스테이지 안으로 클램프한다.
      // clampTop=false — 위(y<0)에서 떨어져 들어오는 낙하 진입은 막지 않고, 하단·좌·우만 강제.
      for (const c of cards) clampBoxBodyToStage(c.body, c.w / 2, CARD_H / 2, W, H, false);
      for (const sq of squares) clampBoxBodyToStage(sq.body, sq.size / 2, sq.size / 2, W, H, false);
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
