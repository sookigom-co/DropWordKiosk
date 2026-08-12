import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  blobToBase64,
  createPrintClient,
  interpretPrintResponse,
  mapErrorCode,
  resolveAgentBase,
  stripDataUrlPrefix,
} from '../lib/printClient';

// SOO-1029: 통합 배포에서 인쇄 호출은 same-origin 상대 경로('')로 나간다.
// 기본 base 는 빈 문자열이고, fetch(`${base}/v1/print`) → `/v1/print`(현재 origin) 가 된다.
const DEFAULT_BASE = '';

// 최소 PNG 시그니처 바이트로 만든 Blob(실제 인쇄 대상 대용).
function pngBlob(): Blob {
  return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], {
    type: 'image/png',
  });
}

function mockFetch(response: { ok: boolean; status: number; json: unknown }) {
  const fn = vi.fn(async () => ({
    ok: response.ok,
    status: response.status,
    json: async () => response.json,
  }));
  vi.stubGlobal('fetch', fn as unknown as typeof fetch);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('blobToBase64 / stripDataUrlPrefix', () => {
  it('PNG Blob 을 순수 base64(접두 없음)로 변환한다', async () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    const b64 = await blobToBase64(new Blob([bytes]));
    expect(b64).toBe(btoa(String.fromCharCode(...bytes)));
    expect(b64.startsWith('data:')).toBe(false);
    expect(b64.includes(',')).toBe(false);
  });

  it('data URL 접두가 있으면 순수 base64 만 남긴다', () => {
    expect(stripDataUrlPrefix('data:image/png;base64,AAAB')).toBe('AAAB');
    expect(stripDataUrlPrefix('AAAB')).toBe('AAAB');
  });
});

describe('mapErrorCode', () => {
  it('계약 v1 error.code 를 내부 PrinterState 로 매핑한다', () => {
    expect(mapErrorCode('NO_PAPER')).toBe('NO_PAPER');
    expect(mapErrorCode('COVER_OPEN')).toBe('COVER_OPEN');
    expect(mapErrorCode('PRINTER_OFFLINE')).toBe('OFFLINE');
    expect(mapErrorCode('BAD_IMAGE')).toBe('ERROR');
    expect(mapErrorCode('PAYLOAD_TOO_LARGE')).toBe('ERROR');
    expect(mapErrorCode('SOMETHING_ELSE')).toBe('ERROR');
    expect(mapErrorCode('no_paper')).toBe('NO_PAPER'); // 대소문자 무관
  });
});

describe('interpretPrintResponse', () => {
  it('성공: result === "printed" → ok + jobId', () => {
    const r = interpretPrintResponse(true, 200, { jobId: 'job-1', result: 'printed' });
    expect(r).toMatchObject({ ok: true, state: 'READY', jobId: 'job-1' });
  });

  it('실패 분기는 HTTP 상태가 아니라 error.code 기준이다', () => {
    // HTTP 는 200 이어도 error.code 가 있으면 실패로 판정
    const r = interpretPrintResponse(true, 200, { error: { code: 'NO_PAPER' } });
    expect(r.ok).toBe(false);
    expect(r.state).toBe('NO_PAPER');
  });

  it('error.message 가 있으면 그대로, 없으면 기본 문구를 채운다', () => {
    expect(interpretPrintResponse(false, 409, { error: { code: 'NO_PAPER', message: '용지 없음!' } }).message).toBe('용지 없음!');
    expect(interpretPrintResponse(false, 409, { error: { code: 'NO_PAPER' } }).message).toBe('용지가 부족합니다.');
  });

  it('구형 필드(ok/success)도 하위 호환으로 인식한다', () => {
    expect(interpretPrintResponse(true, 200, { ok: true, jobId: 'legacy' })).toMatchObject({
      ok: true,
      state: 'READY',
      jobId: 'legacy',
    });
  });
});

describe('HttpPrintClient.print (계약 v1 JSON base64)', () => {
  it('JSON 본문으로 imagePngBase64/cut/meta 를 전송한다', async () => {
    const fn = mockFetch({ ok: true, status: 200, json: { jobId: 'j1', result: 'printed' } });
    const client = createPrintClient();
    const meta = { modifier: '평화로운', target: '경계선', action: '지운다' };

    const result = await client.print(pngBlob(), meta);
    expect(result).toMatchObject({ ok: true, state: 'READY', jobId: 'j1' });

    expect(fn).toHaveBeenCalledTimes(1);
    const [url, init] = fn.mock.calls[0] as unknown as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    // 기본값(same-origin): 재정의가 없으면 상대 경로로 나간다.
    expect(url).toBe('/v1/print');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(init.body as string);
    expect(body.cut).toBe(true);
    expect(typeof body.imagePngBase64).toBe('string');
    expect(body.imagePngBase64.length).toBeGreaterThan(0);
    expect(body.imagePngBase64.startsWith('data:')).toBe(false);
    expect(body.meta).toEqual(meta);
  });

  it('meta 미전달 시 본문에 meta 키가 없다', async () => {
    const fn = mockFetch({ ok: true, status: 200, json: { jobId: 'j2', result: 'printed' } });
    const client = createPrintClient();
    await client.print(pngBlob());
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect('meta' in body).toBe(false);
  });

  const failures = [
    { code: 'NO_PAPER', status: 409, state: 'NO_PAPER' },
    { code: 'COVER_OPEN', status: 409, state: 'COVER_OPEN' },
    { code: 'PRINTER_OFFLINE', status: 503, state: 'OFFLINE' },
    { code: 'BAD_IMAGE', status: 400, state: 'ERROR' },
    { code: 'PAYLOAD_TOO_LARGE', status: 413, state: 'ERROR' },
  ] as const;

  for (const c of failures) {
    it(`error.code ${c.code}(${c.status}) → state ${c.state}, ok=false`, async () => {
      mockFetch({ ok: false, status: c.status, json: { error: { code: c.code } } });
      const client = createPrintClient();
      const result = await client.print(pngBlob());
      expect(result.ok).toBe(false);
      expect(result.state).toBe(c.state);
    });
  }

  it('네트워크 오류 시 OFFLINE 로 분기한다(완료로 넘기지 않음)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch,
    );
    const client = createPrintClient();
    const result = await client.print(pngBlob());
    expect(result.ok).toBe(false);
    expect(result.state).toBe('OFFLINE');
  });
});

describe('resolveAgentBase (?agent= 런타임 재정의)', () => {
  it('파라미터가 없으면 기본값을 그대로 사용한다(운영 동작 불변)', () => {
    expect(resolveAgentBase('')).toBe(DEFAULT_BASE);
    expect(resolveAgentBase('?mock=1')).toBe(DEFAULT_BASE);
    // 빈 값(agent=) 도 폴백
    expect(resolveAgentBase('?agent=')).toBe(DEFAULT_BASE);
  });

  it('유효한 http/https origin 이면 그 값으로 재정의한다', () => {
    expect(resolveAgentBase('?agent=http://192.168.0.50:8737')).toBe('http://192.168.0.50:8737');
    expect(resolveAgentBase('?agent=https://192.168.0.50:8737')).toBe('https://192.168.0.50:8737');
    // 후행 슬래시(순수 origin)는 정규화하여 제거
    expect(resolveAgentBase('?agent=http://192.168.0.50:8737/')).toBe('http://192.168.0.50:8737');
  });

  it('URL 인코딩된 값도 해석한다', () => {
    expect(resolveAgentBase('?agent=' + encodeURIComponent('http://192.168.0.50:8737'))).toBe(
      'http://192.168.0.50:8737',
    );
  });

  it('무효값은 무시하고 기본값으로 폴백한다', () => {
    // 비 http 스킴
    expect(resolveAgentBase('?agent=ftp://192.168.0.50:8737')).toBe(DEFAULT_BASE);
    expect(resolveAgentBase('?agent=' + encodeURIComponent('file:///etc/passwd'))).toBe(DEFAULT_BASE);
    // 파싱 실패(스킴 없음)
    expect(resolveAgentBase('?agent=192.168.0.50:8737')).toBe(DEFAULT_BASE);
    expect(resolveAgentBase('?agent=not-a-url')).toBe(DEFAULT_BASE);
    // 경로·쿼리·해시가 붙은 값 거부
    expect(resolveAgentBase('?agent=' + encodeURIComponent('http://192.168.0.50:8737/v1/print'))).toBe(
      DEFAULT_BASE,
    );
    expect(resolveAgentBase('?agent=' + encodeURIComponent('http://192.168.0.50:8737/?x=1'))).toBe(
      DEFAULT_BASE,
    );
    expect(resolveAgentBase('?agent=' + encodeURIComponent('http://192.168.0.50:8737#frag'))).toBe(
      DEFAULT_BASE,
    );
    // 자격증명 포함 거부
    expect(resolveAgentBase('?agent=' + encodeURIComponent('http://user:pw@192.168.0.50:8737'))).toBe(
      DEFAULT_BASE,
    );
  });

  it('명시된 fallback 인자를 존중한다(빌드 시 VITE_PRINTER_BASE 등)', () => {
    expect(resolveAgentBase('', 'http://10.0.0.9:8737')).toBe('http://10.0.0.9:8737');
    // ?agent= 유효값은 fallback 보다 우선
    expect(resolveAgentBase('?agent=http://192.168.0.50:8737', 'http://10.0.0.9:8737')).toBe(
      'http://192.168.0.50:8737',
    );
  });
});

// SOO-1029 인수 조건: 기본값(same-origin)·env 재정의·?agent= 재정의 3케이스와
// 우선순위(?agent= > VITE_PRINTER_BASE > same-origin)를 명시적으로 고정한다.
describe('Base URL 결정 규칙 (SOO-1029)', () => {
  it('기본값: 재정의가 없으면 same-origin 상대 경로("")', () => {
    // envBase 미설정(= DEFAULT_BASE = "") + ?agent= 없음 → same-origin
    expect(resolveAgentBase('')).toBe('');
    expect(DEFAULT_BASE).toBe('');
  });

  it('env 재정의: VITE_PRINTER_BASE(=fallback 인자)를 base 로 사용한다', () => {
    // createPrintClient 는 envBase = VITE_PRINTER_BASE ?? "" 를 fallback 으로 넘긴다.
    expect(resolveAgentBase('', 'http://127.0.0.1:8737')).toBe('http://127.0.0.1:8737');
  });

  it('?agent= 재정의가 env/기본값보다 우선한다', () => {
    // ?agent= > VITE_PRINTER_BASE
    expect(resolveAgentBase('?agent=http://192.168.0.50:8737', 'http://127.0.0.1:8737')).toBe(
      'http://192.168.0.50:8737',
    );
    // ?agent= > same-origin 기본값
    expect(resolveAgentBase('?agent=http://192.168.0.50:8737', '')).toBe('http://192.168.0.50:8737');
  });
});

describe('createPrintClient (?agent= 배선)', () => {
  it('?agent= 유효값이면 해당 origin 으로 요청한다', async () => {
    const original = window.location.search;
    Object.defineProperty(window, 'location', {
      value: { search: '?agent=http://192.168.0.50:8737' },
      writable: true,
      configurable: true,
    });
    try {
      const fn = mockFetch({ ok: true, status: 200, json: { jobId: 'j', result: 'printed' } });
      const client = createPrintClient();
      await client.print(pngBlob());
      const [url] = fn.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('http://192.168.0.50:8737/v1/print');
    } finally {
      Object.defineProperty(window, 'location', {
        value: { search: original },
        writable: true,
        configurable: true,
      });
    }
  });
});

describe('HttpPrintClient.getStatus', () => {
  it('fetch 실패 시 OFFLINE 로 간주한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('net');
      }) as unknown as typeof fetch,
    );
    const client = createPrintClient();
    const s = await client.getStatus();
    expect(s.state).toBe('OFFLINE');
  });
});
