import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { purpleColor, randomTargetPx, type FxSettings } from '../lib/fx';

interface Props {
  /** 단어 원 지름(px). 보라색 원 크기 상한 계산에 쓴다. */
  bubblePx: number;
  /** 낙하가 끝난 뒤에만 생성 시작. */
  active: boolean;
  settings: FxSettings;
}

interface Circle {
  id: number;
  size: number;
  left: number; // %
  top: number; // %
  color: string;
  dur: number; // s
}

/** 동시에 떠 있는 보라색 원 상한(과다 렌더 방지). */
const MAX_CIRCLES = 20;

/**
 * Step 1 선택 화면 배경의 보라색 신규 원 생성 효과(SOO-1045).
 * 낱말 원(단어 원) 낙하가 끝나면 빈 공간에서 보라색 원이 랜덤 크기로 커졌다 사라진다.
 * 순수 장식 레이어 — pointer-events:none 로 단어 선택 히트 영역을 방해하지 않는다.
 */
export function PurpleCircleLayer({ bubblePx, active, settings }: Props) {
  const [circles, setCircles] = useState<Circle[]>([]);
  const idRef = useRef(0);
  // 최신 설정을 인터벌 콜백에서 참조하기 위한 ref(인터벌 재생성 최소화).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    if (!active || bubblePx <= 0) return;

    const spawn = () => {
      const s = settingsRef.current;
      const id = ++idRef.current;
      const size = randomTargetPx(bubblePx, s.maxSizeRatio, Math.random());
      const circle: Circle = {
        id,
        size,
        left: 6 + Math.random() * 88,
        top: 6 + Math.random() * 88,
        color: purpleColor(s.hue, { alpha: 0.5 }),
        dur: s.growDurationSec,
      };
      setCircles((cs) => {
        const next = cs.length >= MAX_CIRCLES ? cs.slice(1) : cs;
        return [...next, circle];
      });
      // 성장 + 페이드아웃 후 제거.
      window.setTimeout(
        () => setCircles((cs) => cs.filter((c) => c.id !== id)),
        (circle.dur + 0.6) * 1000,
      );
    };

    const interval = window.setInterval(spawn, settings.spawnIntervalMs);
    return () => window.clearInterval(interval);
    // spawnIntervalMs 만 인터벌 주기에 영향(그 외 값은 settingsRef 로 즉시 반영).
  }, [active, bubblePx, settings.spawnIntervalMs]);

  return (
    <div className="fx-circle-layer" aria-hidden="true">
      {circles.map((c) => (
        <motion.span
          key={c.id}
          className="fx-circle"
          style={{ left: `${c.left}%`, top: `${c.top}%`, background: c.color }}
          initial={{ width: 8, height: 8, opacity: 0 }}
          animate={{ width: c.size, height: c.size, opacity: [0, 0.55, 0] }}
          transition={{
            width: { duration: c.dur, ease: 'easeOut' },
            height: { duration: c.dur, ease: 'easeOut' },
            opacity: { duration: c.dur + 0.6, ease: 'easeInOut', times: [0, 0.45, 1] },
          }}
        />
      ))}
    </div>
  );
}
