import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ScreenFrame } from '../components/ScreenFrame';
import { NextButton } from '../components/NextButton';
import { typingFrames } from '../lib/jamo';
import {
  TREATY_TITLE,
  TREATY_ARTICLES,
  TREATY_FOOTER_PLACE,
  formatTreatyFooterDate,
} from '../data/treaty';

interface Props {
  onNext: () => void;
}

// 타이밍 상수(조정 가능).
// 제1~9조는 동시에 타이핑을 시작한다(보더 요청: 각 라인 동시 출력).
// 전체 소요 시간 = 가장 긴 조문 1개의 타이핑 시간(~수 초).
const TYPING_INTERVAL_MS = 30; // 자모 프레임 1개당 진행 간격
const NEXT_REVEAL_DELAY_MS = 500; // 10조 빈칸 깜박임 표출 후 Next 노출 지연

const LEAD_TEXT =
  '지금까지 완성된 평화 협정문 제 1조부터 제9조에 이어,\n여러분이 선택한 단어로 마지막 제 10조를 완성해\n나만의 평화협정문을 만들어 보세요.';

/**
 * 자모(자음·모음) 분리 타자기 효과 훅.
 * active 가 true 인 동안 프레임을 순차 진행하고, 완료 시 onDone 을 1회 호출한다.
 */
function useJamoTyping(text: string, active: boolean, onDone?: () => void): string {
  const frames = useMemo(() => typingFrames(text), [text]);
  const [idx, setIdx] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!active) return;
    let fired = false;
    let i = 0;
    setIdx(0);
    const finish = () => {
      if (!fired) {
        fired = true;
        onDoneRef.current?.();
      }
    };
    if (frames.length <= 1) {
      finish();
      return;
    }
    const id = setInterval(() => {
      i += 1;
      setIdx(i);
      if (i >= frames.length - 1) {
        clearInterval(id);
        finish();
      }
    }, TYPING_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active, frames]);

  return frames[Math.min(idx, frames.length - 1)];
}

interface ArticleLineProps {
  index: number;
  text: string;
  active: boolean;
  done: boolean;
  onDone: () => void;
}

/** 조문 한 줄 — active 이면 자모 타이핑, done 이면 완성 텍스트 정적 표시. */
function ArticleLine({ index, text, active, done, onDone }: ArticleLineProps) {
  const line = `제 ${index + 1}조 ${text}`;
  const typed = useJamoTyping(line, active, onDone);
  const shown = done ? line : active ? typed : '';
  return (
    <p className="treaty__article">
      <span aria-hidden="true">{shown}</span>
      {/* 스크린리더는 애니메이션과 무관하게 완성 조문 전체를 읽는다. */}
      <span className="visually-hidden">{line}</span>
    </p>
  );
}

/** 제10조 빈칸 마크업(1단계: 문서 내 인라인 / 2단계: 확대). */
function BlankArticle({ zoom }: { zoom?: boolean }) {
  return (
    <p className={zoom ? 'treaty-zoom__article' : 'treaty__article treaty__article--blank'}>
      제 10조 우리는{' '}
      <span
        className={`treaty__blank-line treaty__blank-line--blink${
          zoom ? ' treaty__blank-line--zoom' : ''
        }`}
        aria-hidden="true"
      />
      <span className="visually-hidden">(빈칸)</span> .
    </p>
  );
}

/**
 * 화면3 — 협정문.
 * 1단계: 제1~9조 자모 분리 타이핑 "동시" 출력 → 제10조 빈칸 깜박임 → Next 노출.
 * 2단계: Next 클릭 시 제10조 빈칸 확대 + 안내문구 + Next(다음 단계 진행).
 */
export function TreatyScreen({ onNext }: Props) {
  const reduced = !!useReducedMotion();
  // 작성일자는 렌더 시점(마운트 1회)의 기기 로컬 시간 기준으로 동적 생성한다.
  const footerDate = useMemo(() => formatTreatyFooterDate(new Date()), []);
  const [phase, setPhase] = useState<'writing' | 'guide'>('writing');
  // 완성(타이핑 종료)된 조문 개수. 모션 최소화 선호 시 즉시 전체 표시.
  const [typedCount, setTypedCount] = useState(reduced ? TREATY_ARTICLES.length : 0);
  const [showNext, setShowNext] = useState(reduced);

  const allTyped = typedCount >= TREATY_ARTICLES.length;

  const handleArticleDone = useCallback(() => {
    setTypedCount((c) => c + 1);
  }, []);

  // 전체 타이핑 완료 → 빈칸 깜박임 노출 후 Next 표출.
  useEffect(() => {
    if (!allTyped || showNext) return;
    const t = setTimeout(() => setShowNext(true), reduced ? 0 : NEXT_REVEAL_DELAY_MS);
    return () => clearTimeout(t);
  }, [allTyped, showNext, reduced]);

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
      <motion.article
        className="treaty"
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h2 className="treaty__title">{TREATY_TITLE}</h2>
        {TREATY_ARTICLES.map((article, idx) => (
          <ArticleLine
            key={idx}
            index={idx}
            text={article}
            // 모든 조문이 동시에 타이핑을 시작한다(순차 X).
            active={!reduced}
            done={reduced}
            onDone={handleArticleDone}
          />
        ))}
        {allTyped && <BlankArticle />}
        <p className="treaty__footer">
          {footerDate}
          <br />
          {TREATY_FOOTER_PLACE}
        </p>
      </motion.article>

      {showNext && <NextButton onClick={() => setPhase('guide')} />}
    </ScreenFrame>
  );
}
