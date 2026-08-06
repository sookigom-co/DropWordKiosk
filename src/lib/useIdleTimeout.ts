import { useEffect, useRef } from 'react';

/**
 * 무입력 타임아웃 훅 — 무인 키오스크 운영용.
 * 지정 시간 동안 사용자 입력(터치/포인터/키)이 없으면 onIdle 을 호출한다.
 * `enabled` 가 false 이면(예: 자동 진행 화면) 감시하지 않는다.
 */
export function useIdleTimeout(onIdle: () => void, timeoutMs: number, enabled = true): void {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!enabled || timeoutMs <= 0) return;

    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => onIdleRef.current(), timeoutMs);
    };

    const events: (keyof WindowEventMap)[] = [
      'pointerdown',
      'pointermove',
      'touchstart',
      'keydown',
      'wheel',
    ];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [timeoutMs, enabled]);
}
