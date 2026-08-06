import { ScreenFrame } from '../components/ScreenFrame';
import { NextButton } from '../components/NextButton';

interface Props {
  step: string;
  subtitle: string;
  onNext: () => void;
}

/** STEP1/2/3 인트로 공용 화면 */
export function StepIntroScreen({ step, subtitle, onNext }: Props) {
  return (
    <ScreenFrame label={`${step} 안내 화면`}>
      <p className="screen__eyebrow">{step}</p>
      <h2 className="screen__subtitle">{subtitle}</h2>
      <NextButton onClick={onNext} />
    </ScreenFrame>
  );
}
