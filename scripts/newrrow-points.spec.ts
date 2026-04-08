import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { ENV, ensureRuntimeDirectories } from './lib/env.js';
import { ensureStorageState } from './lib/auth.js';
import { captureEvidence, logLine } from './lib/logging.js';
import { clickFirstVisible } from './lib/selectors.js';

type StepOutcome = 'verified' | 'performed' | 'skipped' | 'failed';

const POINT_LABELS = {
  todo: '[할일] 하루 동안 할일 1번 이상 등록',
  timetable: '[할일] 하루 동안 타임테이블 1번 이상 등록',
  assignedTraining: '[훈련] 하루 동안 지정 훈련 1번 이상 완료',
  selfTraining: '[훈련] 하루 동안 자율 훈련 1개 이상 완료',
  trainingScore4: '[훈련] 하루 동안 최소 1번 훈련 점수 4점 이상',
  dailyRetrospective: '[회고] 하루 동안 회고 1번 이상 작성',
  weeklyRetrospective: '[회고] 일주일 동안 주간 회고 1번 이상 완료',
  weeklyRetrospectiveScore4: '[회고] 주간 회고 점수 4점 이상',
  assignment: '[과제] 과제 1개 완료',
  csrQuestion: '[지식] 하루 동안 CSR 질문 1번 이상 생성',
  thanksCard: '[상호작용] 하루 동안 감사카드 1번 이상 전송',
  retrospectiveComment: '[상호작용] 하루 동안 회고 댓글 1개 이상 작성',
  retrospectiveShare: '[상호작용] 하루 동안 회고 1번 이상 공유',
  practiceGoal: '[습관] 하루 동안 실천목표 1개 이상 등록',
  dashboardView: '[모니터링] 하루 동안 대시보드 1번 이상 조회'
} as const;

const BUTTON_TEXTS = [/등록/, /추가/, /생성/, /저장/, /완료/, /제출/, /전송/, /공유/];
const TODAY = new Intl.DateTimeFormat('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })
  .format(new Date())
  .replace(/\. /g, '.')
  .replace(/\.$/, '');

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  ensureRuntimeDirectories();
  await ensureStorageState(browser);
});

test('complete point earning items as much as possible', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ storageState: ENV.storageStatePath });
  const page = await context.newPage();

  await goDashboard(page);
  await viewDashboardOnce(page, testInfo);
  await completeTodoOnce(page, testInfo);
  await createTimetableOnce(page, testInfo);
  await completeAssignedTraining(page, testInfo);
  await completeSelfTraining(page, testInfo);
  await earnTrainingScoreAtLeast4(page, testInfo);
  await writeDailyRetrospective(page, testInfo);
  await completeWeeklyRetrospective(page, testInfo);
  await earnWeeklyRetrospectiveScoreAtLeast4(page, testInfo);
  await completeOneAssignment(page, testInfo);
  await createOneCsrQuestion(page, testInfo);
  await sendOneThanksCard(page, testInfo);
  await writeOneRetrospectiveComment(page, testInfo);
  await shareOneRetrospective(page, testInfo);
  await addOnePracticeGoal(page, testInfo);

  await captureEvidence(page, testInfo, 'final-dashboard-state', 'info');
  await context.close();
});

async function runActionStep(page: Page, testInfo: TestInfo, stepName: string, body: () => Promise<StepOutcome>): Promise<StepOutcome> {
  logLine(`START ${stepName}`);
  try {
    const outcome = await body();
    await captureEvidence(page, testInfo, stepName, outcome === 'failed' ? 'failure' : 'success', `outcome=${outcome}`);
    logLine(`END ${stepName}: ${outcome}`);
    return outcome;
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    await captureEvidence(page, testInfo, stepName, 'failure', message);
    logLine(`END ${stepName}: failed`);
    return 'failed';
  }
}

async function goDashboard(page: Page): Promise<void> {
  await page.goto(`${ENV.baseUrl}${ENV.dashboardPath}`);
  await expect(page.getByRole('link', { name: '대시보드' })).toBeVisible({ timeout: 30_000 });
}

async function closeModalIfPresent(page: Page): Promise<void> {
  const closeButton = page.getByRole('button').filter({ has: page.locator('img') }).first();
  const dialogClose = page.getByRole('button', { name: /닫기|취소/ }).first();
  if (await dialogClose.isVisible().catch(() => false)) {
    await dialogClose.click();
    return;
  }
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click().catch(() => undefined);
  }
}

async function clickMyRankingRow(page: Page): Promise<void> {
  const myRow = page.getByRole('row', { name: /\(나\)/ }).first();
  await myRow.click();
  await expect(page.getByText('포인트 상세 내역')).toBeVisible({ timeout: 15_000 });
}

async function openPointItemsList(page: Page): Promise<void> {
  await clickMyRankingRow(page);
  const toggle = page.getByRole('button', { name: '포인트 받는 항목 보기' });
  if (await toggle.isVisible().catch(() => false)) {
    await toggle.click();
  }
}

async function verifyPointItemCompleted(page: Page, labelText: string): Promise<boolean> {
  await goDashboard(page);
  await clickMyRankingRow(page);

  const ledgerMatch = page.getByRole('row').filter({ hasText: labelText }).filter({ hasText: TODAY });
  if (await ledgerMatch.count().catch(() => 0)) {
    return true;
  }

  const pointItemToggle = page.getByRole('button', { name: '포인트 받는 항목 보기' });
  if (await pointItemToggle.isVisible().catch(() => false)) {
    await pointItemToggle.click();
    const pointItem = page.getByText(labelText, { exact: false });
    const pointItemVisible = await pointItem.isVisible().catch(() => false);
    if (pointItemVisible) {
      const rowText = await pointItem.locator('..').innerText().catch(() => '');
      if (/완료|획득|비활성|체크/i.test(rowText)) {
        return true;
      }
    }
  }

  return false;
}

async function selectMeaningfulInput(page: Page): Promise<Locator | null> {
  const candidates = [
    page.getByRole('textbox', { name: /제목|이름|업무|내용|질문|댓글|회고|목표/i }).first(),
    page.getByRole('textbox').first(),
    page.locator('textarea').first(),
    page.locator('input[type="text"]').first()
  ];
  for (const locator of candidates) {
    if (await locator.count().catch(() => 0) && await locator.isVisible().catch(() => false)) {
      return locator;
    }
  }
  return null;
}

async function clickActionButton(page: Page): Promise<boolean> {
  return clickFirstVisible(
    page,
    BUTTON_TEXTS.map((text) => (candidatePage: Page) => candidatePage.getByRole('button', { name: text }))
  );
}

async function dumpLinksAndButtons(page: Page): Promise<string> {
  const values = await page.evaluate(() => {
    const getText = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    return {
      links: Array.from(document.querySelectorAll('a')).map(getText).filter(Boolean),
      buttons: Array.from(document.querySelectorAll('button')).map(getText).filter(Boolean)
    };
  });
  return JSON.stringify(values, null, 2);
}

async function maybeSkipIfAlreadyCompleted(page: Page, label: string): Promise<boolean> {
  return verifyPointItemCompleted(page, label);
}

async function openTaskPage(page: Page): Promise<void> {
  await page.goto(`${ENV.baseUrl}/working-station/tasks`);
  await expect(page.getByText('할 일')).toBeVisible({ timeout: 30_000 });
}

async function viewDashboardOnce(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'view-dashboard-once', async () => {
    if (await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.dashboardView)) {
      return 'verified';
    }
    await goDashboard(page);
    return (await verifyPointItemCompleted(page, POINT_LABELS.dashboardView)) ? 'performed' : 'failed';
  });
}

async function completeTodoOnce(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'complete-todo-once', async () => {
    if (await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.todo)) {
      return 'verified';
    }
    await openTaskPage(page);
    const input = page.getByRole('textbox', { name: /업무를 등록해 주세요\./ }).first();
    await input.fill(`Playwright 자동 등록 테스트 ${Date.now()}`);
    await page.getByRole('button', { name: '추가' }).click();
    return (await verifyPointItemCompleted(page, POINT_LABELS.todo)) ? 'performed' : 'failed';
  });
}

async function createTimetableOnce(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'create-timetable-once', async () => {
    if (await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.timetable)) {
      return 'verified';
    }
    await openTaskPage(page);
    const slot = page.getByRole('button', { name: /시간 슬롯/ }).nth(100);
    if (await slot.isVisible().catch(() => false)) {
      await slot.click();
      const input = await selectMeaningfulInput(page);
      if (input) {
        await input.fill(`Playwright 자동 등록 테스트 ${new Date().toLocaleTimeString('ko-KR')}`);
      }
      await clickActionButton(page);
      await page.keyboard.press('Escape').catch(() => undefined);
    }
    return (await verifyPointItemCompleted(page, POINT_LABELS.timetable)) ? 'performed' : 'failed';
  });
}

async function openTrainingHome(page: Page): Promise<void> {
  await page.goto(`${ENV.baseUrl}/csr-platform/training/home`);
  await expect(page.getByText('훈련')).toBeVisible({ timeout: 30_000 });
  await closeModalIfPresent(page);
}

async function clickFirstTrainingCard(page: Page): Promise<boolean> {
  const card = page.getByRole('button').filter({ hasText: /훈련|소통|전략|협업|진행중/ }).nth(0);
  if (await card.isVisible().catch(() => false)) {
    await card.click();
    return true;
  }
  return false;
}

async function finishTrainingFlow(page: Page): Promise<void> {
  await clickActionButton(page);
  const starButtons = page.locator('button').filter({ has: page.locator('svg') });
  const starCount = await starButtons.count().catch(() => 0);
  if (starCount >= 5) {
    await starButtons.nth(4).click().catch(() => undefined);
  }
  await clickActionButton(page);
  await page.keyboard.press('Escape').catch(() => undefined);
}

async function completeAssignedTraining(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'complete-assigned-training', async () => {
    if (await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.assignedTraining)) {
      return 'verified';
    }
    await openTrainingHome(page);
    if (!(await clickFirstTrainingCard(page))) {
      throw new Error(`Could not open training card. Available controls: ${await dumpLinksAndButtons(page)}`);
    }
    await finishTrainingFlow(page);
    return (await verifyPointItemCompleted(page, POINT_LABELS.assignedTraining)) ? 'performed' : 'failed';
  });
}

async function completeSelfTraining(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'complete-self-training', async () => {
    if (await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.selfTraining)) {
      return 'verified';
    }
    await openTrainingHome(page);
    await clickFirstTrainingCard(page);
    await finishTrainingFlow(page);
    return (await verifyPointItemCompleted(page, POINT_LABELS.selfTraining)) ? 'performed' : 'failed';
  });
}

async function earnTrainingScoreAtLeast4(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'earn-training-score-at-least-4', async () => {
    if (await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.trainingScore4)) {
      return 'verified';
    }
    await openTrainingHome(page);
    await clickFirstTrainingCard(page);
    await finishTrainingFlow(page);
    return (await verifyPointItemCompleted(page, POINT_LABELS.trainingScore4)) ? 'performed' : 'failed';
  });
}

async function openReflectionHome(page: Page): Promise<void> {
  await page.goto(`${ENV.baseUrl}/csr-platform/reflection/home`);
  await expect(page.getByText('회고 피드')).toBeVisible({ timeout: 30_000 });
}

async function writeDailyRetrospective(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'write-daily-retrospective', async () => {
    if (await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.dailyRetrospective)) {
      return 'verified';
    }
    await openReflectionHome(page);
    await page.getByRole('button', { name: /일일 회고/ }).click();
    const input = await selectMeaningfulInput(page);
    if (input) {
      await input.fill('오늘 학습과 훈련을 진행했고 자동화 테스트를 수행했다.');
    }
    await clickActionButton(page);
    return (await verifyPointItemCompleted(page, POINT_LABELS.dailyRetrospective)) ? 'performed' : 'failed';
  });
}

async function completeWeeklyRetrospective(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'complete-weekly-retrospective', async () => {
    if (await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.weeklyRetrospective)) {
      return 'verified';
    }
    await openReflectionHome(page);
    await page.getByRole('button', { name: /주간 회고/ }).click();
    const input = await selectMeaningfulInput(page);
    if (input) {
      await input.fill('이번 주에는 과제, 훈련, 회고를 꾸준히 수행했다.');
    }
    await clickActionButton(page);
    return (await verifyPointItemCompleted(page, POINT_LABELS.weeklyRetrospective)) ? 'performed' : 'failed';
  });
}

async function earnWeeklyRetrospectiveScoreAtLeast4(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'earn-weekly-retrospective-score-at-least-4', async () => {
    if (await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.weeklyRetrospectiveScore4)) {
      return 'verified';
    }
    await openReflectionHome(page);
    await page.getByRole('button', { name: /주간 회고/ }).click();
    const starLike = page.locator('button').filter({ has: page.locator('svg') });
    if (await starLike.count().catch(() => 0) >= 5) {
      await starLike.nth(4).click();
    }
    await clickActionButton(page);
    return (await verifyPointItemCompleted(page, POINT_LABELS.weeklyRetrospectiveScore4)) ? 'performed' : 'failed';
  });
}

async function completeOneAssignment(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'complete-one-assignment', async () => {
    if (await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.assignment)) {
      return 'verified';
    }
    await page.goto(`${ENV.baseUrl}/csr-platform/submission/home`);
    await expect(page.getByText('과제 제출')).toBeVisible({ timeout: 30_000 });
    const targetRow = page.getByRole('row').filter({ hasText: /미제출/ }).first();
    await targetRow.click();
    const input = await selectMeaningfulInput(page);
    if (input) {
      await input.fill('Playwright 자동 제출 테스트 내용입니다.');
    }
    await clickActionButton(page);
    return (await verifyPointItemCompleted(page, POINT_LABELS.assignment)) ? 'performed' : 'failed';
  });
}

async function createOneCsrQuestion(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'create-one-csr-question', async () => {
    if (await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.csrQuestion)) {
      return 'verified';
    }
    await page.goto(`${ENV.baseUrl}/csr-platform/knowledge/csr-question`);
    await expect(page.getByText('CSR 질문')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('textbox', { name: /여러분의 질문을 기다리고 있어요!/ }).fill('CSR 활동을 꾸준히 하기 위한 방법은 무엇인가요?');
    await page.locator('button').filter({ has: page.locator('img') }).nth(1).click();
    return (await verifyPointItemCompleted(page, POINT_LABELS.csrQuestion)) ? 'performed' : 'failed';
  });
}

async function sendOneThanksCard(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'send-one-thanks-card', async () => {
    if (await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.thanksCard)) {
      return 'verified';
    }
    await openReflectionHome(page);
    await page.getByRole('button', { name: /감사 카드 보관함/ }).click();
    await clickActionButton(page);
    const input = await selectMeaningfulInput(page);
    if (input) {
      await input.fill('항상 도와줘서 고마워요!');
    }
    await clickActionButton(page);
    return (await verifyPointItemCompleted(page, POINT_LABELS.thanksCard)) ? 'performed' : 'failed';
  });
}

async function writeOneRetrospectiveComment(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'write-one-retrospective-comment', async () => {
    if (await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.retrospectiveComment)) {
      return 'verified';
    }
    await openReflectionHome(page);
    await page.getByRole('button').filter({ hasText: /코멘트|읽음|스티커 회고/ }).first().click();
    const input = await selectMeaningfulInput(page);
    if (input) {
      await input.fill('좋은 회고 잘 읽었습니다.');
    }
    await clickActionButton(page);
    return (await verifyPointItemCompleted(page, POINT_LABELS.retrospectiveComment)) ? 'performed' : 'failed';
  });
}

async function shareOneRetrospective(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'share-one-retrospective', async () => {
    if (await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.retrospectiveShare)) {
      return 'verified';
    }
    await openReflectionHome(page);
    await page.getByRole('button', { name: /오늘의 회고 작성을 완료하셨어요!/ }).click();
    await clickFirstVisible(page, [
      (candidatePage) => candidatePage.getByRole('button', { name: /공유/ }),
      (candidatePage) => candidatePage.getByText(/URL 복사|복사|공개/)
    ]);
    return (await verifyPointItemCompleted(page, POINT_LABELS.retrospectiveShare)) ? 'performed' : 'failed';
  });
}

async function addOnePracticeGoal(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'add-one-practice-goal', async () => {
    if (await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.practiceGoal)) {
      return 'verified';
    }
    await openReflectionHome(page);
    await page.getByRole('button', { name: /오늘의 회고 작성을 완료하셨어요!/ }).click();
    const input = await selectMeaningfulInput(page);
    if (input) {
      await input.fill('매일 30분 학습하기');
    }
    await clickActionButton(page);
    return (await verifyPointItemCompleted(page, POINT_LABELS.practiceGoal)) ? 'performed' : 'failed';
  });
}
