// 인쇄 에이전트 연동 클라이언트.
// 계약(v1) 출처: SOO-992 계획 문서 §3 API 계약(요약: 이슈 SOO-993 본문).
//   - Base URL: http://127.0.0.1:8737 (라즈베리파이 로컬 인쇄 에이전트)
//   - GET  /v1/printer/status  : 프린터 사전 상태 확인
//   - POST /v1/print           : PNG 전송(멀티파트 image 필드)
// 실패 상태(NO_PAPER / COVER_OPEN / OFFLINE / 타임아웃) 는 절대 "완료"로 넘기지 않고
// 스태프 호출 화면으로 분기시킨다.
//
// ⚠ 계약의 정확한 JSON 스키마는 BackendCoder 와 최종 확정 필요(README "인쇄 에이전트 계약" 참조).
// 응답 파싱은 방어적으로 작성하여 다양한 필드명(status/state/code, ok/success 등)을 허용한다.

/** 정규화된 프린터 상태 */
export type PrinterState =
  | 'READY'
  | 'BUSY'
  | 'NO_PAPER'
  | 'COVER_OPEN'
  | 'OFFLINE'
  | 'ERROR';

export interface StatusResult {
  state: PrinterState;
  message?: string;
  raw?: unknown;
}

export interface PrintResult {
  ok: boolean;
  state: PrinterState;
  jobId?: string;
  message?: string;
  raw?: unknown;
}

export interface PrintClient {
  readonly mock: boolean;
  getStatus(): Promise<StatusResult>;
  print(png: Blob): Promise<PrintResult>;
}

const DEFAULT_BASE = 'http://127.0.0.1:8737';
const STATUS_TIMEOUT_MS = 4000;
const PRINT_TIMEOUT_MS = 20000;

/** 실패 상태(스태프 호출로 분기해야 하는 상태) 판별 */
export function isFailureState(state: PrinterState): boolean {
  return state === 'NO_PAPER' || state === 'COVER_OPEN' || state === 'OFFLINE' || state === 'ERROR';
}

/** 실패 상태 한국어 안내 문구 */
export function failureMessage(state: PrinterState): string {
  switch (state) {
    case 'NO_PAPER':
      return '용지가 부족합니다.';
    case 'COVER_OPEN':
      return '프린터 덮개가 열려 있습니다.';
    case 'OFFLINE':
      return '프린터에 연결할 수 없습니다.';
    default:
      return '인쇄 중 오류가 발생했습니다.';
  }
}

/** 다양한 응답 형태에서 상태 코드를 뽑아 정규화 */
function normalizeState(payload: unknown): PrinterState {
  if (!payload || typeof payload !== 'object') return 'ERROR';
  const p = payload as Record<string, unknown>;
  const rawCode = String(p.state ?? p.status ?? p.code ?? '').toUpperCase();
  switch (rawCode) {
    case 'READY':
    case 'OK':
    case 'ONLINE':
    case 'IDLE':
      return 'READY';
    case 'BUSY':
    case 'PRINTING':
      return 'BUSY';
    case 'NO_PAPER':
    case 'PAPER_EMPTY':
    case 'PAPER_OUT':
      return 'NO_PAPER';
    case 'COVER_OPEN':
    case 'DOOR_OPEN':
      return 'COVER_OPEN';
    case 'OFFLINE':
    case 'DISCONNECTED':
      return 'OFFLINE';
    default:
      return 'ERROR';
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

class HttpPrintClient implements PrintClient {
  readonly mock = false;
  constructor(private readonly base: string) {}

  async getStatus(): Promise<StatusResult> {
    try {
      const res = await fetchWithTimeout(
        `${this.base}/v1/printer/status`,
        { method: 'GET', headers: { Accept: 'application/json' } },
        STATUS_TIMEOUT_MS,
      );
      if (!res.ok) return { state: 'ERROR', message: `HTTP ${res.status}` };
      const raw = await res.json().catch(() => ({}));
      return { state: normalizeState(raw), raw };
    } catch {
      // 네트워크 오류/타임아웃 → 에이전트 미기동으로 간주(OFFLINE)
      return { state: 'OFFLINE' };
    }
  }

  async print(png: Blob): Promise<PrintResult> {
    try {
      const form = new FormData();
      form.append('image', png, 'treaty.png');
      const res = await fetchWithTimeout(
        `${this.base}/v1/print`,
        { method: 'POST', body: form },
        PRINT_TIMEOUT_MS,
      );
      const raw = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, state: normalizeState(raw), message: `HTTP ${res.status}`, raw };
      }
      const r = raw as Record<string, unknown>;
      const ok = r.ok === true || r.success === true || normalizeState(raw) === 'READY';
      const state = ok ? 'READY' : normalizeState(raw);
      return { ok, state, jobId: r.jobId as string | undefined, raw };
    } catch {
      return { ok: false, state: 'OFFLINE', message: '인쇄 요청 시간 초과 또는 연결 실패' };
    }
  }
}

/** 개발/데모용 목(mock) 클라이언트 — 실제 에이전트 없이 전체 흐름 검증 */
class MockPrintClient implements PrintClient {
  readonly mock = true;
  constructor(private readonly forced?: PrinterState) {}

  async getStatus(): Promise<StatusResult> {
    await delay(300);
    return { state: this.forced ?? 'READY', message: 'mock' };
  }

  async print(_png: Blob): Promise<PrintResult> {
    await delay(1500);
    const state = this.forced ?? 'READY';
    if (state !== 'READY' && state !== 'BUSY') {
      return { ok: false, state, message: 'mock 실패 시뮬레이션' };
    }
    return { ok: true, state: 'READY', jobId: 'mock-job', message: 'mock 인쇄 완료' };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseForcedState(value: string | null): PrinterState | undefined {
  if (!value) return undefined;
  const v = value.toUpperCase();
  const allowed: PrinterState[] = ['READY', 'BUSY', 'NO_PAPER', 'COVER_OPEN', 'OFFLINE', 'ERROR'];
  return allowed.includes(v as PrinterState) ? (v as PrinterState) : undefined;
}

/**
 * 환경/쿼리 플래그로 클라이언트를 생성한다.
 *   - VITE_PRINT_MOCK=1  또는  ?mock=1     → mock 모드
 *   - ?printer=no_paper 등                 → mock 강제 상태(실패 분기 테스트)
 *   - VITE_PRINTER_BASE                    → 에이전트 Base URL 재정의
 */
export function createPrintClient(): PrintClient {
  const params = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : '',
  );
  const forced = parseForcedState(params.get('printer'));
  const mockByEnv = import.meta.env.VITE_PRINT_MOCK === '1';
  const mockByQuery = params.get('mock') === '1' || forced !== undefined;

  if (mockByEnv || mockByQuery) {
    return new MockPrintClient(forced);
  }
  const base = (import.meta.env.VITE_PRINTER_BASE as string | undefined) ?? DEFAULT_BASE;
  return new HttpPrintClient(base);
}
