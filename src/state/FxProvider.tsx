import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_FX_SETTINGS, clampFx, type FxSettings } from '../lib/fx';
import { FxContext } from './fx-context';

/**
 * Step 1 장식 효과 설정을 앱 전역에 제공한다(SOO-1045).
 * 로고(상단)에서 패널을 열고, Step1 선택 화면이 설정을 소비한다.
 * 키오스크 특성상 영속화하지 않는다(세션 초기화 시 기본값 복귀).
 */
export function FxProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<FxSettings>(DEFAULT_FX_SETTINGS);
  const [open, setOpen] = useState(false);

  const update = useCallback((patch: Partial<FxSettings>) => {
    setSettings((prev) => clampFx(patch, prev));
  }, []);
  const reset = useCallback(() => setSettings(DEFAULT_FX_SETTINGS), []);

  const value = useMemo(
    () => ({ settings, update, reset, open, setOpen }),
    [settings, update, reset, open],
  );

  return <FxContext.Provider value={value}>{children}</FxContext.Provider>;
}
