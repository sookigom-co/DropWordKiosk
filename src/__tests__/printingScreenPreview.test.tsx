import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, createElement } from 'react';
import { PrintingScreen } from '../screens/PrintingScreen';
import type { PrintClient, PrintResult, StatusResult } from '../lib/printClient';
import { PRINTING_MIN_MS } from '../state/config';

// renderTreatyPng 은 canvas 를 쓰므로 jsdom 에서 스텁한다.
// (프리뷰/인쇄 분기 검증이 목적이지 실제 PNG 렌더 검증이 아니다.)
vi.mock('../lib/treatyCanvas', () => ({
  renderTreatyPng: vi.fn(async () => ({
    dataUrl: 'data:image/png;base64,PREVIEW',
    blob: new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }),
  })),
}));

// React 18 act 환경 플래그.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function fakeClient(overrides: Partial<PrintClient> = {}): PrintClient {
  return {
    mock: false,
    getStatus: vi.fn(async (): Promise<StatusResult> => ({ state: 'READY' })),
    print: vi.fn(async (): Promise<PrintResult> => ({ ok: true, state: 'READY', jobId: 'j' })),
    reboot: vi.fn(async () => ({ ok: true })),
    exitKiosk: vi.fn(async () => ({ ok: true })),
    getRemoteSupport: vi.fn(async () => ({ ok: true })),
    setRemoteSupport: vi.fn(async () => ({ ok: true })),
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.clearAllMocks();
});

/** 최소 노출 시간 + 마이크로태스크를 흘려 이펙트 비동기 체인을 완결시킨다. */
async function drain() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(PRINTING_MIN_MS + 50);
  });
}

describe('PrintingScreen 프리뷰 분기 (SOO-1099)', () => {
  it('프리뷰 ON: client.print/getStatus 미호출, onPreview 로 생성 PNG 전달', async () => {
    const client = fakeClient();
    const onPreview = vi.fn();
    const onSuccess = vi.fn();

    await act(async () => {
      root.render(
        createElement(PrintingScreen, {
          client,
          sentence: '평화로운 경계선을 지운다',
          onSuccess,
          onError: vi.fn(),
          preview: true,
          onPreview,
        }),
      );
    });
    await drain();

    expect(client.print).not.toHaveBeenCalled();
    expect(client.getStatus).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onPreview).toHaveBeenCalledWith('data:image/png;base64,PREVIEW');
  });

  it('기본(사용자 플로우): 진행바(progressbar) 표시 + 축소 폰트 클래스 없음 (SOO-1173)', async () => {
    const client = fakeClient();

    await act(async () => {
      root.render(
        createElement(PrintingScreen, {
          client,
          sentence: '평화로운 경계선을 지운다',
          onSuccess: vi.fn(),
          onError: vi.fn(),
        }),
      );
    });

    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(container.querySelector('.screen__subtitle--printing')).toBeNull();

    await drain();
  });

  it('compact(관리자 테스트 프린트): 진행바 제거 + 축소 폰트 클래스 적용 (SOO-1173)', async () => {
    const client = fakeClient();

    await act(async () => {
      root.render(
        createElement(PrintingScreen, {
          client,
          sentence: '평화로운 경계선을 지운다',
          onSuccess: vi.fn(),
          onError: vi.fn(),
          compact: true,
        }),
      );
    });

    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    expect(container.querySelector('.screen__subtitle--printing')).not.toBeNull();

    await drain();
  });

  it('프리뷰 OFF(기본): 기존 인쇄 경로 — client.print 호출 + onSuccess', async () => {
    const client = fakeClient();
    const onPreview = vi.fn();
    const onSuccess = vi.fn();

    await act(async () => {
      root.render(
        createElement(PrintingScreen, {
          client,
          sentence: '평화로운 경계선을 지운다',
          onSuccess,
          onError: vi.fn(),
          preview: false,
          onPreview,
        }),
      );
    });
    await drain();

    expect(client.getStatus).toHaveBeenCalledTimes(1);
    expect(client.print).toHaveBeenCalledTimes(1);
    expect(onPreview).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});
