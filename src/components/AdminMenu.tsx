import { useCallback, useState } from 'react';
import type { PrintClient, PrinterState, RemoteSupportStatus } from '../lib/printClient';
import { failureMessage, remoteSupportLabel } from '../lib/printClient';
import { pickTestPrint, type TestPrintPick } from '../lib/testPrint';
import { PrintingScreen } from '../screens/PrintingScreen';

interface AdminMenuProps {
  client: PrintClient;
  /** 프리뷰 모드 — 실제 인쇄/재부팅 호출 대신 안내·PNG 표시로 분기 */
  preview: boolean;
  /** 닫기 — 관리자 메뉴를 접고 원래 키오스크 화면을 그대로 유지한다 */
  onClose: () => void;
}

/** 관리자 메뉴 내부 서브 플로우 상태 */
type AdminMode =
  | 'menu'
  | 'reboot-confirm'
  | 'rebooting'
  | 'reboot-notice'
  | 'exit-confirm'
  | 'exiting'
  | 'exit-notice'
  | 'poweroff-confirm'
  | 'powering-off'
  | 'poweroff-notice'
  | 'remote-support'
  | 'test-printing'
  | 'test-preview'
  | 'test-done'
  | 'test-error';

/**
 * 관리자 메뉴 오버레이(SOO-1170).
 * 로고 5탭(3초 내)으로 열리며, 재부팅 / 테스트 프린트 2개 액션을 제공한다.
 *
 * - 이 오버레이는 키오스크 본 플로우 상태(useKiosk.step)를 건드리지 않는다.
 *   테스트 프린트는 자체 서브 플로우(PrintingScreen 재사용)로 처리하고, 닫으면 원래 화면이 그대로 남는다.
 * - 재부팅: 확인 다이얼로그 → `POST /v1/admin/reboot`. MOCK/PREVIEW 모드는 실제 호출 대신 안내만 표시.
 * - 키오스크 종료: 확인 다이얼로그 → `POST /v1/admin/exit-kiosk`(SOO-1182). Chromium kiosk 모드를 종료한다.
 * - 시스템 종료: 확인 다이얼로그 → `POST /v1/admin/poweroff`(SOO-1196). 기기 전원을 끈다.
 * - 테스트 프린트: 수식어/대상/행동 랜덤 조합 → 기존 협정문 인쇄 파이프라인 재사용.
 */
export function AdminMenu({ client, preview, onClose }: AdminMenuProps) {
  const [mode, setMode] = useState<AdminMode>('menu');
  const [notice, setNotice] = useState('');
  const [errorState, setErrorState] = useState<PrinterState>('ERROR');
  const [pick, setPick] = useState<TestPrintPick | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rebootBusy, setRebootBusy] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);
  const [poweroffBusy, setPoweroffBusy] = useState(false);
  const [rsStatus, setRsStatus] = useState<RemoteSupportStatus | null>(null);
  const [rsBusy, setRsBusy] = useState(false);
  const [rsError, setRsError] = useState<string | null>(null);

  const simulate = preview || client.mock;

  // 프리뷰/mock 모드에서 실제 네트워크·SSH 호출 없이 쓰는 합성 상태.
  const simulatedRsStatus = (desired: boolean): RemoteSupportStatus => ({
    desired,
    running: desired,
    pid: desired ? 4242 : null,
    startedAt: null,
    lastExitCode: null,
    lastError: null,
  });

  const startTestPrint = useCallback(() => {
    setPick(pickTestPrint());
    setPreviewUrl(null);
    setMode('test-printing');
  }, []);

  const doReboot = useCallback(async () => {
    // MOCK/PREVIEW: 실제 재부팅을 호출하지 않고 안내만 표시(요구사항 2 허용 조항).
    if (simulate) {
      setNotice('개발/프리뷰 모드입니다. 실제 재부팅은 호출하지 않습니다.');
      setMode('reboot-notice');
      return;
    }
    setRebootBusy(true);
    setMode('rebooting');
    const result = await client.reboot();
    setRebootBusy(false);
    if (result.ok) {
      setNotice('재부팅을 요청했습니다. 기기가 곧 재시작됩니다.');
    } else {
      setNotice(result.message ?? '재부팅 요청에 실패했습니다.');
    }
    setMode('reboot-notice');
  }, [client, simulate]);

  const doExitKiosk = useCallback(async () => {
    // MOCK/PREVIEW: 실제 종료를 호출하지 않고 안내만 표시.
    if (simulate) {
      setNotice('개발/프리뷰 모드입니다. 실제 키오스크 종료는 호출하지 않습니다.');
      setMode('exit-notice');
      return;
    }
    setExitBusy(true);
    setMode('exiting');
    const result = await client.exitKiosk();
    setExitBusy(false);
    if (result.ok) {
      // 성공 시 곧 브라우저가 닫히므로 별도 후속 화면은 불요.
      setNotice('키오스크를 종료합니다…');
    } else {
      setNotice(result.message ?? '키오스크 종료 요청에 실패했습니다.');
    }
    setMode('exit-notice');
  }, [client, simulate]);

  const doPowerOff = useCallback(async () => {
    // MOCK/PREVIEW: 실제 종료를 호출하지 않고 안내만 표시.
    if (simulate) {
      setNotice('개발/프리뷰 모드입니다. 실제 시스템 종료는 호출하지 않습니다.');
      setMode('poweroff-notice');
      return;
    }
    setPoweroffBusy(true);
    setMode('powering-off');
    const result = await client.powerOff();
    setPoweroffBusy(false);
    if (result.ok) {
      // 성공 시 곧 전원이 꺼지므로 별도 후속 화면은 불요.
      setNotice('시스템을 종료합니다…');
    } else {
      setNotice(result.message ?? '시스템 종료 요청에 실패했습니다.');
    }
    setMode('poweroff-notice');
  }, [client, simulate]);

  // 원격 지원(SSH 역터널) 진입 — 상태를 조회해 표시. 실패해도 사용자 플로우엔 영향 없음.
  const openRemoteSupport = useCallback(async () => {
    setRsError(null);
    setMode('remote-support');
    if (simulate) {
      // MOCK/PREVIEW: 실제 조회 없이 꺼짐 상태로 표시(요구사항 허용 조항).
      setRsStatus(simulatedRsStatus(false));
      return;
    }
    setRsBusy(true);
    const result = await client.getRemoteSupport();
    setRsBusy(false);
    if (result.ok && result.status) {
      setRsStatus(result.status);
    } else {
      setRsStatus(null);
      setRsError(result.message ?? '원격 지원 상태를 불러오지 못했습니다.');
    }
  }, [client, simulate]);

  // 원격 지원 토글 — 응답 상태로 UI 갱신. 실패 시 에러 표시 + 이전 상태로 복구.
  const toggleRemoteSupport = useCallback(async () => {
    const next = !(rsStatus?.desired ?? false);
    setRsError(null);
    if (simulate) {
      setRsStatus(simulatedRsStatus(next));
      return;
    }
    const prev = rsStatus;
    setRsBusy(true);
    const result = await client.setRemoteSupport(next);
    setRsBusy(false);
    if (result.ok && result.status) {
      setRsStatus(result.status);
    } else {
      setRsStatus(prev); // 원상 복구
      setRsError(result.message ?? '원격 지원 설정에 실패했습니다.');
    }
  }, [client, simulate, rsStatus]);

  // 테스트 프린트 결과 콜백 — 모두 관리자 오버레이 내부에 머문다(본 플로우 미변경).
  const handleTestSuccess = useCallback(() => setMode('test-done'), []);
  const handleTestError = useCallback((state: PrinterState, url: string | null) => {
    setErrorState(state);
    setPreviewUrl(url);
    setMode('test-error');
  }, []);
  const handleTestPreview = useCallback((url: string) => {
    setPreviewUrl(url);
    setMode('test-preview');
  }, []);

  return (
    <div
      className="admin-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="관리자 메뉴"
    >
      <div className="admin-panel">{renderBody()}</div>
    </div>
  );

  function renderBody() {
    switch (mode) {
      case 'menu':
        return (
          <>
            <h2 className="admin-panel__title">관리자 메뉴</h2>
            <p className="admin-panel__lead">운영자 전용 기능입니다.</p>
            <div className="admin-panel__actions">
              <button type="button" className="admin-btn" onClick={startTestPrint}>
                테스트 프린트
              </button>
              <button
                type="button"
                className="admin-btn"
                onClick={() => setMode('reboot-confirm')}
              >
                재부팅
              </button>
              <button type="button" className="admin-btn" onClick={openRemoteSupport}>
                원격 지원
              </button>
              <button
                type="button"
                className="admin-btn"
                onClick={() => setMode('exit-confirm')}
              >
                키오스크 종료
              </button>
              <button
                type="button"
                className="admin-btn"
                onClick={() => setMode('poweroff-confirm')}
              >
                시스템 종료
              </button>
            </div>
            <button type="button" className="admin-btn admin-btn--ghost" onClick={onClose}>
              닫기
            </button>
          </>
        );

      case 'reboot-confirm':
        return (
          <>
            <h2 className="admin-panel__title">재부팅</h2>
            <p className="admin-panel__lead">정말 재부팅할까요?</p>
            <div className="admin-panel__actions">
              <button type="button" className="admin-btn admin-btn--danger" onClick={doReboot}>
                재부팅
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                onClick={() => setMode('menu')}
              >
                취소
              </button>
            </div>
          </>
        );

      case 'rebooting':
        return (
          <>
            <h2 className="admin-panel__title">재부팅 요청 중…</h2>
            <p className="admin-panel__lead" aria-live="polite" aria-busy={rebootBusy}>
              잠시만 기다려 주세요.
            </p>
          </>
        );

      case 'reboot-notice':
        return (
          <>
            <h2 className="admin-panel__title">재부팅</h2>
            <p className="admin-panel__lead" aria-live="polite">
              {notice}
            </p>
            <button
              type="button"
              className="admin-btn admin-btn--ghost"
              onClick={() => setMode('menu')}
            >
              확인
            </button>
          </>
        );

      case 'exit-confirm':
        return (
          <>
            <h2 className="admin-panel__title">키오스크 종료</h2>
            <p className="admin-panel__lead">정말 키오스크를 종료할까요?</p>
            <div className="admin-panel__actions">
              <button type="button" className="admin-btn admin-btn--danger" onClick={doExitKiosk}>
                키오스크 종료
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                onClick={() => setMode('menu')}
              >
                취소
              </button>
            </div>
          </>
        );

      case 'exiting':
        return (
          <>
            <h2 className="admin-panel__title">키오스크 종료 요청 중…</h2>
            <p className="admin-panel__lead" aria-live="polite" aria-busy={exitBusy}>
              잠시만 기다려 주세요.
            </p>
          </>
        );

      case 'exit-notice':
        return (
          <>
            <h2 className="admin-panel__title">키오스크 종료</h2>
            <p className="admin-panel__lead" aria-live="polite">
              {notice}
            </p>
            <button
              type="button"
              className="admin-btn admin-btn--ghost"
              onClick={() => setMode('menu')}
            >
              확인
            </button>
          </>
        );

      case 'poweroff-confirm':
        return (
          <>
            <h2 className="admin-panel__title">시스템 종료</h2>
            <p className="admin-panel__lead">정말 시스템(기기 전원)을 종료할까요?</p>
            <div className="admin-panel__actions">
              <button type="button" className="admin-btn admin-btn--danger" onClick={doPowerOff}>
                시스템 종료
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                onClick={() => setMode('menu')}
              >
                취소
              </button>
            </div>
          </>
        );

      case 'powering-off':
        return (
          <>
            <h2 className="admin-panel__title">시스템 종료 요청 중…</h2>
            <p className="admin-panel__lead" aria-live="polite" aria-busy={poweroffBusy}>
              잠시만 기다려 주세요.
            </p>
          </>
        );

      case 'poweroff-notice':
        return (
          <>
            <h2 className="admin-panel__title">시스템 종료</h2>
            <p className="admin-panel__lead" aria-live="polite">
              {notice}
            </p>
            <button
              type="button"
              className="admin-btn admin-btn--ghost"
              onClick={() => setMode('menu')}
            >
              확인
            </button>
          </>
        );

      case 'remote-support': {
        const on = rsStatus?.desired ?? false;
        return (
          <>
            <h2 className="admin-panel__title">원격 지원</h2>
            <p className="admin-panel__lead" aria-live="polite" aria-busy={rsBusy}>
              {rsBusy ? '처리 중…' : `현재 상태: ${remoteSupportLabel(rsStatus)}`}
            </p>
            {rsError && (
              <p className="admin-panel__lead admin-panel__lead--error" role="alert">
                {rsError}
              </p>
            )}
            <div className="admin-panel__actions">
              <button
                type="button"
                className={on ? 'admin-btn admin-btn--danger' : 'admin-btn'}
                onClick={toggleRemoteSupport}
                disabled={rsBusy}
                aria-pressed={on}
              >
                {on ? '원격 지원 끄기' : '원격 지원 켜기'}
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                onClick={() => setMode('menu')}
              >
                닫기
              </button>
            </div>
          </>
        );
      }

      case 'test-printing':
        // 랜덤 조합 문장을 기존 인쇄 파이프라인(PrintingScreen)으로 그대로 태운다.
        return (
          <PrintingScreen
            client={client}
            sentence={pick?.sentence ?? ''}
            onSuccess={handleTestSuccess}
            onError={handleTestError}
            preview={preview}
            onPreview={handleTestPreview}
            compact
          />
        );

      case 'test-preview':
        return (
          <>
            <h2 className="admin-panel__title">테스트 프린트 미리보기</h2>
            <p className="admin-panel__lead">{pick?.sentence}</p>
            <div className="admin-preview">
              <img src={previewUrl ?? ''} alt="테스트 인쇄 협정문 미리보기" />
            </div>
            <button
              type="button"
              className="admin-btn admin-btn--ghost"
              onClick={() => setMode('menu')}
            >
              확인
            </button>
          </>
        );

      case 'test-done':
        return (
          <>
            <h2 className="admin-panel__title">테스트 인쇄 완료</h2>
            <p className="admin-panel__lead" aria-live="polite">
              {`테스트 인쇄를 전송했습니다.\n${pick?.sentence ?? ''}`}
            </p>
            <button
              type="button"
              className="admin-btn admin-btn--ghost"
              onClick={() => setMode('menu')}
            >
              확인
            </button>
          </>
        );

      case 'test-error':
        return (
          <>
            <h2 className="admin-panel__title">테스트 인쇄 실패</h2>
            <p className="admin-panel__lead" aria-live="polite">
              {failureMessage(errorState)}
            </p>
            <div className="admin-panel__actions">
              <button type="button" className="admin-btn" onClick={startTestPrint}>
                다시 시도
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                onClick={() => setMode('menu')}
              >
                닫기
              </button>
            </div>
          </>
        );

      default:
        return null;
    }
  }
}
