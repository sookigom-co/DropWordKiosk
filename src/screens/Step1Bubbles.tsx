import { motion } from 'framer-motion';
import { ScreenFrame } from '../components/ScreenFrame';
import { NextButton } from '../components/NextButton';
import { NOUNS } from '../data/words';

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNext: () => void;
}

/**
 * 화면5 — STEP1 명사 선택.
 * 원형 버블이 아래에서 "뽀글뽀글" 올라오며 등장(Framer Motion).
 */
export function Step1Bubbles({ selectedId, onSelect, onNext }: Props) {
  return (
    <ScreenFrame label="STEP1 대상 선택 화면">
      <p className="screen__eyebrow">STEP 1. 대상 선택</p>
      <div className="bubble-field" role="group" aria-label="평화 협정문에 담을 대상">
        {NOUNS.map((noun, i) => (
          <motion.button
            key={noun.id}
            type="button"
            className="bubble"
            aria-pressed={selectedId === noun.id}
            onClick={() => onSelect(noun.id)}
            initial={{ opacity: 0, y: 60, scale: 0.6 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              type: 'spring',
              stiffness: 260,
              damping: 16,
              delay: i * 0.08,
            }}
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
