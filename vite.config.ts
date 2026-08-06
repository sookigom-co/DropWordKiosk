/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 라즈베리파이 Chromium 키오스크(완전 오프라인) 대상.
// - base: './' → 상대 경로 자산 참조(파일/서브패스 어디에 배포하든 동작)
// - assetsInlineLimit: 0 → 폰트/이미지를 인라인 data URI 로 바꾸지 않고 파일로 유지(캐시·용량 예측)
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    // 폰트 서브셋(woff2)이 커질 수 있어 경고 임계값을 상향.
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
