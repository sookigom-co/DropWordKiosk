/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** '1' 이면 인쇄 API mock 모드 사용 */
  readonly VITE_PRINT_MOCK?: string;
  /** 인쇄 에이전트 Base URL 재정의 (기본 http://127.0.0.1:8737) */
  readonly VITE_PRINTER_BASE?: string;
  /** 인쇄 PNG 폭(dot) 재정의 (양의 정수, 미지정 시 576). SMK3S 실제 인쇄 가능 폭 대응용. */
  readonly VITE_PRINT_WIDTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
