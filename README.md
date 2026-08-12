# DropWordKiosk — 평화 협정문 완성하기

철원 국가유산 야행 「평화 협정문 완성하기」 터치스크린 키오스크 체험 SPA.

- 대상 구동 환경: **라즈베리파이 Chromium 키오스크**(터치, **완전 오프라인**)
- 스택: **React + TypeScript + Vite**
- 프린터: **SEWOO SMK3S**(80mm / 640dot) — 로컬 인쇄 에이전트 연동
- 출처 문서: SOO-984 분석 문서 v7 §2(스토리보드 17화면), SOO-992 계획 문서 §3(API 계약)
- 관련 이슈: [SOO-993](/SOO/issues/SOO-993) (프론트), 부모 [SOO-992](/SOO/issues/SOO-992)

> ⚠ **머지 금지** — 본 리포는 사용자(보더) 확인 후 머지한다. 구현은 feature 브랜치 → main 대상 PR 오픈까지만.

## 빠른 시작

```bash
npm install
npm run dev            # 개발 서버
# 인쇄 에이전트 없이 전체 흐름을 보려면 mock 모드:
#   http://localhost:5173/?mock=1
```

> **dev 에서 실제 인쇄 시험 시 `VITE_PRINTER_BASE` 필수.**
> 통합 배포(에이전트가 kiosk `dist/` 를 서빙)에서는 인쇄 호출이 same-origin 상대 경로(`''`)로 나가
> 추가 설정이 필요 없다(SOO-1029). 하지만 dev 서버(Vite, 8080)는 SPA 만 서빙하므로 상대 경로가
> 에이전트로 가지 않는다. dev 에서 실제 에이전트로 인쇄를 보내려면 에이전트 절대 주소를 명시한다:
>
> ```bash
> VITE_PRINTER_BASE=http://127.0.0.1:8737 npm run dev
> ```
>
> 재정의 우선순위: `?agent=` > `VITE_PRINTER_BASE` > same-origin 기본값(`''`).

### 검증 게이트

```bash
npm run build          # tsc -b && vite build
npm run lint           # eslint
npm test               # vitest (josa 을/를 · 문장 조합 유닛 테스트)
```

## 화면 흐름 (12단계 / 17화면)

시작 → 인트로 → 협정문(1~9조 좌→우 등장 후 제10조 빈칸 확대) → STEP1 명사 선택(원형 버블) →
STEP2 형용사 선택(물리 낙하) → STEP3 동사 선택(정렬 낙하) → 문장 생성 로딩(3단계) →
완성 문장(검은 배경) → 인쇄 중 → 완료 → 10~15초 후 자동 초기화.

인쇄 실패(NO_PAPER/COVER_OPEN/OFFLINE/타임아웃) 시 **스태프 호출 화면**으로 분기한다.

### 문장 조합

`우리는 + [STEP2 형용사] + [STEP1 명사] + 을/를 + [STEP3 동사]`
예) `우리는 희망찬 미래를 만들어간다.`
명사 받침 유무에 따라 을/를 을 자동 처리한다(`src/lib/josa.ts`, 유닛 테스트 포함).

## 애니메이션 3종

| 단계 | 연출 | 구현 |
| --- | --- | --- |
| STEP1 | 버블이 뽀글뽀글 올라옴 | Framer Motion (spring stagger) |
| STEP2 | 낱말카드 물리 낙하 + 주황 원 파티클 | matter.js |
| STEP3 | 겹치지 않는 정렬 낙하 | Framer Motion (stagger, grid) |

화면 전환은 과한 애니메이션 없이 자연스럽게 처리한다. `prefers-reduced-motion` 존중.

## 인쇄 에이전트 계약 (v1)

인쇄 에이전트는 라즈베리파이 로컬 `http://127.0.0.1:8737` 에서 수신한다. 웹의 호출 Base URL 은
**통합 배포(에이전트가 kiosk `dist/` 를 same-origin 으로 서빙, SOO-1027 옵션 B)에서 same-origin
상대 경로(`''`)가 기본값**이며 추가 설정 없이 인쇄가 동작한다(SOO-1029). dev/외부 PC 시험에서는
`VITE_PRINTER_BASE`(빌드 시) 또는 `?agent=`(런타임)로 절대 주소를 재정의한다 — 우선순위
`?agent=` > `VITE_PRINTER_BASE` > same-origin 기본값.

- `GET  /v1/printer/status` — 인쇄 전 상태 확인. 상태 코드(READY/NO_PAPER/COVER_OPEN/OFFLINE 등)를 반환.
- `POST /v1/print` — `multipart/form-data`, 필드 `image` 에 협정문 PNG(640px 흑백) 전송.

응답 파싱은 방어적으로 작성(다양한 필드명 status/state/code, ok/success 허용)했다.
**정확한 JSON 스키마는 BackendCoder 와 최종 확정 필요** — 구현: `src/lib/printClient.ts`.

### mock 모드 (에이전트 없이 테스트)

| 쿼리/환경 | 동작 |
| --- | --- |
| `?mock=1` 또는 `VITE_PRINT_MOCK=1` | 인쇄 API mock. 완료 화면에서 PNG 미리보기/다운로드 |
| `?printer=no_paper` | 용지 부족 실패 분기(mock) |
| `?printer=cover_open` | 덮개 열림 실패 분기 |
| `?printer=offline` | 프린터 오프라인 실패 분기 |
| `?printer=error` | 일반 오류 분기 |

### 외부 PC 에서 시험 (LAN)

키오스크 SPA 를 같은 LAN 의 다른 PC 브라우저로 열어 실제 인쇄까지 시험할 때는 인쇄 에이전트 주소를 런타임으로 재정의한다(기본값 `http://127.0.0.1:8737` 은 테스터 자신의 PC 로 향하므로 키오스크 에이전트에 도달하지 못함):

```
http://<kiosk-ip>:8080/?agent=http://<kiosk-ip>:8737
```

- `?agent=` 값은 `http:`/`https:` 순수 origin(경로·쿼리 없음)만 허용하고, 부적합 값은 무시하고 기본값으로 폴백한다.
- 영속화하지 않으므로(파라미터가 없으면 즉시 기본값), 운영 키오스크 동작에는 영향이 없다.
- 백엔드 측 LAN 시험 완화(에이전트 바인딩 호스트·CORS)는 [SOO-1020](/SOO/issues/SOO-1020) 참조.

## 폰트 (오프라인 번들)

외부 CDN·원격 폰트 로드를 금지하므로 **Gowun Dodum(고운돋움)** 을 서브셋해 리포에 번들한다.

- 커밋 자산: `src/assets/fonts/GowunDodum-subset.woff2` (앱에서 쓰는 글자만, 약 44KB)
- 원본(약 7MB ttf)은 커밋하지 않는다.

콘텐츠(단어/협정문/UI 문구)를 바꾸면 서브셋을 다시 생성한다:

```bash
curl -L -o scripts/GowunDodum-source.ttf \
  "https://fonts.gstatic.com/s/gowundodum/v12/3Jn5SD_00GqwlBnWc1TUJF0F.ttf"
npm run subset-font   # → src/assets/fonts/GowunDodum-subset.woff2 재생성
```

라이선스: SIL Open Font License 1.1 (Google Fonts).

## 디자인 자산 교체 지점 (플레이스홀더)

미확보 자산은 플레이스홀더로 두었다. 확보되면 아래를 교체한다.

- **로고**: `src/components/Logo.tsx` 의 텍스트 박스 → `src/assets/img/` 이미지로 교체. 협정문 인쇄 로고는 `src/lib/treatyCanvas.ts` 의 로고 영역.
- **포인트 색상**: `src/index.css` 의 `--accent-*` (보라/주황/분홍). 정치 관련 색(빨강/파랑 단색)은 금지.
- **협정문 조문 텍스트**: `src/data/treaty.ts`.
- **단어 목록**: `src/data/words.ts`. (참고: STEP2 형용사는 스토리보드 원본 기준 21개 — 이슈 요약의 "20개"와 다름. 원본 우선.)
- **타이밍**(무입력 타임아웃/자동 리셋): `src/state/config.ts`.

## 접근성 / 모바일

- 360px 폭부터 대응, 터치 타깃 ≥ 44px.
- 각 화면 `main` 랜드마크 + `aria-label`, 진행바 `role="progressbar"`, 선택 버튼 `aria-pressed`.
- 키보드로 전 화면 이동 가능(버튼 포커스), `prefers-reduced-motion` 존중.

## 라이선스

사내 프로젝트. 폰트는 OFL 1.1.
