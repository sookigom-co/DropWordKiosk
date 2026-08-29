import { useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { ScreenFrame } from '../components/ScreenFrame';
import { NextButton } from '../components/NextButton';
import { useFx } from '../state/fx-context';
import { useStep1Physics } from '../hooks/useStep1Physics';
import { NOUNS } from '../data/words';

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNext: () => void;
}

/**
 * 화면5 — STEP1 명사 선택(선택 화면).
 * 단어 원과 보라색 공이 화면 상단에서 **함께 떨어져** 바닥·서로 위에 섞여 랜덤하게 쌓인다
 * (matter-js, SOO-1208 낙하·적재 전환 + 후속 글자·보라 원 혼합 낙하 — 부모 SOO-1207 보더 요청).
 * 상단 로고 클릭으로 효과를 실시간 조절한다.
 * reduced-motion 환경에서는 물리를 끄고 정적 배치로 폴백한다(접근성).
 * (설명 페이지 StepIntroScreen 은 변경하지 않는다.)
 */
export function Step1Bubbles({ selectedId, onSelect, onNext }: Props) {
  const { settings } = useFx();
  const reduced = !!useReducedMotion();
  const fieldRef = useRef<HTMLDivElement>(null);
  const { engaged, registerBubble, purples, registerPurple } = useStep1Physics(
    fieldRef,
    NOUNS,
    settings,
    reduced,
  );

  return (
    <ScreenFrame label="STEP1 대상 선택 화면">
      <div
        ref={fieldRef}
        className={`bubble-field${engaged ? ' bubble-field--physics' : ''}`}
        role="group"
        aria-label="평화 협정문에 담을 대상"
      >
        {/* 보라색 공(장식) — 물리적으로 단어 원을 밀어 올린다. 클릭 대상 아님. */}
        <div className="fx-circle-layer" aria-hidden="true">
          {purples.map((p) => (
            <span
              key={p.id}
              ref={registerPurple(p.id)}
              className="fx-circle"
              style={{ background: p.color }}
            />
          ))}
        </div>

        {NOUNS.map((noun) => (
          <button
            key={noun.id}
            ref={registerBubble(noun.id)}
            type="button"
            className="bubble"
            aria-pressed={selectedId === noun.id}
            onClick={() => onSelect(noun.id)}
          >
            {noun.text}
          </button>
        ))}
      </div>
      <NextButton onClick={onNext} disabled={selectedId === null} />
    </ScreenFrame>
  );
}
