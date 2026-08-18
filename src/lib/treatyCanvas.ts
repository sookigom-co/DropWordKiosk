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
// portrait 인쇄물 최하단 이미지(보더 제공, 1775×864 RGBA). 외부 URL 없이 번들 자산으로 내재화(SOO-1108).
import footerImageUrl from '../assets/treaty-footer-print.png';

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

/**
 * 런타임 포맷 판정(순수 함수) — 빌드타임 env 와 런타임 쿼리를 모두 본다(resolvePreviewMode 선례).
 *   - ?print_type=landscape → landscape (재빌드 없이 시험, ?preview=1 과 동일한 방식)
 *   - ?print_type=portrait  → portrait (env 가 landscape 여도 런타임 쿼리가 우선)
 *   - 쿼리 미지정 → 빌드타임 env(VITE_PRINT_TYPE) 값으로 폴백
 * 쿼리 값이 있으면 항상 쿼리가 우선하고, 알 수 없는 값은 resolvePrintType 규칙에 따라 portrait.
 */
export function resolvePrintTypeRuntime(
  env: string | undefined,
  search: string,
): PrintType {
  const query = new URLSearchParams(search).get('print_type');
  if (query !== null && query.trim() !== '') return resolvePrintType(query);
  return resolvePrintType(env);
}

/** 현재 실행 환경(빌드 env + window 쿼리)에서 인쇄 포맷을 판정한다. */
export function currentPrintType(): PrintType {
  const search = typeof window !== 'undefined' ? window.location.search : '';
  return resolvePrintTypeRuntime(
    import.meta.env.VITE_PRINT_TYPE as string | undefined,
    search,
  );
}

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

/** landscape 로고를 90° 회전해 그릴 때의 크기(순수 함수 계산 결과). */
export interface LandscapeLogoLayout {
  /** 회전 전(자연 방향) 그릴 폭 = 회전 후 인쇄 폭(STRIP) 방향 길이. */
  drawWidth: number;
  /** 회전 전 그릴 높이 = 회전 후 가로 캔버스 폭 방향 두께. */
  drawHeight: number;
  /** 회전 후 가로 캔버스에서 로고가 차지하는 두께(px) = drawHeight. */
  thickness: number;
  /** 회전 후 STRIP(인쇄 폭) 방향 길이(px) = drawWidth. */
  length: number;
}

/**
 * landscape 로고를 90° 회전해 그릴 때의 렌더 크기를 계산한다(순수 함수 — 캔버스 없이 테스트).
 * 로고의 긴 변(원본 폭)을 인쇄 폭(strip)에서 상하 여백(marginY×2)을 뺀 길이에 비율 유지로 맞춘다.
 * 회전 후 최종 출력물에서 portrait 로고처럼 인쇄 폭 방향으로 가로로 눕는다.
 * 유효하지 않은 입력이면 {0,0,0,0}(그리지 않음).
 */
export function computeLandscapeLogoLayout(
  imgW: number,
  imgH: number,
  strip: number,
  marginY: number,
): LandscapeLogoLayout {
  const length = strip - marginY * 2;
  if (imgW <= 0 || imgH <= 0 || length <= 0) {
    return { drawWidth: 0, drawHeight: 0, thickness: 0, length: 0 };
  }
  const scale = length / imgW;
  const drawHeight = Math.round(imgH * scale);
  const drawWidth = Math.round(length);
  return { drawWidth, drawHeight, thickness: drawHeight, length: drawWidth };
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
  // 로고와 '평화 협정문' 제목 사이 세로 여백. 보더 요청(SOO-1104)으로 기존 24 → 2배(48).
  const LOGO_GAP_AFTER = 48;

  // 최하단 이미지 로드(SOO-1108 #2). 실패해도 본문은 렌더되도록 null 폴백(이미지만 생략).
  let footerImage: HTMLImageElement | null = null;
  try {
    footerImage = await loadImage(footerImageUrl);
  } catch {
    footerImage = null;
  }
  // 최하단 이미지는 로고와 동일하게 콘텐츠 폭(좌우 여백 제외)에 비율 유지로 맞춰 중앙 정렬한다.
  const footerImgW = footerImage ? footerImage.naturalWidth || footerImage.width : 0;
  const footerImgH = footerImage ? footerImage.naturalHeight || footerImage.height : 0;
  const footerImageSize = computeLogoSize(footerImgW, footerImgH, CONTENT_WIDTH);
  const hasFooterImage = footerImage !== null && footerImageSize.height > 0;
  // 서명부(작성일자)와 최하단 이미지 사이 세로 여백.
  const FOOTER_IMAGE_GAP_BEFORE = 40;

  // 측정용 임시 컨텍스트
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d')!;

  const titleFont = `bold 34px ${FONT_FAMILY}`;
  const bodyFont = `24px ${FONT_FAMILY}`;
  const article10Font = `bold 24px ${FONT_FAMILY}`;

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
  // 작성일자 줄은 제10조와 동일한 폰트 스타일(bold 24px, lineHeight 38)로 렌더한다(SOO-1108 #1).
  const footerDate = formatTreatyFooterDate(new Date());
  lines.push({ text: footerDate, font: article10Font, lineHeight: 38, align: 'center', gapAfter: 0 });

  // 전체 높이 계산 (최상단 로고 이미지 영역 포함)
  const PADDING_TOP = 48;
  const PADDING_BOTTOM = 56;
  let height = PADDING_TOP;
  if (hasLogo) height += logoSize.height + LOGO_GAP_AFTER;
  for (const line of lines) height += line.lineHeight + line.gapAfter;
  if (hasFooterImage) height += FOOTER_IMAGE_GAP_BEFORE + footerImageSize.height;
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

  // 최하단 이미지: 콘텐츠 폭 기준 비율 유지·중앙 정렬로 그린다(SOO-1108 #2).
  if (hasFooterImage && footerImage) {
    y += FOOTER_IMAGE_GAP_BEFORE;
    const footerX = Math.round((PRINT_WIDTH - footerImageSize.width) / 2);
    ctx.drawImage(footerImage, footerX, y, footerImageSize.width, footerImageSize.height);
    y += footerImageSize.height;
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
 *   - 가장 왼쪽: 인쇄 로고를 90° 회전해 그린다. 전체 캔버스 +90° 회전 파이프라인과 상쇄되어
 *     최종 출력물에서 portrait 로고와 동일한 방향(가로 밴드)으로 보인다(SOO-1104 #2).
 *   - 로고 오른쪽 본문:
 *       제1~9조 = 줄바꿈 없이 한 줄로 이어붙인 뒤, 제10조 줄 폭(W10)을 기준으로 자동 줄바꿈
 *                 → 여러 줄(SOO-1104 정정: 조별 줄바꿈이 아니라 W10 기준 word-wrap).
 *       제10조   = 완성 문장을 폰트 2배 + bold 로 한 줄에(줄바꿈 없음). 이 줄의 폭이 기준 폭.
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

  // 로고: 90° 회전 렌더 크기 계산. 긴 변(원본 폭)을 인쇄 폭(STRIP) 방향에 맞춰 눕힌다.
  const logoImgW = logo ? logo.naturalWidth || logo.width : 0;
  const logoImgH = logo ? logo.naturalHeight || logo.height : 0;
  const logoLayout = computeLandscapeLogoLayout(logoImgW, logoImgH, STRIP, MARGIN_Y);
  const hasLogo = logo !== null && logoLayout.thickness > 0;

  // 본문 폰트 — bodyFont(24px)와 그 2배 bold(48px).
  const BODY_FONT_PX = 24;
  const articlesFont = `${BODY_FONT_PX}px ${FONT_FAMILY}`;
  const article10Font = `bold ${BODY_FONT_PX * 2}px ${FONT_FAMILY}`;

  const articlesLine = buildArticlesOneLine(TREATY_ARTICLES);
  const article10Line = `제 10조  ${sentence}`;

  // 측정용 임시 컨텍스트
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d')!;
  // 제10조 한 줄 폭(W10) — 제1~9조 줄바꿈의 기준 폭이 된다.
  mctx.font = article10Font;
  const article10Width = mctx.measureText(article10Line).width;
  // 제1~9조 한 줄을 W10 기준으로 자동 줄바꿈(중간에서 잘라 여러 줄).
  mctx.font = articlesFont;
  const articleLines = wrapText(mctx, articlesLine, article10Width);

  // 본문 폭 = W10 (제1~9조 wrap 줄은 모두 W10 이하이므로 제10조가 가장 넓다).
  const bodyWidth = article10Width;

  // 본문 세로 배치(인쇄 폭 방향): 제1~9조 wrap 줄들(24px) 위, 제10조(48px bold) 아래.
  const ROW1_H = 34; // 24px 본문 줄 높이
  const ROW_GAP = 28; // 제1~9조 블록과 제10조 사이 간격
  const ROW2_H = 64; // 48px bold 제10조 줄 높이
  const articlesBlockH = articleLines.length * ROW1_H;
  const bodyBlockH = articlesBlockH + ROW_GAP + ROW2_H;

  const logoW = hasLogo ? logoLayout.thickness : 0;
  const bodyX = PAD_LEFT + logoW + (hasLogo ? LOGO_GAP : 0);

  // 가로 캔버스 전체 폭(= 회전 후 최종 PNG 높이). 콘텐츠에 따라 자연 확장.
  const wideWidth = Math.ceil(bodyX + bodyWidth + PAD_RIGHT);
  const wideHeight = STRIP;

  // upright 가로 캔버스 렌더
  const wide = document.createElement('canvas');
  wide.width = wideWidth;
  wide.height = wideHeight;
  const wctx = wide.getContext('2d')!;
  wctx.fillStyle = '#ffffff';
  wctx.fillRect(0, 0, wide.width, wide.height);

  // 로고: 90° 회전(-π/2, 반시계)으로 눕혀 그린다. 세로 중앙 정렬, 두께만큼 좌측 밴드.
  // 이후 전체 캔버스 +π/2 회전과 상쇄(net 0)되어 portrait 와 동일한 방향으로 인쇄된다.
  if (hasLogo && logo) {
    const cx = PAD_LEFT + logoLayout.thickness / 2;
    const cy = wideHeight / 2;
    wctx.save();
    wctx.translate(cx, cy);
    wctx.rotate(-Math.PI / 2);
    wctx.drawImage(
      logo,
      -logoLayout.drawWidth / 2,
      -logoLayout.drawHeight / 2,
      logoLayout.drawWidth,
      logoLayout.drawHeight,
    );
    wctx.restore();
  }

  // 본문(세로 중앙 정렬 블록)
  wctx.fillStyle = '#000000';
  wctx.textBaseline = 'top';
  wctx.textAlign = 'left';
  let ry = Math.round((wideHeight - bodyBlockH) / 2);
  wctx.font = articlesFont;
  for (const line of articleLines) {
    wctx.fillText(line, bodyX, ry);
    ry += ROW1_H;
  }
  ry += ROW_GAP;
  wctx.font = article10Font;
  wctx.fillText(article10Line, bodyX, ry);

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
 * 포맷은 currentPrintType() 에 따라 portrait(기본) / landscape 로 분기한다.
 *   - 빌드타임 VITE_PRINT_TYPE 또는 런타임 쿼리 ?print_type=landscape(?preview=1 방식) 로 지정.
 * 어느 포맷이든 최종 PNG 폭 = PRINT_WIDTH.
 */
export async function renderTreatyPng(
  sentence: string,
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const canvas =
    currentPrintType() === 'landscape'
      ? await renderTreatyCanvasLandscape(sentence)
      : await renderTreatyCanvas(sentence);
  const blob = await canvasToPngBlob(canvas);
  const dataUrl = canvas.toDataURL('image/png');
  return { blob, dataUrl, width: canvas.width, height: canvas.height };
}
