import { useEffect, useState } from 'react';
import { ScreenFrame } from '../components/ScreenFrame';
import { GENERATING_MS, GENERATING_STAGES } from '../state/config';

interface Props {
  onDone: () => void;
}

/** 화면10 — 문장 생성 로딩(3단계 진행 표시) */
export function GeneratingScreen({ onDone }: Props) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const stepMs = GENERATING_MS / GENERATING_STAGES;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let s = 1; s <= GENERATING_STAGES; s++) {
      timers.push(setTimeout(() => setStage(s), stepMs * s));
    }
    const done = setTimeout(onDone, GENERATING_MS + 200);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
    };
  }, [onDone]);

  const percent = Math.round((stage / GENERATING_STAGES) * 100);

  return (
    <ScreenFrame label="문장 생성 화면">
      <h2 className="screen__subtitle">문장을 완성하고 있습니다.</h2>
      <div
        className="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="문장 생성 진행률"
      >
        <div className="progress__fill" style={{ width: `${percent}%` }} />
      </div>
    </ScreenFrame>
  );
}
