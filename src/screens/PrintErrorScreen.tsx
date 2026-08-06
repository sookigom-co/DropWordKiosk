import { ScreenFrame } from '../components/ScreenFrame';
import { failureMessage, type PrinterState } from '../lib/printClient';

interface Props {
  state: PrinterState;
  onRetry: () => void;
  onReset: () => void;
  previewUrl?: string | null;
  mock?: boolean;
}

/**
 * 인쇄 실패 분기 — 스태프 호출 화면.
 * 실패를 "완료"로 넘기지 않고 안내 + 재시도/처음으로 를 제공한다.
 */
export function PrintErrorScreen({ state, onRetry, onReset, previewUrl, mock = false }: Props) {
  return (
    <ScreenFrame label="인쇄 오류 화면" dark>
      <h2 className="screen__subtitle">인쇄를 완료하지 못했습니다.</h2>
      <p className="screen__lead" style={{ color: '#f2941e' }} aria-live="assertive">
        {failureMessage(state)}
        {'\n'}가까운 운영 스태프에게 도움을 요청해 주세요.
      </p>

      {mock && previewUrl && (
        <div className="preview-panel">
          <img src={previewUrl} alt="완성된 평화 협정문 미리보기" />
          <a className="btn-staff" href={previewUrl} download="peace-treaty.png">
            [mock] PNG 다운로드
          </a>
        </div>
      )}

      <div className="preview-actions">
        <button type="button" className="btn-staff" onClick={onRetry}>
          다시 시도
        </button>
        <button type="button" className="btn-staff" onClick={onReset}>
          처음으로
        </button>
      </div>
    </ScreenFrame>
  );
}
