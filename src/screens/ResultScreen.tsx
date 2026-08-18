import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { ScreenFrame } from '../components/ScreenFrame';
import { RESULT_HOLD_MS } from '../state/config';

interface Props {
  sentence: string;
  onDone: () => void;
}

/** 화면11 — 완성 문장(다른 페이지와 동일한 흰 계열 배경·검은 계열 글자). 잠시 노출 후 자동으로 인쇄 단계로. */
export function ResultScreen({ sentence, onDone }: Props) {
  useEffect(() => {
    const t = setTimeout(onDone, RESULT_HOLD_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <ScreenFrame label="완성 문장 화면">
      <motion.p
        className="result-sentence"
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        aria-live="polite"
      >
        {sentence}
      </motion.p>
    </ScreenFrame>
  );
}
