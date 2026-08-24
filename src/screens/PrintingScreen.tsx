import { useEffect, useRef, useState } from 'react';
import { ScreenFrame } from '../components/ScreenFrame';
import { renderTreatyPng } from '../lib/treatyCanvas';
import { isFailureState, type PrinterState, type PrintClient } from '../lib/printClient';
import { PRINTING_MIN_MS } from '../state/config';

interface Props {
  client: PrintClient;
  sentence: string;
  onSuccess: (previewUrl: string) => void;
  onError: (state: PrinterState, previewUrl: string | null) => void;
  /** 프리뷰 모드 — 프린터 호출을 생략하고 생성된 PNG 를 화면에 표시한다. */
  preview?: boolean;
  /** 프리뷰 모드에서 PNG 생성 후 호출 — 미리보기 화면으로 분기 */
  onPreview?: (previewUrl: string) => void;
  /**
   * 축소(compact) 변형 — 진행바를 숨기고 안내 문구 폰트를 줄여 768×1024 에서
   * 스크롤바가 나지 않도록 한다. 관리자 메뉴 테스트 프린트 경로에서만 사용한다(SOO-1173).
   * 기본값(false)은 일반 사용자 인쇄 플로우로, 진행바 + 원래 폰트를 유지한다.
   */
  compact?: boolean;
}

/**
 * 화면12 — 인쇄 중.
 * 협정문 PNG(432px 흑백)를 만들고, 프린터 상태 확인 후 전송한다.
 * 실패(NO_PAPER/COVER_OPEN/OFFLINE/타임아웃)는 스태프 호출 화면으로 분기한다.
 * 프리뷰 모드(preview)면 프린터 호출 없이 생성된 PNG 를 프리뷰 화면으로 넘긴다.
 *
 * 사용자 플로우는 진행바 + 원래 폰트를 그대로 쓴다. 관리자 테스트 프린트에서만
 * compact 변형(진행바 제거 + 폰트 축소)을 적용해 스크롤바를 막는다(SOO-1173).
 */
export function PrintingScreen({
  client,
  sentence,
  onSuccess,
  onError,
  preview = false,
  onPreview,
  compact = false,
}: Props) {
  const [percent, setPercent] = useState(8);
  const startedRef = useRef(false);

  useEffect(() => {
    // React StrictMode 등에서 이펙트 중복 실행 방지(인쇄 이중 전송 방지)
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    const startedAt = Date.now();

    // 진행 바를 부드럽게 채움(실제 완료 전까지 90% 상한)
    const progress = setInterval(() => {
      setPercent((p) => (p < 90 ? p + 4 : p));
    }, 200);

    const finish = async (fn: () => void) => {
      const elapsed = Date.now() - startedAt;
      const wait = Math.max(0, PRINTING_MIN_MS - elapsed);
      await new Promise((r) => setTimeout(r, wait));
      if (cancelled) return;
      clearInterval(progress);
      setPercent(100);
      fn();
    };

    (async () => {
      let previewUrl: string | null = null;
      try {
        const png = await renderTreatyPng(sentence);
        previewUrl = png.dataUrl;

        // 프리뷰 모드: 이미지는 정상 생성하되 프린터 클라이언트 호출은 생략하고
        // 생성된 PNG 를 화면(프리뷰)으로 넘긴다.
        if (preview) {
          await finish(() => onPreview?.(previewUrl!));
          return;
        }

        const status = await client.getStatus();
        if (cancelled) return;
        if (isFailureState(status.state)) {
          await finish(() => onError(status.state, previewUrl));
          return;
        }

        const result = await client.print(png.blob);
        if (cancelled) return;
        if (!result.ok) {
          await finish(() => onError(result.state, previewUrl));
          return;
        }
        await finish(() => onSuccess(previewUrl!));
      } catch {
        await finish(() => onError('ERROR', previewUrl));
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(progress);
    };
  }, [client, sentence, onSuccess, onError, preview, onPreview]);

  return (
    <ScreenFrame label="인쇄 진행 화면">
      <h2 className={`screen__subtitle${compact ? ' screen__subtitle--printing' : ''}`}>
        {'인쇄 중입니다.\n잠시만 기다려 주세요.'}
      </h2>
      {!compact && (
        <div
          className="progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="인쇄 진행률"
        >
          <div className="progress__fill" style={{ width: `${percent}%` }} />
        </div>
      )}
    </ScreenFrame>
  );
}
