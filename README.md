# DropWordKiosk — 평화 협정문 완성하기

철원 국가유산 야행 「평화 협정문 완성하기」 터치스크린 키오스크 체험 SPA (초기 스캐폴드).

- 대상 구동 환경: 라즈베리파이 Chromium 키오스크(터치, 완전 오프라인)
- 스택: React + TypeScript + Vite
- 관련 이슈: [SOO-993](/SOO/issues/SOO-993) (프론트), 부모 [SOO-992](/SOO/issues/SOO-992)

> 실제 체험 구현(17화면 상태 머신, 애니메이션 3종, 인쇄 연동)은 feature 브랜치 `soo-993` 에서 진행하며,
> main 대상 PR 오픈까지만 수행한다. **머지 금지 — 사용자(보더) 확인 후 머지.**

## 개발

```bash
npm install
npm run dev
npm run build
npm run lint
npm test
```
