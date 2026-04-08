# 뉴로우 포인트 자동화 스크립트

이 프로젝트는 부산SW마이스터고 뉴로우 CSR 대시보드의 `포인트 획득 항목`을 가능한 범위에서 순차적으로 수행하고, 각 단계의 성공 여부를 검증하기 위한 TypeScript + Playwright 자동화 스크립트입니다.

## 준비 사항

- Node.js 20 이상
- npm
- 로컬 `.env` 파일

## 환경 변수

`.env.example`을 참고해 `.env`를 준비하세요.

```env
NEWRROW_EMAIL=your-email@example.com
NEWRROW_PASSWORD=your-password-here
```

## 설치

```bash
npm install
npx playwright install
```

## 실행 방법

Headful 브라우저로 실행됩니다.

```bash
npm run test:newrrow-points
```

강제로 headed 플래그를 함께 쓰고 싶다면 아래 명령을 사용하세요.

```bash
npm run test:newrrow-points:headed
```

## 동작 방식

- 로그인 세션이 없거나 만료되면 `.auth/storageState.json`을 새로 생성합니다.
- 각 작업 후 대시보드로 돌아가 해당 포인트 항목이 오늘 날짜 기준으로 적립되었는지 확인합니다.
- 실패하면 전체 페이지 스크린샷과 본문 텍스트 로그를 `artifacts/`에 남깁니다.
- 이미 완료된 항목은 다시 시도하지 않고 검증 후 skip 처리합니다.

## 주요 파일

- `scripts/newrrow-points.spec.ts`: 메인 자동화 시나리오
- `scripts/lib/auth.ts`: 로그인 및 storageState 재사용
- `scripts/lib/env.ts`: `.env` 로딩과 런타임 경로 설정
- `scripts/lib/logging.ts`: 스크린샷/로그 아티팩트 저장
- `scripts/lib/selectors.ts`: fallback selector 유틸

## 검증 결과 확인 위치

- `artifacts/screenshots/`
- `artifacts/logs/`
- `playwright-report/`

## 현재 한계

- 뉴로우 서비스 UI가 변경되면 selector fallback을 보정해야 할 수 있습니다.
- 훈련, 과제, 회고, 감사카드 세부 플로우는 계정 상태와 당일 데이터에 따라 실행 가능 여부가 달라집니다.
- 일부 항목은 이미 완료되어 있으면 verify만 수행합니다.
