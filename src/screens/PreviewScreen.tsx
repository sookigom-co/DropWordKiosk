import { ScreenFrame } from '../components/ScreenFrame';

interface Props {
  /** 인쇄용으로 생성한 협정문 PNG(dataURL) */
  previewUrl: string;
  /** 확인/닫기 — 기존 플로우(처음 화면)로 복귀 */
  onClose: () => void;
}

/**
 * 프리뷰 모드 전용 화면 — 프린터로 출력하지 않고, 인쇄용으로 생성한 협정문 PNG 를
 * 화면에 표시한다. 실기기(768×1024 세로) 기준으로 전체를 볼 수 있도록 스크롤/축소한다.
 * 운영자가 실기기/프린터 없이 인쇄 결과물을 확인하는 용도(SOO-1099).
 */
export function PreviewScreen({ previewUrl, onClose }: Props) {
  return (
    <ScreenFrame label="인쇄 미리보기 화면">
      <h2 className="screen__subtitle">인쇄 미리보기</h2>
      <p className="screen__lead">
        {'프리뷰 모드입니다.\n프린터로 출력하지 않고 생성된 협정문을 표시합니다.'}
      </p>
      <div className="print-preview">
        <img src={previewUrl} alt="인쇄용으로 생성한 평화 협정문 미리보기" />
      </div>
      <button type="button" className="btn-next" onClick={onClose}>
        확인
      </button>
    </ScreenFrame>
  );
}
