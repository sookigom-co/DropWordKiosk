import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { Target, Transition } from 'framer-motion';
import { ScreenFrame } from '../components/ScreenFrame';
import { NextButton } from '../components/NextButton';
import {
  TREATY_TITLE,
  TREATY_ARTICLES,
  formatTreatyFooterDate,
} from '../data/treaty';
import { CASCADE, cascadeDelay } from '../lib/treatyCascade';

interface Props {
  onNext: () => void;
}

const LEAD_TEXT =
  '지금까지 완성된 평화 협정문 제 1조부터 제9조에 이어,\n여러분이 선택한 단어로 마지막 제 10조를 완성해\n나만의 평화협정문을 만들어 보세요.';

// 노출 순번(order): 0 = 제목, 1..9 = 제1~9조, 10 = 제10조 빈칸, 11 = 작성일자.
const ORDER_BLANK = TREATY_ARTICLES.length + 1; // 10
const ORDER_DATE = ORDER_BLANK + 1; // 11

/**
 * 일반 항목(조문·빈칸·날짜)의 cascade 등장 모션 속성.
 * 최종 위치보다 offsetY 만큼 아래 + 흐림 + 투명에서 시작 → 제자리로 위로 이동하며 선명해진다.
 * reduced(모션 최소화 선호) 시 애니메이션 없이 즉시 표시.
 */
function itemReveal(order: number, reduced: boolean): {
  initial: Target | false;
  animate?: Target;
  transition?: Transition;
} {
  if (reduced) return { initial: false };
  return {
    initial: { opacity: 0, y: CASCADE.offsetY, filter: `blur(${CASCADE.blurPx}px)` },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    transition: { delay: cascadeDelay(order), duration: CASCADE.itemDur, ease: CASCADE.ease },
  };
}

/** 제목: 화면 중앙에서 크게 나타났다가(scale↑·아래) 상단 최종 위치로 축소·이동하며 정착. */
function titleReveal(reduced: boolean): {
  initial: Target | false;
  animate?: Target;
  transition?: Transition;
} {
  if (reduced) return { initial: false };
  return {
    initial: { opacity: 0, scale: CASCADE.titleScale, y: CASCADE.titleOffsetY },
    animate: { opacity: 1, scale: 1, y: 0 },
    transition: { delay: 0, duration: CASCADE.titleDur, ease: CASCADE.ease },
  };
}

/** 조문 한 줄 — cascade 등장. 텍스트는 완성본을 그대로 표시(타이핑 없음). */
function ArticleLine({ index, text, reduced }: { index: number; text: string; reduced: boolean }) {
  const line = `제 ${index + 1}조 ${text}`;
  return (
    <motion.p className="treaty__article" {...itemReveal(index + 1, reduced)}>
      {line}
    </motion.p>
  );
}

/**
 * 제10조 빈칸 마크업(1단계: 문서 내 인라인 / 2단계: 확대).
 * writing 단계에서는 cascade 로 등장(revealProps 주입), 완료 후 빈칸이 깜박인다.
 */
function BlankArticle({
  zoom,
  reveal,
}: {
  zoom?: boolean;
  reveal?: { initial: Target | false; animate?: Target; transition?: Transition };
}) {
  const className = zoom ? 'treaty-zoom__article' : 'treaty__article treaty__article--blank';
  const motionProps = reveal ?? {};
  return (
    <motion.p className={className} {...motionProps}>
      제 10조 우리는{' '}
      <span
        className={`treaty__blank-line treaty__blank-line--blink${
          zoom ? ' treaty__blank-line--zoom' : ''
        }`}
        aria-hidden="true"
      />
      <span className="visually-hidden">(빈칸)</span> .
    </motion.p>
  );
}

/**
 * 화면3 — 협정문.
 * 1단계(writing): 제목 → 제1~9조 → 제10조 빈칸 → 작성일자 순 cascade 노출
 *   (흐림→선명 + 공유 오프셋만큼 아래에서 위로 이동, SOO-1123) → 마지막 항목 정착 후 Next 노출.
 * 2단계(guide): Next 클릭 시 제10조 빈칸 확대 + 안내문구 + Next(다음 단계 진행).
 *
 * 인쇄 canvas/PNG 렌더러(treatyCanvas)는 미변경 — 본 화면 노출 애니메이션만 담당한다.
 */
export function TreatyScreen({ onNext }: Props) {
  const reduced = !!useReducedMotion();
  // 작성일자는 렌더 시점(마운트 1회)의 기기 로컬 시간 기준으로 동적 생성한다.
  const footerDate = useMemo(() => formatTreatyFooterDate(new Date()), []);
  const [phase, setPhase] = useState<'writing' | 'guide'>('writing');
  // 모션 최소화 선호 시 cascade 없이 즉시 전체 표시 + Next 노출.
  const [showNext, setShowNext] = useState(reduced);

  if (phase === 'guide') {
    return (
      <ScreenFrame label="평화 협정문 안내 화면">
        <motion.div
          className="treaty-zoom"
          initial={reduced ? false : { opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <BlankArticle zoom />
          <p className="screen__lead">{LEAD_TEXT}</p>
        </motion.div>
        {/* NEXT 는 하단 고정 바(.next-bar, position:fixed)로 렌더되므로,
            transform 이 걸리는 motion.div 밖에 두어 뷰포트 기준 고정을 보장한다(SOO-1039). */}
        <NextButton onClick={onNext} />
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame label="평화 협정문 화면">
      <article className="treaty">
        <motion.h2 className="treaty__title" {...titleReveal(reduced)}>
          {TREATY_TITLE}
        </motion.h2>
        {TREATY_ARTICLES.map((article, idx) => (
          <ArticleLine key={idx} index={idx} text={article} reduced={reduced} />
        ))}
        {/* 제10조 빈칸도 cascade 로 등장(order=10). 모든 항목이 흐름상 자리를 차지하므로
            translateY(transform) 이동은 레이아웃을 밀지 않는다 → 시프트 0. */}
        <BlankArticle reveal={itemReveal(ORDER_BLANK, reduced)} />
        {/* 서명부: 작성일자만 표기(SOO-1090). 마지막 순번(order=11)으로 등장하며,
            정착 완료 시점에 Next 를 노출한다. */}
        <motion.p
          className="treaty__footer"
          {...itemReveal(ORDER_DATE, reduced)}
          onAnimationComplete={reduced ? undefined : () => setShowNext(true)}
        >
          {footerDate}
        </motion.p>
      </article>

      {showNext && <NextButton onClick={() => setPhase('guide')} />}
    </ScreenFrame>
  );
}
