// 협정문 캔버스 렌더링 → PNG(흑백).
// 폭 640px(SMK3S 80mm / 640dot) 고정, 높이는 내용에 따라 가변.
// 로고는 디자인 자산 미확보 → 텍스트 플레이스홀더로 렌더(README 교체 지점 참조).

import {
  TREATY_TITLE,
  TREATY_ARTICLES,
  TREATY_FOOTER_DATE,
  TREATY_FOOTER_PLACE,
  LOGO_TEXT,
} from '../data/treaty';

export const PRINT_WIDTH = 640;

const FONT_FAMILY = "'Gowun Dodum', sans-serif";
const MARGIN_X = 48;
const CONTENT_WIDTH = PRINT_WIDTH - MARGIN_X * 2;

interface Line {
  text: string;
  font: string;
  lineHeight: number;
  align: CanvasTextAlign;
  gapAfter: number;
}

/** 캔버스 컨텍스트로 텍스트를 CONTENT_WIDTH 안에서 줄바꿈한다. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const chars = [...text];
  const lines: string[] = [];
  let current = '';
  for (const ch of chars) {
    const test = current + ch;
    if (ctx.measureText(test).width > maxWidth && current !== '') {
      lines.push(current);
      current = ch;
    } else {
      current = test;
    }
  }
  if (current !== '') lines.push(current);
  return lines.length > 0 ? lines : [''];
}

/**
 * 협정문(로고 + 제1~9조 + 제10조 완성문장 + 서명부)을 PNG 로 렌더링한다.
 * 폰트 로딩 완료(document.fonts.ready)를 기다린 뒤 그린다.
 */
export async function renderTreatyCanvas(sentence: string): Promise<HTMLCanvasElement> {
  // 폰트가 로드되지 않은 상태로 canvas 에 그리면 fallback 글꼴로 렌더되므로 대기.
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await document.fonts.load(`28px ${FONT_FAMILY}`);
      await document.fonts.ready;
    } catch {
      /* 폰트 로드 실패 시 fallback 으로 진행 */
    }
  }

  // 측정용 임시 컨텍스트
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d')!;

  const titleFont = `bold 34px ${FONT_FAMILY}`;
  const logoFont = `20px ${FONT_FAMILY}`;
  const bodyFont = `24px ${FONT_FAMILY}`;
  const article10Font = `bold 24px ${FONT_FAMILY}`;
  const footerFont = `18px ${FONT_FAMILY}`;

  const lines: Line[] = [];

  // 로고 플레이스홀더
  lines.push({ text: `[ ${LOGO_TEXT} ]`, font: logoFont, lineHeight: 30, align: 'center', gapAfter: 24 });
  // 제목
  lines.push({ text: TREATY_TITLE, font: titleFont, lineHeight: 46, align: 'center', gapAfter: 40 });

  // 제1~9조
  TREATY_ARTICLES.forEach((article, idx) => {
    mctx.font = bodyFont;
    const full = `제 ${idx + 1}조  ${article}`;
    const wrapped = wrapText(mctx, full, CONTENT_WIDTH);
    wrapped.forEach((w, i) => {
      lines.push({
        text: w,
        font: bodyFont,
        lineHeight: 38,
        align: 'left',
        gapAfter: i === wrapped.length - 1 ? 14 : 0,
      });
    });
  });

  // 제10조 — 완성 문장
  mctx.font = article10Font;
  const article10 = `제 10조  ${sentence}`;
  const wrapped10 = wrapText(mctx, article10, CONTENT_WIDTH);
  wrapped10.forEach((w, i) => {
    lines.push({
      text: w,
      font: article10Font,
      lineHeight: 38,
      align: 'left',
      gapAfter: i === wrapped10.length - 1 ? 48 : 0,
    });
  });

  // 서명부
  lines.push({ text: TREATY_FOOTER_DATE, font: footerFont, lineHeight: 28, align: 'center', gapAfter: 4 });
  lines.push({ text: TREATY_FOOTER_PLACE, font: footerFont, lineHeight: 28, align: 'center', gapAfter: 0 });

  // 전체 높이 계산
  const PADDING_TOP = 48;
  const PADDING_BOTTOM = 56;
  let height = PADDING_TOP;
  for (const line of lines) height += line.lineHeight + line.gapAfter;
  height += PADDING_BOTTOM;

  // 실제 렌더 (고해상도 보장을 위해 정수 픽셀 사용)
  const canvas = document.createElement('canvas');
  canvas.width = PRINT_WIDTH;
  canvas.height = Math.ceil(height);
  const ctx = canvas.getContext('2d')!;

  // 흰 배경
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 검은 텍스트
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  let y = PADDING_TOP;
  for (const line of lines) {
    ctx.font = line.font;
    ctx.textAlign = line.align;
    const x = line.align === 'center' ? PRINT_WIDTH / 2 : MARGIN_X;
    ctx.fillText(line.text, x, y);
    y += line.lineHeight + line.gapAfter;
  }

  return canvas;
}

/** 캔버스를 PNG Blob 으로 변환 */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('canvas.toBlob 실패'));
    }, 'image/png');
  });
}

/** 협정문 PNG 를 한 번에 생성 (미리보기 dataURL + 인쇄 전송용 Blob) */
export async function renderTreatyPng(
  sentence: string,
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const canvas = await renderTreatyCanvas(sentence);
  const blob = await canvasToPngBlob(canvas);
  const dataUrl = canvas.toDataURL('image/png');
  return { blob, dataUrl, width: canvas.width, height: canvas.height };
}
