import { useCallback, useMemo, useRef, useState } from 'react';
import { useKiosk } from './state/useKiosk';
import { useIdleTimeout } from './lib/useIdleTimeout';
import { IDLE_TIMEOUT_MS } from './state/config';
import { createPrintClient, isPreviewMode, type PrinterState } from './lib/printClient';
import {
  ADMIN_TAP_COUNT,
  ADMIN_TAP_WINDOW_MS,
  pushTap,
  tapTriggered,
} from './lib/tapSequence';
import { AdminMenu } from './components/AdminMenu';
import { Logo } from './components/Logo';
import { StartScreen } from './screens/StartScreen';
import { IntroScreen } from './screens/IntroScreen';
import { TreatyScreen } from './screens/TreatyScreen';
import { StepIntroScreen } from './screens/StepIntroScreen';
import { Step1Bubbles } from './screens/Step1Bubbles';
import { Step2Falling } from './screens/Step2Falling';
import { Step3Sorted } from './screens/Step3Sorted';
import { GeneratingScreen } from './screens/GeneratingScreen';
import { ResultScreen } from './screens/ResultScreen';
import { PrintingScreen } from './screens/PrintingScreen';
import { DoneScreen } from './screens/DoneScreen';
import { PrintErrorScreen } from './screens/PrintErrorScreen';
import { PreviewScreen } from './screens/PreviewScreen';

/** 무입력 타임아웃을 감시할 대화형 화면들(자동 진행 화면은 제외) */
const IDLE_WATCHED = new Set([
  'intro',
  'treaty',
  'step1Intro',
  'step1',
  'step2Intro',
  'step2',
  'step3Intro',
  'step3',
  'error',
]);

export default function App() {
  const kiosk = useKiosk();
  const client = useMemo(() => createPrintClient(), []);
  const preview = useMemo(() => isPreviewMode(), []);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<PrinterState>('ERROR');
  const [adminOpen, setAdminOpen] = useState(false);
  const tapHistory = useRef<number[]>([]);

  const resetAll = useCallback(() => {
    setPreviewUrl(null);
    setErrorState('ERROR');
    kiosk.reset();
  }, [kiosk]);

  // 로고 비밀 탭 시퀀스(3초 내 5회) → 관리자 메뉴 오픈(SOO-1170).
  const handleSecretTap = useCallback(() => {
    const now = Date.now();
    const next = pushTap(tapHistory.current, now, ADMIN_TAP_WINDOW_MS);
    tapHistory.current = next;
    if (tapTriggered(next, ADMIN_TAP_COUNT)) {
      tapHistory.current = [];
      setAdminOpen(true);
    }
  }, []);

  // 관리자 메뉴가 열려 있는 동안은 무입력 타임아웃으로 초기 화면으로 튕기지 않는다.
  useIdleTimeout(resetAll, IDLE_TIMEOUT_MS, IDLE_WATCHED.has(kiosk.step) && !adminOpen);

  const handleSuccess = useCallback(
    (url: string) => {
      setPreviewUrl(url);
      kiosk.go('done');
    },
    [kiosk],
  );

  const handleError = useCallback(
    (state: PrinterState, url: string | null) => {
      setErrorState(state);
      setPreviewUrl(url);
      kiosk.go('error');
    },
    [kiosk],
  );

  const handlePreview = useCallback(
    (url: string) => {
      setPreviewUrl(url);
      kiosk.go('preview');
    },
    [kiosk],
  );

  return (
    <div className="app-root">
      {preview ? (
        <div className="mock-badge">PREVIEW</div>
      ) : (
        client.mock && <div className="mock-badge">MOCK</div>
      )}
      <Logo onSecretTap={handleSecretTap} />
      {renderStep()}
      {adminOpen && (
        <AdminMenu client={client} preview={preview} onClose={() => setAdminOpen(false)} />
      )}
    </div>
  );

  function renderStep() {
    switch (kiosk.step) {
      case 'start':
        return <StartScreen onStart={kiosk.next} />;
      case 'intro':
        return <IntroScreen onNext={kiosk.next} />;
      case 'treaty':
        return <TreatyScreen onNext={kiosk.next} />;
      case 'step1Intro':
        return (
          <StepIntroScreen
            step="STEP 1."
            subtitle={'평화 협정문에 담을 대상을\n선택하세요.'}
            onNext={kiosk.next}
          />
        );
      case 'step1':
        return (
          <Step1Bubbles selectedId={kiosk.nounId} onSelect={kiosk.selectNoun} onNext={kiosk.next} />
        );
      case 'step2Intro':
        return (
          <StepIntroScreen
            step="STEP 2."
            subtitle={'선택한 대상을 표현할 말을\n선택하세요.'}
            onNext={kiosk.next}
          />
        );
      case 'step2':
        return (
          <Step2Falling
            selectedId={kiosk.adjectiveId}
            onSelect={kiosk.selectAdjective}
            onNext={kiosk.next}
          />
        );
      case 'step3Intro':
        return (
          <StepIntroScreen
            step="STEP 3."
            subtitle={'마지막으로\n약속을 완성할\n행동을 선택하세요.'}
            onNext={kiosk.next}
          />
        );
      case 'step3':
        return (
          <Step3Sorted selectedId={kiosk.verbId} onSelect={kiosk.selectVerb} onNext={kiosk.next} />
        );
      case 'generating':
        return <GeneratingScreen onDone={() => kiosk.go('result')} />;
      case 'result':
        return (
          <ResultScreen sentence={kiosk.sentence ?? ''} onDone={() => kiosk.go('printing')} />
        );
      case 'printing':
        return (
          <PrintingScreen
            client={client}
            sentence={kiosk.sentence ?? ''}
            onSuccess={handleSuccess}
            onError={handleError}
            preview={preview}
            onPreview={handlePreview}
          />
        );
      case 'preview':
        return <PreviewScreen previewUrl={previewUrl ?? ''} onClose={resetAll} />;
      case 'done':
        return <DoneScreen onReset={resetAll} previewUrl={previewUrl} mock={client.mock} />;
      case 'error':
        return (
          <PrintErrorScreen
            state={errorState}
            onRetry={() => kiosk.go('printing')}
            onReset={resetAll}
            previewUrl={previewUrl}
            mock={client.mock}
          />
        );
      default:
        return <StartScreen onStart={kiosk.next} />;
    }
  }
}
