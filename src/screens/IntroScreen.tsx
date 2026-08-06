import { ScreenFrame } from '../components/ScreenFrame';
import { NextButton } from '../components/NextButton';

interface Props {
  onNext: () => void;
}

/** 화면2 — 인트로 */
export function IntroScreen({ onNext }: Props) {
  return (
    <ScreenFrame label="인트로 화면">
      <h2 className="screen__subtitle">
        {'평화를 유지하기 위해\n모두가 지킬 평화의 약속이 필요합니다.'}
      </h2>
      <NextButton onClick={onNext} />
    </ScreenFrame>
  );
}
