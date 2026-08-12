interface NextButtonProps {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}

/**
 * 다음 화면 이동 버튼(스토리보드 "NEXT >>>").
 * 로고 최상단 고정과 대칭이 되도록 뷰포트 최하단에 고정되는 바(.next-bar) 안에 배치한다.
 * 이 컴포넌트를 쓰는 모든 화면에서 NEXT 위치가 동일하게 유지된다(SOO-1039).
 */
export function NextButton({ onClick, disabled = false, label = 'NEXT ▶▶▶' }: NextButtonProps) {
  return (
    <div className="next-bar">
      <button type="button" className="btn-next" onClick={onClick} disabled={disabled}>
        {label}
      </button>
    </div>
  );
}
