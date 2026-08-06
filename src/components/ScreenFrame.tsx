import type { ReactNode } from 'react';

interface ScreenFrameProps {
  children: ReactNode;
  /** 완성 문장 화면처럼 검은 배경이 필요할 때 */
  dark?: boolean;
  /** 화면 접근성 라벨(landmark) */
  label: string;
}

/** 화면 본문 래퍼 — main 랜드마크 + 다크/라이트 모드. */
export function ScreenFrame({ children, dark = false, label }: ScreenFrameProps) {
  return (
    <main className={`screen${dark ? ' screen--dark' : ''}`} aria-label={label}>
      {children}
    </main>
  );
}
