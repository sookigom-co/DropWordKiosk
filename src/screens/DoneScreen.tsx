import { useEffect, useState } from 'react';
import { ScreenFrame } from '../components/ScreenFrame';
import { DONE_RESET_MS } from '../state/config';

interface Props {
  onReset: () => void;
  /** mock 모드에서 생성된 협정문 PNG 미리보기(다운로드 확인용) */
  previewUrl?: string | null;
  mock?: boolean;
}

/** 화면13 — 완료. 10~15초 후 자동으로 첫 화면 복귀. */
export function DoneScreen({ onReset, previewUrl, mock = false }: Props) {
  const [remain, setRemain] = useState(Math.round(DONE_RESET_MS / 1000));

  useEffect(() => {
    const interval = setInterval(() => setRemain((r) => Math.max(0, r - 1)), 1000);
    const timer = setTimeout(onReset, DONE_RESET_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [onReset]);

  return (
    <ScreenFrame label="완료 화면">
      <h2 className="screen__subtitle">
        {'인쇄가 완료되었습니다.\n철원 국가유산 야행에 방문해 주셔서 감사합니다.'}
      </h2>

      {mock && previewUrl && (
        <div className="preview-panel">
          <p className="screen__lead">[mock] 생성된 협정문 미리보기 (432px 흑백)</p>
          <img src={previewUrl} alt="완성된 평화 협정문 인쇄 미리보기" />
          <div className="preview-actions">
            <a className="btn-next" href={previewUrl} download="peace-treaty.png">
              PNG 다운로드
            </a>
          </div>
        </div>
      )}

      <p className="screen__lead" aria-live="polite">
        {remain}초 뒤 처음 화면으로 이동합니다.
      </p>
    </ScreenFrame>
  );
}
