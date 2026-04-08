# AGENTS.md

## 프로젝트 목적

뉴로우 CSR 포인트 획득 항목을 Playwright로 최대한 자동화하고, 실패 시 재현 가능한 증거를 남기는 것이 목적입니다.

## 빠른 시작

```bash
npm install
npx playwright install
npm run test:newrrow-points
```

## 작업 원칙

- `.env` 실제 값은 절대 커밋하지 않습니다.
- `.auth/`와 `artifacts/`도 커밋하지 않습니다.
- 각 액션은 성공 여부를 대시보드 포인트 적립 내역으로 다시 검증합니다.
- UI 변경이 보이면 fallback selector를 먼저 보정합니다.

## 완료 조건

- TypeScript 타입체크 통과
- Playwright 실행 가능
- 실제 headful 실행 로그와 스크린샷 확보
- README와 문서가 현재 실행 절차와 일치

## 수정 주의 경로

- `scripts/newrrow-points.spec.ts`
- `scripts/lib/*.ts`
- `.env`, `.env.example`, `.gitignore`

## 절대 하면 안 되는 것

- 실제 비밀값 커밋
- 검증하지 않은 성공 주장
- 실패 아티팩트 삭제로 문제 은폐
