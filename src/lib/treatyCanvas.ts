// 협정문 캔버스 렌더링 → PNG(흑백).
// 폭 432px(2S 프린터 54mm / 2.12" 헤드의 인쇄 가능 폭 = 432dot @203dpi) 고정, 높이는 내용에 따라 가변.
//   - 과거 640dot → 576dot 으로, 다시 실기기(2S, 54mm)에 맞춰 432dot 으로 조정(SOO-1065).
//     헤드 폭보다 넓은 래스터는 오른쪽이 헤드 밖으로 잘려 나간다.
//   - 실기기 인쇄 가능 폭이 다를 경우 재빌드 없이 VITE_PRINT_WIDTH 로 재정의한다.
// 최상단 헤더는 보더 제공 로고 PNG(철원 국가유산 야행)를 번들 자산으로 내재화해 그린다(SOO-1101).
//   - 과거 '[ 철원국가유산야행 ]' 텍스트 플레이스홀더를 로고 이미지로 교체.
//   - 외부 URL 런타임 fetch 없이 src/assets 의 번들 자산을 사용한다.

import {
  TREATY_TITLE,
  TREATY_ARTICLES,
  formatTreatyFooterDate,
} from '../data/treaty';
// 인쇄 전용 로고(흑백 감열 대비, 2227×406 RGBA). 화면 로고와 별개 자산(화면 UI 미변경).
import logoPrintUrl from '../assets/logo-cheorwon-yahaeng-print.png';

/** 인쇄 PNG 기본 폭(dot). 2S 프린터(54mm / 2.12") 헤드의 인쇄 가능 폭 = 432dot @203dpi. */
export const DEFAULT_PRINT_WIDTH = 432;

/** VITE_PRINT_WIDTH(빌드타임, 양의 정수) 재정의를 파싱한다. 미지정·부정값이면 기본값. */
export function resolvePrintWidth(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_PRINT_WIDTH;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_PRINT_WIDTH;
}

export const PRINT_WIDTH = resolvePrintWidth(import.meta.env.VITE_PRINT_WIDTH);

/** 인쇄 포맷 종류. portrait(세로, 기본) | landscape(가로). */
export type PrintType = 'portrait' | 'landscape';

/** 인쇄 포맷 기본값 — 미지정·이상값이면 기존 세로 출력을 그대로 유지한다(회귀 0). */
export const DEFAULT_PRINT_TYPE: PrintType = 'portrait';

/**
 * VITE_PRINT_TYPE(빌드타임) 재정의를 파싱한다(resolvePrintWidth 선례).
 *   - 'landscape'(대소문자·공백 무시) → landscape
 *   - 그 외(미지정·빈 값·'portrait'·알 수 없는 값) → portrait 기본값
 */
export function resolvePrintType(raw: string | undefined): PrintType {
  return (raw ?? '').trim().toLowerCase() === 'landscape' ? 'landscape' : 'portrait';
}

export const PRINT_TYPE = resolvePrintType(import.meta.env.VITE_PRINT_TYPE);

const FONT_FAMILY = "'Pretendard', 'Gowun Dodum', sans-serif";
// 폭 축소(576→432)로 좌우 여백을 40→32 로 줄여 콘텐츠 폭(368px)을 최대한 확보해 가독성을 유지한다.
const MARGIN_X = 32;
export const CONTENT_WIDTH = PRINT_WIDTH - MARGIN_X * 2;

interface Line {
  text: string;
  font: string;
  lineHeight: number;
  align: CanvasTextAlign;
  gapAfter: number;
}

/**
 * 순수 줄바꿈 로직 — 문자열 폭 측정 함수(measure)를 주입받아 maxWidth 안에서 분할한다.
 * 캔버스 없이 단위 테스트 가능하도록 측정 방식을 분리했다.
 */
export function wrapTextByMeasure(
  measure: (text: string) => number,
  text: string,
  maxWidth: number,
): string[] {
  const chars = [...text];
  const lines: string[] = [];
  let current = '';
  for (const ch of chars) {
    const test = current + ch;
    if (measure(test) > maxWidth && current !== '') {
      lines.push(current);
      current = ch;
    } else {
      current = test;
    }
  }
  if (current !== '') lines.push(current);
  return lines.length > 0 ? lines : [''];
}

/** 캔버스 컨텍스트로 텍스트를 CONTENT_WIDTH 안에서 줄바꿈한다. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  return wrapTextByMeasure((t) => ctx.measureText(t).width, text, maxWidth);
}

/**
 * 로고 원본(imgW×imgH)을 목표 폭(targetW)에 맞춰 비율 유지로 축소한 렌더 크기를 계산한다.
 * PRINT_WIDTH(및 VITE_PRINT_WIDTH 재정의)가 바뀌어도 종횡비가 보존되도록 순수 함수로 분리해
 * 캔버스 없이 단위 테스트한다. 유효하지 않은 입력은 {0,0}(그리지 않음).
 */
export function computeLogoSize(
  imgW: number,
  imgH: number,
  targetW: number,
): { width: number; height: number } {
  if (imgW <= 0 || imgH <= 0 || targetW <= 0) return { width: 0, height: 0 };
  return { width: Math.round(targetW), height: Math.round((imgH / imgW) * targetW) };
}

/**
 * 제1~9조를 줄바꿈 없이 한 줄로 이어 붙인다(landscape 윗줄 본문).
 * 각 조문을 `제 N조  <조문>` 형태로 만들고 넉넉한 간격으로 연결한다. 순수 함수 — 단위 테스트 가능.
 */
export function buildArticlesOneLine(articles: readonly string[]): string {
  return articles.map((a, i) => `제 ${i + 1}조  ${a}`).join('    ');
}

/** 번들 자산 URL 로부터 이미지를 로드한다(로드 실패 시 reject). */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('로고 이미지 로드 실패'));
    img.src = src;
  });
}

/**
 * 협정문(로고 + 제1~9조 + 제10조 완성문장 + 서명부)을 PNG 로 렌더링한다.
 * 폰트 로딩 완료(document.fonts.ready)를 기다린 뒤 그린다.
 */
export async function renderTreatyCanvas(sentence: string): Promise<HTMLCanvasElement> {
  // 폰트가 로드되지 않은 상태로 canvas 에 그리면 fallback 글꼴로 렌더되므로 대기.
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      // 캔버스는 normal/bold 두 weight 를 모두 사용하므로 가변 폰트를 양쪽 weight 로 로드한다.
      await Promise.all([
        document.fonts.load(`28px ${FONT_FAMILY}`),
        document.fonts.load(`bold 28px ${FONT_FAMILY}`),
      ]);
      await document.fonts.ready;
    } catch {
      /* 폰트 로드 실패 시 fallback 으로 진행 */
    }
  }

  // 최상단 로고 이미지 로드. 실패해도 본문은 렌더되도록 null 로 폴백(헤더만 생략).
  let logo: HTMLImageElement | null = null;
  try {
    logo = await loadImage(logoPrintUrl);
  } catch {
    logo = null;
  }
  // 로고는 콘텐츠 폭(좌우 여백 제외)에 비율 유지로 맞춰 중앙 정렬한다.
  const logoImgW = logo ? logo.naturalWidth || logo.width : 0;
  const logoImgH = logo ? logo.naturalHeight || logo.height : 0;
  const logoSize = computeLogoSize(logoImgW, logoImgH, CONTENT_WIDTH);
  const hasLogo = logo !== null && logoSize.height > 0;
  // 기존 헤더 문구 자리와 비슷한 하단 여백.
  const LOGO_GAP_AFTER = 24;

  // 측정용 임시 컨텍스트
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d')!;

  const titleFont = `bold 34px ${FONT_FAMILY}`;
  const bodyFont = `24px ${FONT_FAMILY}`;
  const article10Font = `bold 24px ${FONT_FAMILY}`;
  const footerFont = `18px ${FONT_FAMILY}`;

  const lines: Line[] = [];

  // 최상단 로고는 텍스트 라인이 아닌 이미지로 그린다(아래 렌더 단계에서 배치).
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

  // 서명부 — 작성일자는 인쇄 시점의 기기 로컬 시간 기준으로 동적 생성(화면과 동일 포맷).
  // 최하단 작성자 문구('철원 국가유산 야행')는 상단 로고와 중복이므로 제거했다(SOO-1090).
  const footerDate = formatTreatyFooterDate(new Date());
  lines.push({ text: footerDate, font: footerFont, lineHeight: 28, align: 'center', gapAfter: 0 });

  // 전체 높이 계산 (최상단 로고 이미지 영역 포함)
  const PADDING_TOP = 48;
  const PADDING_BOTTOM = 56;
  let height = PADDING_TOP;
  if (hasLogo) height += logoSize.height + LOGO_GAP_AFTER;
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

  let y = PADDING_TOP;

  // 최상단 로고: 콘텐츠 폭 기준 비율 유지·중앙 정렬로 그린다.
  if (hasLogo && logo) {
    const logoX = Math.round((PRINT_WIDTH - logoSize.width) / 2);
    ctx.drawImage(logo, logoX, y, logoSize.width, logoSize.height);
    y += logoSize.height + LOGO_GAP_AFTER;
  }

  // 검은 텍스트
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  for (const line of lines) {
    ctx.font = line.font;
    ctx.textAlign = line.align;
    const x = line.align === 'center' ? PRINT_WIDTH / 2 : MARGIN_X;
    ctx.fillText(line.text, x, y);
    y += line.lineHeight + line.gapAfter;
  }

  return canvas;
}

/** 공통 폰트 로딩 대기(normal/bold 두 weight). 실패해도 fallback 으로 진행. */
async function awaitFonts(): Promise<void> {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await Promise.all([
        document.fonts.load(`28px ${FONT_FAMILY}`),
        document.fonts.load(`bold 28px ${FONT_FAMILY}`),
      ]);
      await document.fonts.ready;
    } catch {
      /* 폰트 로드 실패 시 fallback 으로 진행 */
    }
  }
}

/**
 * landscape(가로) 포맷 협정문을 PNG 로 렌더링한다.
 *
 * 감열 프린터의 인쇄 가능 폭은 PRINT_WIDTH 로 고정이므로, 가로로 긴 캔버스에 콘텐츠를
 * 세운 뒤(upright) 90° 회전하여 폭=PRINT_WIDTH 인 세로 PNG 로 내보낸다. 사용자는 출력물을
 * 90° 돌려 가로로 읽는다. 회전은 "가로 캔버스 가장 왼쪽 = 인쇄 시 최상단"이 되도록 한다
 * (시계방향 90°: 왼쪽 열 → 최상단 행).
 *
 * 가로 캔버스 레이아웃(높이 = PRINT_WIDTH):
 *   - 가장 왼쪽: 인쇄 로고(세로 중앙 정렬).
 *   - 로고 오른쪽 본문 두 줄:
 *       윗줄  = 제1~9조를 줄바꿈 없이 한 줄로.
 *       아랫줄 = 제10조(완성 문장)를 폰트 2배 + bold 로.
 */
export async function renderTreatyCanvasLandscape(sentence: string): Promise<HTMLCanvasElement> {
  await awaitFonts();

  // 최상단(가장 왼쪽) 로고 이미지 로드. 실패해도 본문은 렌더(로고만 생략).
  let logo: HTMLImageElement | null = null;
  try {
    logo = await loadImage(logoPrintUrl);
  } catch {
    logo = null;
  }

  // 가로 캔버스의 세로 크기 = 인쇄 폭(회전 후 최종 PNG 의 폭이 된다).
  const STRIP = PRINT_WIDTH;
  const MARGIN_Y = 28; // 인쇄 폭 방향 상하 여백
  const PAD_LEFT = 40; // 로고 앞 여백(회전 후 최상단 여백)
  const LOGO_GAP = 40; // 로고와 본문 사이 간격
  const PAD_RIGHT = 56; // 본문 뒤 여백(회전 후 최하단 여백)

  // 로고: 인쇄 폭 방향(세로)으로 적당한 높이에 맞추고 비율 유지로 폭을 계산한다.
  // 로고 원본은 매우 가로로 길어(≈5.5:1) 세로 폭 전체를 채우면 지나치게 길어지므로
  // 세로 폭의 절반 이하로 제한해 상단 밴드처럼 배치한다(보더 튜닝 여지 — 상수 조정).
  const LANDSCAPE_LOGO_HEIGHT = Math.min(160, STRIP - MARGIN_Y * 2);
  const logoImgW = logo ? logo.naturalWidth || logo.width : 0;
  const logoImgH = logo ? logo.naturalHeight || logo.height : 0;
  // computeLogoSize 는 폭 기준 축소이므로 높이 기준 환산을 위해 목표 폭을 역산한다.
  const logoTargetW =
    logoImgW > 0 && logoImgH > 0 ? (logoImgW / logoImgH) * LANDSCAPE_LOGO_HEIGHT : 0;
  const logoSize = computeLogoSize(logoImgW, logoImgH, logoTargetW);
  const hasLogo = logo !== null && logoSize.width > 0 && logoSize.height > 0;

  // 본문 폰트 — bodyFont(24px)와 그 2배 bold(48px).
  const BODY_FONT_PX = 24;
  const articlesFont = `${BODY_FONT_PX}px ${FONT_FAMILY}`;
  const article10Font = `bold ${BODY_FONT_PX * 2}px ${FONT_FAMILY}`;

  const articlesLine = buildArticlesOneLine(TREATY_ARTICLES);
  const article10Line = `제 10조  ${sentence}`;

  // 측정용 임시 컨텍스트
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d')!;
  mctx.font = articlesFont;
  const row1Width = mctx.measureText(articlesLine).width;
  mctx.font = article10Font;
  const row2Width = mctx.measureText(article10Line).width;
  const bodyWidth = Math.max(row1Width, row2Width);

  // 본문 두 줄의 세로 배치(인쇄 폭 방향)
  const ROW1_H = 34;
  const ROW_GAP = 28;
  const ROW2_H = 64;
  const bodyBlockH = ROW1_H + ROW_GAP + ROW2_H;

  const logoW = hasLogo ? logoSize.width : 0;
  const bodyX = PAD_LEFT + logoW + (hasLogo ? LOGO_GAP : 0);

  // 가로 캔버스 전체 폭(= 회전 후 최종 PNG 높이)
  const wideWidth = Math.ceil(bodyX + bodyWidth + PAD_RIGHT);
  const wideHeight = STRIP;

  // upright 가로 캔버스 렌더
  const wide = document.createElement('canvas');
  wide.width = wideWidth;
  wide.height = wideHeight;
  const wctx = wide.getContext('2d')!;
  wctx.fillStyle = '#ffffff';
  wctx.fillRect(0, 0, wide.width, wide.height);

  // 로고(세로 중앙 정렬)
  if (hasLogo && logo) {
    const logoY = Math.round((wideHeight - logoSize.height) / 2);
    wctx.drawImage(logo, PAD_LEFT, logoY, logoSize.width, logoSize.height);
  }

  // 본문 두 줄(세로 중앙 정렬 블록)
  wctx.fillStyle = '#000000';
  wctx.textBaseline = 'top';
  wctx.textAlign = 'left';
  const bodyTop = Math.round((wideHeight - bodyBlockH) / 2);
  wctx.font = articlesFont;
  wctx.fillText(articlesLine, bodyX, bodyTop);
  wctx.font = article10Font;
  wctx.fillText(article10Line, bodyX, bodyTop + ROW1_H + ROW_GAP);

  // 90° 회전 → 폭=PRINT_WIDTH 세로 PNG. (시계방향: 왼쪽 열 → 최상단 행)
  const canvas = document.createElement('canvas');
  canvas.width = wideHeight; // = PRINT_WIDTH
  canvas.height = wideWidth;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(wide, 0, 0);
  ctx.restore();

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

/**
 * 협정문 PNG 를 한 번에 생성 (미리보기 dataURL + 인쇄 전송용 Blob).
 * 포맷은 PRINT_TYPE(VITE_PRINT_TYPE) 에 따라 portrait(기본) / landscape 로 분기한다.
 * 어느 포맷이든 최종 PNG 폭 = PRINT_WIDTH.
 */
export async function renderTreatyPng(
  sentence: string,
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const canvas =
    PRINT_TYPE === 'landscape'
      ? await renderTreatyCanvasLandscape(sentence)
      : await renderTreatyCanvas(sentence);
  const blob = await canvasToPngBlob(canvas);
  const dataUrl = canvas.toDataURL('image/png');
  return { blob, dataUrl, width: canvas.width, height: canvas.height };
}
