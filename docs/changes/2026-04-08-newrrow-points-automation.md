# 변경 요약

## 배경

빈 저장소 상태에서 뉴로우 CSR 대시보드 포인트 획득 항목을 자동화할 수 있는 Playwright 프로젝트가 필요했습니다.

## 목표

- 로그인 세션 재사용
- headful 실행
- 각 액션 후 포인트 적립 여부 검증
- 실패 시 스크린샷과 로그 저장

## 변경 내용

- TypeScript + Playwright 프로젝트 초기화
- `scripts/newrrow-points.spec.ts` 메인 시나리오 추가
- env/auth/logging/selectors helper 추가
- README, AGENTS 문서 추가

## 설계 이유

- 저장소에 기존 코드가 없어 최소 구조부터 명시적으로 만들었습니다.
- 포인트 적립 여부는 대시보드 상세 내역의 오늘 날짜 행을 우선 증거로 사용하도록 설계했습니다.
- UI 변경에 대응하기 위해 selector fallback 유틸을 분리했습니다.

## 검증 방법

- `npm run typecheck`
- `npm run test:newrrow-points`
- headful 브라우저에서 실제 뉴로우 화면 동작 확인

## 영향 범위

- 새 Playwright 자동화 프로젝트 추가
- 기존 서비스 코드 수정 없음

## 남은 한계

- 일부 세부 플로우는 계정 상태와 당일 데이터에 따라 실패할 수 있습니다.
- 훈련/과제/회고 상세 화면 selector는 서비스 UI 변경 시 추가 보정이 필요할 수 있습니다.

## 후속 과제

- 실사용 실행 결과를 바탕으로 항목별 selector 정밀 보정
- 필요 시 항목별 helper를 더 세분화
