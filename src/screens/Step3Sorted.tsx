import { motion } from 'framer-motion';
import { ScreenFrame } from '../components/ScreenFrame';
import { NextButton } from '../components/NextButton';
import { VERBS } from '../data/words';

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNext: () => void;
}

/**
 * 화면9 — STEP3 동사 선택.
 * 낱말카드가 상단에서 하단으로 떨어지되, 서로 겹치지 않고 격자에 차곡차곡 정렬되어 쌓인다.
 * (Framer Motion stagger — 물리 낙하가 아닌 정렬 낙하)
 */
export function Step3Sorted({ selectedId, onSelect, onNext }: Props) {
  return (
    <ScreenFrame label="STEP3 행동 선택 화면">
      <p className="screen__eyebrow">STEP 3. 행동 선택</p>
      <div className="card-grid" role="group" aria-label="약속을 완성할 행동">
        {VERBS.map((verb, i) => (
          <motion.button
            key={verb.id}
            type="button"
            className="word-card"
            aria-pressed={selectedId === verb.id}
            onClick={() => onSelect(verb.id)}
            initial={{ opacity: 0, y: -220 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              type: 'spring',
              stiffness: 320,
              damping: 24,
              delay: i * 0.07,
            }}
            whileTap={{ scale: 0.94 }}
          >
            {verb.text}
          </motion.button>
        ))}
      </div>
      <NextButton onClick={onNext} disabled={selectedId === null} />
    </ScreenFrame>
  );
}
