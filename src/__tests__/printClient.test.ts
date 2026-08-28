import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  blobToBase64,
  createPrintClient,
  interpretPrintResponse,
  interpretExitKioskResponse,
  interpretPowerOffResponse,
  interpretOnlineResponse,
  interpretUpdateResponse,
  interpretRebootResponse,
  interpretRemoteSupportResponse,
  parseRemoteSupportStatus,
  remoteSupportLabel,
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

describe('interpretRebootResponse (SOO-1170 재부팅 계약)', () => {
  it('성공 200 { result: "rebooting" } → ok=true', () => {
    expect(interpretRebootResponse(true, 200, { result: 'rebooting' })).toMatchObject({ ok: true });
  });

  it('실패 500 { error: { code: REBOOT_FAILED, message } } → ok=false + message 전달', () => {
    const r = interpretRebootResponse(false, 500, {
      error: { code: 'REBOOT_FAILED', message: '재부팅 스크립트 실패' },
    });
    expect(r.ok).toBe(false);
    expect(r.message).toBe('재부팅 스크립트 실패');
  });

  it('error 만 있고 message 가 없으면 기본 안내 문구를 준다', () => {
    const r = interpretRebootResponse(false, 500, { error: { code: 'REBOOT_FAILED' } });
    expect(r.ok).toBe(false);
    expect(r.message).toBe('재부팅 요청에 실패했습니다.');
  });

  it('알 수 없는 응답은 HTTP 상태로 폴백한다', () => {
    const r = interpretRebootResponse(false, 502, {});
    expect(r.ok).toBe(false);
    expect(r.message).toContain('502');
  });
});

describe('HttpPrintClient.reboot (POST /v1/admin/reboot)', () => {
  it('성공 시 same-origin 상대 경로로 POST 하고 ok=true 를 반환한다', async () => {
    const fn = mockFetch({ ok: true, status: 200, json: { result: 'rebooting' } });
    const client = createPrintClient();
    const result = await client.reboot();
    expect(result.ok).toBe(true);
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/v1/admin/reboot');
    expect(init.method).toBe('POST');
  });

  it('네트워크 오류 시 ok=false(안내 문구) 로 분기한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch,
    );
    const client = createPrintClient();
    const result = await client.reboot();
    expect(result.ok).toBe(false);
    expect(result.message).toBeTruthy();
  });
});

describe('interpretExitKioskResponse (SOO-1182 키오스크 종료 계약)', () => {
  it('성공 200 { result: "exiting" } → ok=true', () => {
    expect(interpretExitKioskResponse(true, 200, { result: 'exiting' })).toMatchObject({ ok: true });
  });

  it('실패 500 { error: { code: EXIT_KIOSK_FAILED, message } } → ok=false + message 전달', () => {
    const r = interpretExitKioskResponse(false, 500, {
      error: { code: 'EXIT_KIOSK_FAILED', message: '종료 스크립트 실패' },
    });
    expect(r.ok).toBe(false);
    expect(r.message).toBe('종료 스크립트 실패');
  });

  it('error 만 있고 message 가 없으면 기본 안내 문구를 준다', () => {
    const r = interpretExitKioskResponse(false, 500, { error: { code: 'EXIT_KIOSK_FAILED' } });
    expect(r.ok).toBe(false);
    expect(r.message).toBe('키오스크 종료 요청에 실패했습니다.');
  });

  it('알 수 없는 응답은 HTTP 상태로 폴백한다', () => {
    const r = interpretExitKioskResponse(false, 502, {});
    expect(r.ok).toBe(false);
    expect(r.message).toContain('502');
  });
});

describe('HttpPrintClient.exitKiosk (POST /v1/admin/exit-kiosk)', () => {
  it('성공 시 same-origin 상대 경로로 POST 하고 ok=true 를 반환한다', async () => {
    const fn = mockFetch({ ok: true, status: 200, json: { result: 'exiting' } });
    const client = createPrintClient();
    const result = await client.exitKiosk();
    expect(result.ok).toBe(true);
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/v1/admin/exit-kiosk');
    expect(init.method).toBe('POST');
  });

  it('네트워크 오류 시 ok=false(안내 문구) 로 분기한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch,
    );
    const client = createPrintClient();
    const result = await client.exitKiosk();
    expect(result.ok).toBe(false);
    expect(result.message).toBeTruthy();
  });
});

describe('interpretPowerOffResponse (SOO-1196 시스템 종료 계약 v1)', () => {
  it('성공 형태 { ok: true } 를 ok=true 로 해석한다', () => {
    expect(interpretPowerOffResponse(true, 200, { ok: true })).toMatchObject({ ok: true });
  });

  it('하위 호환 성공 필드(result: "poweroff" / success)도 ok=true', () => {
    expect(interpretPowerOffResponse(true, 200, { result: 'poweroff' })).toMatchObject({ ok: true });
    expect(interpretPowerOffResponse(true, 200, { success: true })).toMatchObject({ ok: true });
  });

  it('error.message 가 있으면 그대로 안내한다', () => {
    const r = interpretPowerOffResponse(false, 500, {
      error: { code: 'POWEROFF_FAILED', message: '전원 종료에 실패했습니다.' },
    });
    expect(r.ok).toBe(false);
    expect(r.message).toBe('전원 종료에 실패했습니다.');
  });

  it('error.code 만 있으면 기본 안내 문구로 대체한다', () => {
    const r = interpretPowerOffResponse(false, 500, { error: { code: 'POWEROFF_FAILED' } });
    expect(r.ok).toBe(false);
    expect(r.message).toBeTruthy();
  });

  it('알 수 없는 형태는 HTTP 상태로 폴백한다', () => {
    const r = interpretPowerOffResponse(false, 502, {});
    expect(r.ok).toBe(false);
    expect(r.message).toContain('502');
  });
});

describe('HttpPrintClient.powerOff (POST /v1/admin/poweroff)', () => {
  it('성공 시 same-origin 상대 경로로 POST 하고 ok=true 를 반환한다', async () => {
    const fn = mockFetch({ ok: true, status: 200, json: { ok: true } });
    const client = createPrintClient();
    const result = await client.powerOff();
    expect(result.ok).toBe(true);
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/v1/admin/poweroff');
    expect(init.method).toBe('POST');
  });

  it('네트워크 오류 시 ok=false(안내 문구) 로 분기한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch,
    );
    const client = createPrintClient();
    const result = await client.powerOff();
    expect(result.ok).toBe(false);
    expect(result.message).toBeTruthy();
  });
});

describe('interpretOnlineResponse (SOO-1202 온라인 상태 계약 v1)', () => {
  it('online: true 를 online=true 로 해석한다', () => {
    expect(interpretOnlineResponse(true, 200, { online: true })).toMatchObject({
      ok: true,
      online: true,
    });
  });

  it('online: false 를 online=false 로 해석한다', () => {
    expect(interpretOnlineResponse(true, 200, { online: false })).toMatchObject({
      ok: true,
      online: false,
    });
  });

  it('불리언이 아닌 online 값은 false 로 안전 처리한다', () => {
    expect(interpretOnlineResponse(true, 200, { online: 'yes' })).toMatchObject({
      ok: true,
      online: false,
    });
    expect(interpretOnlineResponse(true, 200, {})).toMatchObject({ ok: true, online: false });
  });

  it('HTTP 오류 시 ok=false·online=false 로 폴백한다', () => {
    const r = interpretOnlineResponse(false, 500, {});
    expect(r.ok).toBe(false);
    expect(r.online).toBe(false);
    expect(r.message).toContain('500');
  });
});

describe('interpretUpdateResponse (SOO-1202 자동 업데이트 계약 v1)', () => {
  it('202 { ok: true } 를 성공으로 해석한다', () => {
    expect(interpretUpdateResponse(true, 202, { ok: true })).toMatchObject({ ok: true });
  });

  it('하위 호환 성공 필드(result: "updating" / success)도 ok=true', () => {
    expect(interpretUpdateResponse(true, 200, { result: 'updating' })).toMatchObject({ ok: true });
    expect(interpretUpdateResponse(true, 200, { success: true })).toMatchObject({ ok: true });
  });

  it('503 { detail: "offline" } 을 offline=true 로 분기한다', () => {
    const r = interpretUpdateResponse(false, 503, { detail: 'offline' });
    expect(r.ok).toBe(false);
    expect(r.offline).toBe(true);
    expect(r.message).toBeTruthy();
  });

  it('500 스크립트 오류는 detail 을 안내한다', () => {
    const r = interpretUpdateResponse(false, 500, { detail: 'update.sh exit 1' });
    expect(r.ok).toBe(false);
    expect(r.offline).toBeUndefined();
    expect(r.message).toBe('update.sh exit 1');
  });

  it('error.message 형태도 안내한다', () => {
    const r = interpretUpdateResponse(false, 500, { error: { message: '스크립트 실패' } });
    expect(r.ok).toBe(false);
    expect(r.message).toBe('스크립트 실패');
  });

  it('알 수 없는 실패는 HTTP 상태로 폴백한다', () => {
    const r = interpretUpdateResponse(false, 502, {});
    expect(r.ok).toBe(false);
    expect(r.message).toContain('502');
  });
});

describe('HttpPrintClient.getOnline / update (SOO-1202)', () => {
  it('getOnline: same-origin 상대 경로로 GET 하고 online 을 반환한다', async () => {
    const fn = mockFetch({ ok: true, status: 200, json: { online: true } });
    const client = createPrintClient();
    const result = await client.getOnline();
    expect(result).toMatchObject({ ok: true, online: true });
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/v1/admin/online');
    expect(init.method).toBe('GET');
  });

  it('getOnline: 네트워크 오류 시 ok=false·online=false 로 분기한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch,
    );
    const client = createPrintClient();
    const result = await client.getOnline();
    expect(result.ok).toBe(false);
    expect(result.online).toBe(false);
  });

  it('update: same-origin 상대 경로로 POST 하고 성공을 반환한다', async () => {
    const fn = mockFetch({ ok: true, status: 202, json: { ok: true } });
    const client = createPrintClient();
    const result = await client.update();
    expect(result.ok).toBe(true);
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/v1/admin/update');
    expect(init.method).toBe('POST');
  });

  it('update: 503 응답은 offline=true 로 분기한다', async () => {
    mockFetch({ ok: false, status: 503, json: { detail: 'offline' } });
    const client = createPrintClient();
    const result = await client.update();
    expect(result.ok).toBe(false);
    expect(result.offline).toBe(true);
  });
});

describe('parseRemoteSupportStatus / remoteSupportLabel (SOO-1186 원격 지원 계약 v1)', () => {
  it('상태 필드를 방어적으로 정규화한다', () => {
    const s = parseRemoteSupportStatus({
      desired: true,
      running: true,
      pid: 4242,
      startedAt: '2026-01-01T00:00:00Z',
      lastExitCode: 0,
      lastError: null,
    });
    expect(s).toEqual({
      desired: true,
      running: true,
      pid: 4242,
      startedAt: '2026-01-01T00:00:00Z',
      lastExitCode: 0,
      lastError: null,
    });
  });

  it('누락·비정상 필드는 안전 기본값(false/null)으로 채운다', () => {
    const s = parseRemoteSupportStatus({ desired: 'yes', pid: 'x', startedAt: '' });
    expect(s).toEqual({
      desired: false,
      running: false,
      pid: null,
      startedAt: null,
      lastExitCode: null,
      lastError: null,
    });
  });

  it('desired/running 조합을 한국어 라벨로 구분한다', () => {
    expect(remoteSupportLabel(null)).toBe('꺼짐');
    expect(remoteSupportLabel(parseRemoteSupportStatus({ desired: false }))).toBe('꺼짐');
    expect(remoteSupportLabel(parseRemoteSupportStatus({ desired: true, running: false }))).toBe(
      '연결 시도 중',
    );
    expect(remoteSupportLabel(parseRemoteSupportStatus({ desired: true, running: true }))).toBe(
      '연결됨',
    );
  });
});

describe('interpretRemoteSupportResponse (SOO-1186 원격 지원 계약 v1)', () => {
  it('성공 200 + 상태 객체 → ok=true + status 파싱', () => {
    const r = interpretRemoteSupportResponse(true, 200, {
      desired: true,
      running: false,
      pid: null,
      startedAt: null,
      lastExitCode: null,
      lastError: null,
    });
    expect(r.ok).toBe(true);
    expect(r.status).toMatchObject({ desired: true, running: false });
  });

  it('error 객체가 있으면 ok=false + message 전달', () => {
    const r = interpretRemoteSupportResponse(false, 500, {
      error: { code: 'REMOTE_SUPPORT_FAILED', message: '터널 기동 실패' },
    });
    expect(r.ok).toBe(false);
    expect(r.message).toBe('터널 기동 실패');
  });

  it('알 수 없는 실패 응답은 HTTP 상태로 폴백한다', () => {
    const r = interpretRemoteSupportResponse(false, 502, {});
    expect(r.ok).toBe(false);
    expect(r.message).toContain('502');
  });
});

describe('HttpPrintClient 원격 지원 (GET/POST /v1/admin/remote-support)', () => {
  it('GET 은 same-origin 상대 경로로 조회하고 status 를 반환한다', async () => {
    const fn = mockFetch({ ok: true, status: 200, json: { desired: true, running: true } });
    const client = createPrintClient();
    const result = await client.getRemoteSupport();
    expect(result.ok).toBe(true);
    expect(result.status?.running).toBe(true);
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/v1/admin/remote-support');
    expect(init.method).toBe('GET');
  });

  it('POST 는 { enabled } 바디로 토글한다', async () => {
    const fn = mockFetch({ ok: true, status: 200, json: { desired: true, running: false } });
    const client = createPrintClient();
    const result = await client.setRemoteSupport(true);
    expect(result.ok).toBe(true);
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/v1/admin/remote-support');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ enabled: true });
  });

  it('네트워크 오류 시 ok=false(안내 문구) 로 분기한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch,
    );
    const client = createPrintClient();
    const result = await client.setRemoteSupport(true);
    expect(result.ok).toBe(false);
    expect(result.message).toBeTruthy();
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
