import { useMemo, type ReactNode } from 'react';
import { DEFAULT_FX_SETTINGS } from '../lib/fx';
import { FxContext } from './fx-context';

/**
 * Step 1 장식 효과 설정을 앱 전역에 제공한다(SOO-1045).
 * SOO-1061 보더 요청으로 로고 클릭 효과 설정 패널을 제거 — 설정은 기본값 고정으로 제공하고
 * Step1 선택 화면이 이를 소비한다. 키오스크 특성상 런타임 조절/영속화는 하지 않는다.
 */
export function FxProvider({ children }: { children: ReactNode }) {
  const value = useMemo(() => ({ settings: DEFAULT_FX_SETTINGS }), []);

  return <FxContext.Provider value={value}>{children}</FxContext.Provider>;
}
