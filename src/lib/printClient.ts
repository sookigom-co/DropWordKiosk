// 인쇄 에이전트 연동 클라이언트.
// 계약(v1) 출처: DropWordPrintAgent `docs/api-contract-v1.md`
//   (SOO-994 에서 확정·머지, https://github.com/sookigom-co/DropWordPrintAgent/blob/main/docs/api-contract-v1.md).
//   - Base URL: 통합 배포(에이전트가 kiosk dist/ 를 서빙, SOO-1027 옵션 B) 시 same-origin 상대 경로.
//               인쇄 에이전트 자체는 라즈베리파이 로컬 127.0.0.1:8737 에서 수신한다.
//               dev(Vite 8080)에서는 상대 경로가 에이전트로 가지 않으므로 VITE_PRINTER_BASE 로 재정의한다.
//   - GET  /v1/printer/status  : 프린터 사전 상태 확인
//   - POST /v1/print           : JSON base64 전송
//       요청  { "imagePngBase64": "<PNG base64>", "cut": true, "meta"?: { modifier, target, action } }
//       성공  200 { "jobId": "...", "result": "printed" }
//       실패  { "error": { "code": NO_PAPER|COVER_OPEN|PRINTER_OFFLINE|BAD_IMAGE|PAYLOAD_TOO_LARGE, "message"? } }
//             (NO_PAPER/COVER_OPEN=409, PRINTER_OFFLINE=503, BAD_IMAGE=400, PAYLOAD_TOO_LARGE=413)
// 실패 분기는 HTTP 상태가 아니라 error.code 를 1순위로 판정한다(계약 v1).
// 실패 상태(NO_PAPER / COVER_OPEN / OFFLINE / 타임아웃) 는 절대 "완료"로 넘기지 않고
// 스태프 호출 화면으로 분기시킨다.
//
// 응답 파싱은 방어적으로 작성하여 계약 v1 형태(result/error.code)를 1순위로 인식하되,
// 구형 필드명(status/state/code, ok/success 등)도 하위 호환으로 허용한다.

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

/**
 * 인쇄 감사/디버깅용 메타(계약 v1 `meta`, 선택 필드).
 * 호출부가 단어 3개(수식어/대상/행동)를 갖고 있으면 그대로 전달한다.
 */
export interface PrintMeta {
  modifier?: string;
  target?: string;
  action?: string;
}

/**
 * 관리자 재부팅 결과(계약: CTO 확정, SOO-1170).
 *   - 성공 200 `{ "result": "rebooting" }`
 *   - 실패 500 `{ "error": { "code": "REBOOT_FAILED", "message"? } }`
 */
export interface RebootResult {
  ok: boolean;
  message?: string;
  raw?: unknown;
}

/**
 * 관리자 키오스크 종료 결과(계약: CTO 확정, SOO-1182).
 *   - 성공 200 `{ "result": "exiting" }`
 *   - 실패 500 `{ "error": { "code": "EXIT_KIOSK_FAILED", "message"? } }`
 */
export interface ExitKioskResult {
  ok: boolean;
  message?: string;
  raw?: unknown;
}

export interface PrintClient {
  readonly mock: boolean;
  getStatus(): Promise<StatusResult>;
  print(png: Blob, meta?: PrintMeta): Promise<PrintResult>;
  /** 관리자 재부팅 요청(`POST /v1/admin/reboot`). */
  reboot(): Promise<RebootResult>;
  /** 관리자 키오스크 종료 요청(`POST /v1/admin/exit-kiosk`). */
  exitKiosk(): Promise<ExitKioskResult>;
}

// 통합 배포(에이전트가 kiosk dist/ 를 same-origin 으로 서빙)에서는 상대 경로로 호출한다.
// 빈 문자열이면 fetch(`/v1/print`) 가 현재 origin 으로 나가 추가 설정 없이 에이전트에 도달한다.
// dev/외부 PC 시험은 VITE_PRINTER_BASE / ?agent= 로 절대 URL 을 재정의한다.
const DEFAULT_BASE = '';
const STATUS_TIMEOUT_MS = 4000;
const PRINT_TIMEOUT_MS = 20000;
const REBOOT_TIMEOUT_MS = 8000;
const EXIT_KIOSK_TIMEOUT_MS = 8000;

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
    case 'PRINTER_OFFLINE':
    case 'DISCONNECTED':
      return 'OFFLINE';
    default:
      return 'ERROR';
  }
}

/** 계약 v1 `error.code` → 내부 PrinterState 매핑 */
export function mapErrorCode(code: string): PrinterState {
  switch (code.toUpperCase()) {
    case 'NO_PAPER':
      return 'NO_PAPER';
    case 'COVER_OPEN':
      return 'COVER_OPEN';
    case 'PRINTER_OFFLINE':
      return 'OFFLINE';
    case 'BAD_IMAGE':
    case 'PAYLOAD_TOO_LARGE':
    default:
      return 'ERROR';
  }
}

/** 바이트 배열 → 순수 base64(btoa 기반, 외부 의존 없음) */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000; // call stack 보호를 위해 청크 단위로 변환
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * PNG Blob → 순수 base64 문자열(data URL 접두 없음).
 * 브라우저 표준 `Blob.arrayBuffer()` 를 우선 사용하고, 없는 환경(일부 테스트 런타임)에서는
 * `FileReader` 로 폴백한다. 외부 네트워크/CDN 의존 없음(오프라인 요건 유지).
 */
export function blobToBase64(blob: Blob): Promise<string> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer().then((buf) => bytesToBase64(new Uint8Array(buf)));
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(stripDataUrlPrefix(String(reader.result)));
    reader.onerror = () => reject(reader.error ?? new Error('FileReader 실패'));
    reader.readAsDataURL(blob);
  });
}

/** `data:image/png;base64,` 등 data URL 접두가 있으면 순수 base64 부분만 추출 */
export function stripDataUrlPrefix(value: string): string {
  const comma = value.indexOf(',');
  return value.startsWith('data:') && comma >= 0 ? value.slice(comma + 1) : value;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * `POST /v1/print` 응답을 계약 v1 기준으로 해석한다.
 *   - 성공: `result === "printed"`(+ jobId)  → ok
 *   - 실패: `error.code` 우선 판정(HTTP 상태 무관)
 *   - 하위 호환: ok/success 필드, status/state 정규화도 허용
 */
export function interpretPrintResponse(
  httpOk: boolean,
  httpStatus: number,
  raw: unknown,
): PrintResult {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  // 계약 v1 성공 형태 우선
  if (String(r.result ?? '').toLowerCase() === 'printed') {
    return { ok: true, state: 'READY', jobId: asString(r.jobId), raw };
  }

  // 계약 v1 실패 형태: error.code 기준 분기
  const errObj =
    r.error && typeof r.error === 'object' ? (r.error as Record<string, unknown>) : undefined;
  const code = errObj ? String(errObj.code ?? '').toUpperCase() : '';
  if (code) {
    const state = mapErrorCode(code);
    return {
      ok: false,
      state,
      message: asString(errObj?.message) ?? failureMessage(state),
      raw,
    };
  }

  // 하위 호환(구형 필드명)
  if (httpOk && (r.ok === true || r.success === true)) {
    return { ok: true, state: 'READY', jobId: asString(r.jobId), raw };
  }
  return { ok: false, state: normalizeState(raw), message: `HTTP ${httpStatus}`, raw };
}

/**
 * `POST /v1/admin/reboot` 응답을 계약(SOO-1170) 기준으로 해석한다.
 *   - 성공: `result === "rebooting"` → ok
 *   - 실패: `error.code`(REBOOT_FAILED 등) 존재 시 message 를 안내
 *   - 그 외: HTTP 상태로 폴백
 */
export function interpretRebootResponse(
  httpOk: boolean,
  httpStatus: number,
  raw: unknown,
): RebootResult {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  if (String(r.result ?? '').toLowerCase() === 'rebooting') {
    return { ok: true, raw };
  }

  const errObj =
    r.error && typeof r.error === 'object' ? (r.error as Record<string, unknown>) : undefined;
  if (errObj) {
    return {
      ok: false,
      message: asString(errObj.message) ?? '재부팅 요청에 실패했습니다.',
      raw,
    };
  }

  // 하위 호환: 구형 ok/success 필드
  if (httpOk && (r.ok === true || r.success === true)) {
    return { ok: true, raw };
  }
  return { ok: false, message: `재부팅 요청 실패 (HTTP ${httpStatus})`, raw };
}

/**
 * `POST /v1/admin/exit-kiosk` 응답을 계약(SOO-1182) 기준으로 해석한다.
 *   - 성공: `result === "exiting"` → ok
 *   - 실패: `error.code`(EXIT_KIOSK_FAILED 등) 존재 시 message 를 안내
 *   - 그 외: HTTP 상태로 폴백
 */
export function interpretExitKioskResponse(
  httpOk: boolean,
  httpStatus: number,
  raw: unknown,
): ExitKioskResult {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  if (String(r.result ?? '').toLowerCase() === 'exiting') {
    return { ok: true, raw };
  }

  const errObj =
    r.error && typeof r.error === 'object' ? (r.error as Record<string, unknown>) : undefined;
  if (errObj) {
    return {
      ok: false,
      message: asString(errObj.message) ?? '키오스크 종료 요청에 실패했습니다.',
      raw,
    };
  }

  // 하위 호환: 구형 ok/success 필드
  if (httpOk && (r.ok === true || r.success === true)) {
    return { ok: true, raw };
  }
  return { ok: false, message: `키오스크 종료 요청 실패 (HTTP ${httpStatus})`, raw };
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

  async print(png: Blob, meta?: PrintMeta): Promise<PrintResult> {
    try {
      const imagePngBase64 = await blobToBase64(png);
      const body: {
        imagePngBase64: string;
        cut: boolean;
        meta?: PrintMeta;
      } = { imagePngBase64, cut: true };
      if (meta) body.meta = meta;

      const res = await fetchWithTimeout(
        `${this.base}/v1/print`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
        },
        PRINT_TIMEOUT_MS,
      );
      const raw = await res.json().catch(() => ({}));
      return interpretPrintResponse(res.ok, res.status, raw);
    } catch {
      // 네트워크 오류/타임아웃 → 에이전트 미기동으로 간주(OFFLINE)
      return { ok: false, state: 'OFFLINE', message: '인쇄 요청 시간 초과 또는 연결 실패' };
    }
  }

  async reboot(): Promise<RebootResult> {
    try {
      const res = await fetchWithTimeout(
        `${this.base}/v1/admin/reboot`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: '{}',
        },
        REBOOT_TIMEOUT_MS,
      );
      const raw = await res.json().catch(() => ({}));
      return interpretRebootResponse(res.ok, res.status, raw);
    } catch {
      return { ok: false, message: '재부팅 요청 시간 초과 또는 연결 실패' };
    }
  }

  async exitKiosk(): Promise<ExitKioskResult> {
    try {
      const res = await fetchWithTimeout(
        `${this.base}/v1/admin/exit-kiosk`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: '{}',
        },
        EXIT_KIOSK_TIMEOUT_MS,
      );
      const raw = await res.json().catch(() => ({}));
      return interpretExitKioskResponse(res.ok, res.status, raw);
    } catch {
      return { ok: false, message: '키오스크 종료 요청 시간 초과 또는 연결 실패' };
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

  async print(_png: Blob, _meta?: PrintMeta): Promise<PrintResult> {
    await delay(1500);
    const state = this.forced ?? 'READY';
    if (state !== 'READY' && state !== 'BUSY') {
      return { ok: false, state, message: 'mock 실패 시뮬레이션' };
    }
    return { ok: true, state: 'READY', jobId: 'mock-job', message: 'mock 인쇄 완료' };
  }

  async reboot(): Promise<RebootResult> {
    await delay(600);
    return { ok: true, message: 'mock 재부팅 요청(실제 호출 없음)' };
  }

  async exitKiosk(): Promise<ExitKioskResult> {
    await delay(600);
    return { ok: true, message: 'mock 키오스크 종료 요청(실제 호출 없음)' };
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
 * 인쇄 에이전트 Base URL 을 결정한다(우선순위: `?agent=` 쿼리 → fallback).
 *
 * LAN 상의 외부 PC 브라우저로 키오스크를 시험할 때, 하드코딩된
 * `http://127.0.0.1:8737` 는 테스터 자신의 PC 로 향해 키오스크 에이전트에
 * 도달하지 못한다. `?agent=http://<kiosk-ip>:8737` 로 런타임 재정의를 허용한다.
 *
 * 안전 장치:
 *   - `http:`/`https:` 스킴의 **순수 origin**(경로·쿼리·해시·자격증명 없음)만 허용.
 *   - 파싱 실패·형식 위반 값은 무시하고 `fallback`(기본 `http://127.0.0.1:8737`)으로 폴백.
 *   - localStorage 등 영속화는 하지 않는다 — 운영 배포에 재정의가 잔류하는 사고 방지.
 *   - 파라미터가 없으면 `fallback` 그대로 → 운영 키오스크 동작 불변.
 */
export function resolveAgentBase(search: string, fallback: string = DEFAULT_BASE): string {
  const override = new URLSearchParams(search).get('agent');
  if (!override) return fallback;

  let url: URL;
  try {
    url = new URL(override);
  } catch {
    return fallback; // 파싱 불가 → 기본값 폴백
  }

  // http/https 스킴만 허용
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return fallback;
  // 경로·쿼리·해시·자격증명이 붙은 값은 거부(순수 origin 만 허용)
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) return fallback;
  if (url.username || url.password) return fallback;

  return url.origin; // 정규화된 origin(후행 슬래시 제거)
}

/**
 * 프리뷰 모드 판정(순수 함수) — 빌드타임 env 와 런타임 쿼리를 모두 본다.
 *   - VITE_PRINT_PREVIEW=1  → 프리뷰 모드(빌드타임, 필수)
 *   - ?preview=1            → 프리뷰 모드(런타임, 재빌드 없이 시험)
 * 프리뷰 모드에서는 프린터 클라이언트 호출 자체를 생략하고 생성된 PNG 를 화면에 표시한다.
 * mock(VITE_PRINT_MOCK) 과는 독립적으로 동작한다.
 */
export function resolvePreviewMode(env: string | undefined, search: string): boolean {
  if (env === '1') return true;
  return new URLSearchParams(search).get('preview') === '1';
}

/** 현재 실행 환경(빌드 env + window 쿼리)에서 프리뷰 모드 여부를 판정한다. */
export function isPreviewMode(): boolean {
  const search = typeof window !== 'undefined' ? window.location.search : '';
  return resolvePreviewMode(
    import.meta.env.VITE_PRINT_PREVIEW as string | undefined,
    search,
  );
}

/**
 * 환경/쿼리 플래그로 클라이언트를 생성한다.
 *   - VITE_PRINT_MOCK=1  또는  ?mock=1     → mock 모드
 *   - ?printer=no_paper 등                 → mock 강제 상태(실패 분기 테스트)
 *   - VITE_PRINTER_BASE                    → 빌드 시 에이전트 Base URL 재정의
 *   - ?agent=http://<ip>:8737              → 런타임 에이전트 Base URL 재정의(외부 PC 시험용)
 */
export function createPrintClient(): PrintClient {
  const search = typeof window !== 'undefined' ? window.location.search : '';
  const params = new URLSearchParams(search);
  const forced = parseForcedState(params.get('printer'));
  const mockByEnv = import.meta.env.VITE_PRINT_MOCK === '1';
  const mockByQuery = params.get('mock') === '1' || forced !== undefined;

  if (mockByEnv || mockByQuery) {
    return new MockPrintClient(forced);
  }
  const envBase = (import.meta.env.VITE_PRINTER_BASE as string | undefined) ?? DEFAULT_BASE;
  const base = resolveAgentBase(search, envBase);
  return new HttpPrintClient(base);
}
