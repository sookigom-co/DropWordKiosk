import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, createElement } from 'react';
import { AdminMenu } from '../components/AdminMenu';
import type { OnlineResult, PrintClient, UpdateResult } from '../lib/printClient';

// AdminMenu 는 PrintingScreen(→ treatyCanvas, canvas 의존)을 import 한다.
// 자동 업데이트 플로우 검증에서는 인쇄 경로에 도달하지 않지만, import 안전을 위해 스텁한다.
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
    getStatus: vi.fn(async () => ({ state: 'READY' as const })),
    print: vi.fn(async () => ({ ok: true, state: 'READY' as const, jobId: 'j' })),
    reboot: vi.fn(async () => ({ ok: true })),
    exitKiosk: vi.fn(async () => ({ ok: true })),
    powerOff: vi.fn(async () => ({ ok: true })),
    getOnline: vi.fn(async (): Promise<OnlineResult> => ({ ok: true, online: true })),
    update: vi.fn(async (): Promise<UpdateResult> => ({ ok: true })),
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

async function mount(client: PrintClient) {
  await act(async () => {
    root.render(createElement(AdminMenu, { client, preview: false, onClose: vi.fn() }));
  });
  // 마운트 시 getOnline() 이 즉시 호출된다 — 마이크로태스크를 흘려 상태를 반영한다.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

/** 정확한 텍스트를 가진 버튼을 찾는다(공백 정규화). */
function findButton(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '').trim() === text,
  ) as HTMLButtonElement | undefined;
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('AdminMenu 자동 업데이트 버튼 (SOO-1202)', () => {
  it('online: true → 버튼 활성, 안내 문구 없음', async () => {
    const client = fakeClient();
    await mount(client);

    expect(client.getOnline).toHaveBeenCalled();
    const btn = findButton('자동 업데이트');
    expect(btn).toBeDefined();
    expect(btn?.disabled).toBe(false);
    expect(container.querySelector('#admin-update-hint')).toBeNull();
  });

  it('online: false → 버튼 비활성 + "인터넷 연결 필요" 안내', async () => {
    const client = fakeClient({
      getOnline: vi.fn(async () => ({ ok: true, online: false })),
    });
    await mount(client);

    const btn = findButton('자동 업데이트');
    expect(btn?.disabled).toBe(true);
    const hint = container.querySelector('#admin-update-hint');
    expect(hint?.textContent).toContain('인터넷 연결 필요');
  });

  it('getOnline 호출 실패(ok=false)도 버튼 비활성 처리', async () => {
    const client = fakeClient({
      getOnline: vi.fn(async () => ({ ok: false, online: false })),
    });
    await mount(client);

    expect(findButton('자동 업데이트')?.disabled).toBe(true);
  });

  it('5초 주기 재확인: offline → online 으로 바뀌면 버튼이 활성화된다', async () => {
    const getOnline = vi
      .fn<() => Promise<OnlineResult>>()
      .mockResolvedValueOnce({ ok: true, online: false })
      .mockResolvedValue({ ok: true, online: true });
    const client = fakeClient({ getOnline });
    await mount(client);

    expect(findButton('자동 업데이트')?.disabled).toBe(true);

    // 5초 경과 → 재확인에서 online:true
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(findButton('자동 업데이트')?.disabled).toBe(false);
    expect(getOnline.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('POST 성공 → 확인 다이얼로그 후 "업데이트를 시작했습니다" 안내', async () => {
    const client = fakeClient();
    await mount(client);

    await click(findButton('자동 업데이트')!);
    // 확인 다이얼로그의 시작 버튼
    await click(findButton('업데이트 시작')!);

    expect(client.update).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('업데이트를 시작했습니다');
  });

  it('POST 503(offline) → "인터넷 연결이 필요" 안내 + 버튼 재비활성', async () => {
    const client = fakeClient({
      update: vi.fn(async () => ({ ok: false, offline: true, message: 'offline' })),
    });
    await mount(client);

    await click(findButton('자동 업데이트')!);
    await click(findButton('업데이트 시작')!);

    expect(container.textContent).toContain('인터넷 연결이 필요');
    // 안내 확인 후 메뉴로 복귀하면 버튼이 비활성이어야 한다(online=false 로 설정됨)
    await click(findButton('확인')!);
    expect(findButton('자동 업데이트')?.disabled).toBe(true);
  });

  it('POST 실패(스크립트 오류) → 오류 메시지 안내', async () => {
    const client = fakeClient({
      update: vi.fn(async () => ({ ok: false, message: '업데이트 스크립트 실행 실패' })),
    });
    await mount(client);

    await click(findButton('자동 업데이트')!);
    await click(findButton('업데이트 시작')!);

    expect(container.textContent).toContain('업데이트 스크립트 실행 실패');
  });
});
