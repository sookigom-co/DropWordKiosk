import { ScreenFrame } from '../components/ScreenFrame';

interface Props {
  onStart: () => void;
}

/** 화면1 — 시작 */
export function StartScreen({ onStart }: Props) {
  return (
    <ScreenFrame label="시작 화면">
      <p className="screen__eyebrow">작전명, 평화 협정문을 완성하라!</p>
      <h1 className="screen__title">평화 협정문 완성하기</h1>
      <button type="button" className="btn-start" onClick={onStart}>
        START
      </button>
      <p className="screen__lead">START 버튼을 눌러주세요.</p>
    </ScreenFrame>
  );
}
