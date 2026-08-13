import { createContext, useContext } from 'react';
import type { FxSettings } from '../lib/fx';

export interface FxContextValue {
  /** 현재 효과 설정. */
  settings: FxSettings;
}

export const FxContext = createContext<FxContextValue | null>(null);

/** 효과 설정 컨텍스트 훅. FxProvider 하위에서만 사용 가능. */
export function useFx(): FxContextValue {
  const ctx = useContext(FxContext);
  if (!ctx) throw new Error('useFx 는 <FxProvider> 안에서만 사용할 수 있습니다.');
  return ctx;
}
