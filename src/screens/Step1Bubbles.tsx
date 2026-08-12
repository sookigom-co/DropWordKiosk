import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ScreenFrame } from '../components/ScreenFrame';
import { NextButton } from '../components/NextButton';
import { PurpleCircleLayer } from '../components/PurpleCircleLayer';
import { useFx } from '../state/fx-context';
import { NOUNS } from '../data/words';

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNext: () => void;
}

/** 단어 원 낙하 기준 시작 높이(px, 화면 위에서 떨어짐). */
const FALL_FROM = -320;
const FALL_BASE_DUR = 0.5; // s (fallSpeed=1 기준)
const FALL_STAGGER = 0.06; // s

/**
 * 화면5 — STEP1 명사 선택(선택 화면).
 * 단어 원이 공중에서 우수수 떨어져 등장하고(SOO-1045), 낙하가 끝나면
 * 빈 공간에서 보라색 신규 원이 생성된다. 상단 로고 클릭으로 효과를 실시간 조절한다.
 * (설명 페이지 StepIntroScreen 은 변경하지 않는다.)
 */
export function Step1Bubbles({ selectedId, onSelect, onNext }: Props) {
  const { settings } = useFx();
  const reduced = !!useReducedMotion();
  const fieldRef = useRef<HTMLDivElement>(null);
  const [bubblePx, setBubblePx] = useState(0);
  const [fallDone, setFallDone] = useState(reduced);

  // 단어 원 실측 지름 → 보라색 원 크기 상한 계산에 사용.
  useLayoutEffect(() => {
    const measure = () => {
      const first = fieldRef.current?.querySelector<HTMLElement>('.bubble');
      if (first) setBubblePx(first.getBoundingClientRect().width);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // 낙하 애니메이션 종료 후 보라색 원 생성 시작.
  useEffect(() => {
    if (reduced) {
      setFallDone(true);
      return;
    }
    const totalMs =
      ((NOUNS.length - 1) * FALL_STAGGER + FALL_BASE_DUR) * (1000 / settings.fallSpeed);
    const t = window.setTimeout(() => setFallDone(true), totalMs);
    return () => window.clearTimeout(t);
    // 마운트 시 1회(낙하는 진입 애니메이션). fallSpeed 변경은 다음 진입부터 반영.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScreenFrame label="STEP1 대상 선택 화면">
      <div className="bubble-field" role="group" aria-label="평화 협정문에 담을 대상" ref={fieldRef}>
        <PurpleCircleLayer bubblePx={bubblePx} active={fallDone && !reduced} settings={settings} />
        {NOUNS.map((noun, i) => (
          <motion.button
            key={noun.id}
            type="button"
            className="bubble"
            aria-pressed={selectedId === noun.id}
            onClick={() => onSelect(noun.id)}
            initial={reduced ? false : { opacity: 0, y: FALL_FROM, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={
              reduced
                ? { duration: 0 }
                : {
                    // 중력 낙하 느낌(가속 이징) + 개별 딜레이로 우수수 떨어짐.
                    duration: FALL_BASE_DUR / settings.fallSpeed,
                    delay: (i * FALL_STAGGER) / settings.fallSpeed,
                    ease: [0.45, 0, 0.9, 0.4],
                  }
            }
            whileTap={{ scale: 0.92 }}
          >
            {noun.text}
          </motion.button>
        ))}
      </div>
      <NextButton onClick={onNext} disabled={selectedId === null} />
    </ScreenFrame>
  );
}
