import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  blobToBase64,
  createPrintClient,
  interpretPrintResponse,
  mapErrorCode,
  stripDataUrlPrefix,
} from '../lib/printClient';

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
    expect(url).toBe('http://127.0.0.1:8737/v1/print');
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
