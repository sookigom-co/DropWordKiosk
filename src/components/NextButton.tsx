interface NextButtonProps {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}

/** 다음 화면 이동 버튼(스토리보드 "NEXT >>>"). */
export function NextButton({ onClick, disabled = false, label = 'NEXT ▶▶▶' }: NextButtonProps) {
  return (
    <button type="button" className="btn-next" onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
}
