import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { ENV, ensureRuntimeDirectories } from './lib/env.js';
import { ensureAuthenticatedPage, ensureStorageState } from './lib/auth.js';
import { captureEvidence, logLine } from './lib/logging.js';
import { actionButtonCandidates, bySelectors, byTestIds, clickFirstVisible, firstVisible, textboxCandidates } from './lib/selectors.js';

type StepOutcome = 'verified' | 'performed' | 'attempted' | 'skipped' | 'failed';

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
  await context.close().catch(() => undefined);
});

function logStep(name: string): void {
  logLine(name);
}

async function runActionStep(page: Page, testInfo: TestInfo, stepName: string, body: () => Promise<StepOutcome>): Promise<StepOutcome> {
  logStep(`START ${stepName}`);
  try {
    const outcome = await body();
    await captureEvidence(page, testInfo, stepName, outcome === 'failed' ? 'failure' : 'success', `outcome=${outcome}`);
    logStep(`END ${stepName}: ${outcome}`);
    return outcome;
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    await captureEvidence(page, testInfo, stepName, 'failure', message);
    logStep(`END ${stepName}: failed`);
    return 'failed';
  }
}

async function waitForUiStable(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(500);
}

async function captureDebug(page: Page, testInfo: TestInfo, tag: string): Promise<void> {
  const summary = await collectVisibleButtonsAndLinks(page);
  await captureEvidence(page, testInfo, tag, 'info', JSON.stringify(summary, null, 2));
}

async function smartClick(page: Page, locatorCandidates: Array<(page: Page) => Locator>): Promise<boolean> {
  return clickFirstVisible(page, locatorCandidates);
}

async function smartFill(page: Page, locatorCandidates: Array<(page: Page) => Locator>, value: string): Promise<boolean> {
  const locator = await firstVisible(page, locatorCandidates);
  if (!locator) {
    return false;
  }
  await locator.fill(value);
  return true;
}

async function smartPressNext(page: Page): Promise<boolean> {
  return smartClick(page, actionButtonCandidates([/다음/, /시작/, /진행/, /확인/, /평가/], ['next', 'confirm', 'start']));
}

async function goDashboard(page: Page): Promise<void> {
  await page.goto(`${ENV.baseUrl}${ENV.dashboardPath}`);
  await waitForUiStable(page);
  const dashboardVisible = await page.getByRole('link', { name: '대시보드' }).isVisible().catch(() => false);
  if (!dashboardVisible) {
    await ensureAuthenticatedPage(page);
    await page.goto(`${ENV.baseUrl}${ENV.dashboardPath}`);
    await waitForUiStable(page);
  }
  await expect(page.getByRole('link', { name: '대시보드' })).toBeVisible({ timeout: 30_000 });
}

async function closeModalIfAny(page: Page): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    const onboardingNext = page.getByRole('button', { name: /다음|확인|시작/ }).first();
    const dontShowAgain = page.getByRole('checkbox', { name: /더 이상 보지 않기/ }).first();
    const tutorialVisible = await page.getByText(/더 이상 보지 않기|완료 이력/).first().isVisible().catch(() => false);
    if (!tutorialVisible && !await onboardingNext.isVisible().catch(() => false)) {
      break;
    }
    if (await dontShowAgain.isVisible().catch(() => false)) {
      await dontShowAgain.check().catch(() => undefined);
    }
    if (await onboardingNext.isVisible().catch(() => false)) {
      await onboardingNext.click().catch(() => undefined);
      await page.waitForTimeout(400);
      continue;
    }
    break;
  }
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

async function closeModalIfPresent(page: Page): Promise<void> {
  await closeModalIfAny(page);
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

async function verifyPointProgress(page: Page, itemText: string): Promise<boolean> {
  return verifyPointItemCompleted(page, itemText);
}

async function selectMeaningfulInput(page: Page): Promise<Locator | null> {
  return firstVisible(
    page,
    textboxCandidates({
      testIds: ['title', 'name', 'content', 'question', 'comment', 'goal', 'task-title', 'task-content'],
      names: [/제목|이름|업무|내용|질문|댓글|회고|목표/i],
      placeholders: [/업무를 등록해 주세요|여러분의 질문을 기다리고 있어요/i]
    })
  );
}

async function clickActionButton(page: Page): Promise<boolean> {
  return clickFirstVisible(page, actionButtonCandidates(BUTTON_TEXTS, ['submit', 'save', 'create', 'add', 'complete', 'send', 'share']));
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

async function collectVisibleButtonsAndLinks(page: Page): Promise<{ links: string[]; buttons: string[]; headings: string[]; url: string }> {
  return page.evaluate(() => {
    const visibleText = (selector: string) =>
      Array.from(document.querySelectorAll(selector))
        .filter((element) => {
          const htmlElement = element as HTMLElement;
          const rect = htmlElement.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);

    return {
      links: visibleText('a'),
      buttons: visibleText('button, [role="button"], input[type="button"], input[type="submit"]'),
      headings: visibleText('h1, h2, h3, [role="heading"]'),
      url: window.location.href
    };
  });
}

async function maybeSkipIfAlreadyCompleted(page: Page, label: string): Promise<boolean> {
  return verifyPointItemCompleted(page, label);
}

function shouldForceAction(actionKey: string): boolean {
  return ENV.forceActionKeys.includes('all') || ENV.forceActionKeys.includes(actionKey);
}

async function openTaskPage(page: Page): Promise<void> {
  await page.goto(`${ENV.baseUrl}/working-station/tasks`);
  await waitForUiStable(page);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const ready = await firstVisible(page, [
      ...textboxCandidates({
        testIds: ['task-input', 'task-title', 'task-content'],
        placeholders: [/업무를 등록해 주세요\./]
      }),
      (candidatePage) => candidatePage.getByRole('button', { name: /할 일 추가|추가/ }),
      (candidatePage) => candidatePage.getByRole('button', { name: /시간 슬롯/ }).first()
    ]);
    if (ready) {
      return;
    }
    await page.reload();
    await waitForUiStable(page);
  }
  throw new Error(`Task page content did not become ready. Visible UI: ${JSON.stringify(await collectVisibleButtonsAndLinks(page))}`);
}

async function openLeftMenuItemByKeywords(page: Page, keywords: string[]): Promise<boolean> {
  const regex = new RegExp(keywords.join('|'));
  return smartClick(page, [
    ...byTestIds(...keywords.map((keyword) => `${keyword}-menu`)),
    (candidatePage) => candidatePage.getByRole('link', { name: regex }),
    (candidatePage) => candidatePage.getByRole('button', { name: regex }),
    (candidatePage) => candidatePage.getByText(regex).locator('..')
  ]);
}

async function tryBackToList(page: Page): Promise<void> {
  await closeModalIfAny(page);
  await page.goBack().catch(() => undefined);
  await waitForUiStable(page);
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
    if (!shouldForceAction('todo') && await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.todo)) {
      return 'verified';
    }
    await openTaskPage(page);
    const input = await firstVisible(page, textboxCandidates({
      testIds: ['task-input', 'task-title', 'task-content'],
      placeholders: [/업무를 등록해 주세요\./]
    }));
    if (!input) {
      throw new Error(`Todo input not found. Available controls: ${await dumpLinksAndButtons(page)}`);
    }
    await input.fill(`Playwright 자동 등록 테스트 ${Date.now()}`);
    await clickActionButton(page);
    return (await verifyPointItemCompleted(page, POINT_LABELS.todo)) ? 'performed' : 'attempted';
  });
}

async function createTimetableOnce(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'create-timetable-once', async () => {
    if (!shouldForceAction('timetable') && await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.timetable)) {
      return 'verified';
    }
    await openTaskPage(page);
    const slot = page.getByRole('button', { name: /시간 슬롯/ }).nth(100);
    if (!(await slot.isVisible().catch(() => false))) {
      throw new Error(`Timetable slot not found. Visible UI: ${JSON.stringify(await collectVisibleButtonsAndLinks(page))}`);
    }

    await slot.click();
    await waitForUiStable(page);

    const titleFilled = await smartFill(
      page,
      textboxCandidates({
        testIds: ['schedule-title', 'timetable-title', 'task-title', 'title'],
        names: [/업무명|제목|이름/i],
        placeholders: [/업무명|제목/i]
      }),
      `시간표 자동 등록 ${new Date().toLocaleTimeString('ko-KR')}`
    );

    if (!titleFilled) {
      throw new Error(`Timetable title input not found. Visible UI: ${JSON.stringify(await collectVisibleButtonsAndLinks(page))}`);
    }

    const allDayCheckbox = await firstVisible(page, [
      ...byTestIds('all-day', 'allDay', 'whole-day'),
      (candidatePage) => candidatePage.getByRole('checkbox', { name: /하루 종일/ }),
      (candidatePage) => candidatePage.locator('input[type="checkbox"]').first()
    ]);
    if (allDayCheckbox) {
      await allDayCheckbox.check().catch(async () => {
        await allDayCheckbox.click().catch(() => undefined);
      });
    }

    const priorityCombo = await firstVisible(page, [
      ...byTestIds('priority', 'importance', 'priority-select'),
      (candidatePage) => candidatePage.getByRole('combobox', { name: /중요도|우선순위/ }),
      (candidatePage) => candidatePage.locator('select').first()
    ]);
    if (priorityCombo) {
      await priorityCombo.selectOption({ index: 0 }).catch(() => undefined);
    }

    const timeInputs = page.locator('input[type="time"]');
    const timeCount = await timeInputs.count().catch(() => 0);
    if (timeCount >= 2) {
      await timeInputs.nth(0).fill('18:00').catch(() => undefined);
      await timeInputs.nth(1).fill('19:00').catch(() => undefined);
    }

    const saved = await smartClick(page, [
      ...byTestIds('save', 'save-schedule', 'submit-schedule'),
      (candidatePage) => candidatePage.getByRole('button', { name: /저장|등록|추가/ }),
      (candidatePage) => candidatePage.getByText(/저장|등록|추가/)
    ]);

    if (!saved) {
      throw new Error(`Timetable save button not found. Visible UI: ${JSON.stringify(await collectVisibleButtonsAndLinks(page))}`);
    }

    await waitForUiStable(page);
    await page.keyboard.press('Escape').catch(() => undefined);
    return (await verifyPointItemCompleted(page, POINT_LABELS.timetable)) ? 'performed' : 'attempted';
  });
}

async function openTrainingHome(page: Page): Promise<void> {
  await page.goto(`${ENV.baseUrl}/csr-platform/training/home`);
  await waitForUiStable(page);
  const trainingReady = await page.getByText('추천 훈련 유형').isVisible().catch(() => false);
  if (!trainingReady) {
    await openLeftMenuItemByKeywords(page, ['프로그램']);
    await waitForUiStable(page);
    await openLeftMenuItemByKeywords(page, ['훈련', '기본']);
    await waitForUiStable(page);
  }
  await expect(page.getByText('추천 훈련 유형')).toBeVisible({ timeout: 30_000 });
  await closeModalIfPresent(page);
}

async function clickTrainingCard(page: Page, mode: 'assigned' | 'self' | 'score'): Promise<boolean> {
  await closeModalIfAny(page);
  const candidates = {
    assigned: [
      /전략 도구 활용하기: 아이젠하워 매트릭스/,
      /진행중/,
      /오늘 해야 할 훈련/
    ],
    self: [
      /나만의 소통 훈련 만들기/,
      /면접훈련/,
      /소통 \(대화형\)/
    ],
    score: [
      /면접훈련/,
      /전략 도구 활용하기: 아이젠하워 매트릭스/,
      /다른 사람의 작업물에 대해 피드백하기/
    ]
  }[mode];

  const factories = candidates.flatMap((pattern) => [
    (candidatePage: Page) => candidatePage.getByRole('button', { name: pattern }),
    (candidatePage: Page) => candidatePage.getByText(pattern),
    (candidatePage: Page) => candidatePage.locator('button').filter({ hasText: pattern })
  ]);

  if (await smartClick(page, factories)) {
    return true;
  }

  return smartClick(page, [
    (candidatePage) => candidatePage.getByRole('button').filter({ hasText: /훈련|소통|전략|협업|진행중/ }).first(),
    (candidatePage) => candidatePage.getByText(/훈련|소통|전략|협업|진행중/).first()
  ]);
}

async function finishTrainingFlow(page: Page, requireHighScore: boolean): Promise<void> {
  await clickActionButton(page);
  if (requireHighScore) {
    const starButtons = page.locator('button').filter({ has: page.locator('svg') });
    const starCount = await starButtons.count().catch(() => 0);
    if (starCount >= 5) {
      await starButtons.nth(4).click().catch(() => undefined);
    }
  }
  await clickActionButton(page);
  await page.keyboard.press('Escape').catch(() => undefined);
}

async function clickFirstTrainingCard(page: Page): Promise<boolean> {
  const card = page.getByRole('button').filter({ hasText: /훈련|소통|전략|협업|진행중/ }).nth(0);
  if (await card.isVisible().catch(() => false)) {
    await card.click();
    return true;
  }
  return false;
}

async function runTrainingAction(page: Page, mode: 'assigned' | 'self' | 'score', label: string, requireHighScore: boolean): Promise<StepOutcome> {
  const trainingPage = await page.context().newPage();
  try {
    await openTrainingHome(trainingPage);
    if (!(await clickTrainingCard(trainingPage, mode))) {
      return 'attempted';
    }
    await finishTrainingFlow(trainingPage, requireHighScore);
    return (await verifyPointItemCompleted(trainingPage, label)) ? 'performed' : 'attempted';
  } finally {
    await trainingPage.close().catch(() => undefined);
  }
}

async function completeAssignedTraining(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'complete-assigned-training', async () => {
    if (!shouldForceAction('assignedTraining') && await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.assignedTraining)) {
      return 'verified';
    }
    return runTrainingAction(page, 'assigned', POINT_LABELS.assignedTraining, false);
  });
}

async function completeSelfTraining(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'complete-self-training', async () => {
    if (!shouldForceAction('selfTraining') && await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.selfTraining)) {
      return 'verified';
    }
    return runTrainingAction(page, 'self', POINT_LABELS.selfTraining, false);
  });
}

async function earnTrainingScoreAtLeast4(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'earn-training-score-at-least-4', async () => {
    if (!shouldForceAction('trainingScore4') && await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.trainingScore4)) {
      return 'verified';
    }
    return runTrainingAction(page, 'score', POINT_LABELS.trainingScore4, true);
  });
}

async function openReflectionHome(page: Page): Promise<void> {
  await page.goto(`${ENV.baseUrl}/csr-platform/reflection/home`);
  await waitForUiStable(page);
  await expect(page.getByText('회고 피드')).toBeVisible({ timeout: 30_000 });
}

async function openDailyReflectionEntry(page: Page): Promise<void> {
  const opened = await smartClick(page, [
    ...byTestIds('daily-reflection-nudge', 'daily-reflection', 'daily-reflection-entry'),
    (candidatePage) => candidatePage.getByRole('button', { name: /아직 오늘의 회고를 작성하지 않았어요/ }),
    (candidatePage) => candidatePage.getByRole('button', { name: /오늘의 회고 작성을 완료하셨어요!/ }),
    (candidatePage) => candidatePage.getByRole('button').filter({ hasText: /^일일 회고/ }).nth(0),
    (candidatePage) => candidatePage.getByText(/^일일 회고$/).locator('..').nth(0)
  ]);

  if (!opened) {
    throw new Error(`Daily reflection entry not found. Visible UI: ${JSON.stringify(await collectVisibleButtonsAndLinks(page))}`);
  }

  await waitForUiStable(page);
}

async function confirmReflectionStartIfNeeded(page: Page): Promise<void> {
  await smartClick(page, [
    ...byTestIds('confirm', 'confirm-date', 'open-daily-reflection'),
    (candidatePage) => candidatePage.getByRole('button', { name: /^확인$/ }),
    (candidatePage) => candidatePage.getByText(/^확인$/)
  ]).catch(() => undefined);
  await waitForUiStable(page);
}

async function writeDailyRetrospective(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'write-daily-retrospective', async () => {
    if (!shouldForceAction('dailyRetrospective') && await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.dailyRetrospective)) {
      return 'verified';
    }
    await openReflectionHome(page);
    await openDailyReflectionEntry(page);
    await confirmReflectionStartIfNeeded(page);
    const input = await selectMeaningfulInput(page);
    if (input) {
      await input.fill('오늘 학습과 훈련을 진행했고 자동화 테스트를 수행했다.');
    }
    await smartClick(page, [
      ...byTestIds('save', 'submit', 'complete-daily-reflection'),
      (candidatePage) => candidatePage.getByRole('button', { name: /저장|등록|완료|제출/ }),
      (candidatePage) => candidatePage.getByText(/저장|등록|완료|제출/)
    ]);
    return (await verifyPointItemCompleted(page, POINT_LABELS.dailyRetrospective)) ? 'performed' : 'attempted';
  });
}

async function completeWeeklyRetrospective(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'complete-weekly-retrospective', async () => {
    if (!shouldForceAction('weeklyRetrospective') && await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.weeklyRetrospective)) {
      return 'verified';
    }
    await openReflectionHome(page);
    await page.getByRole('button', { name: /주간 회고/ }).click();
    const input = await selectMeaningfulInput(page);
    if (input) {
      await input.fill('이번 주에는 과제, 훈련, 회고를 꾸준히 수행했다.');
    }
    await clickActionButton(page);
    return (await verifyPointItemCompleted(page, POINT_LABELS.weeklyRetrospective)) ? 'performed' : 'attempted';
  });
}

async function earnWeeklyRetrospectiveScoreAtLeast4(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'earn-weekly-retrospective-score-at-least-4', async () => {
    if (!shouldForceAction('weeklyRetrospectiveScore4') && await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.weeklyRetrospectiveScore4)) {
      return 'verified';
    }
    await openReflectionHome(page);
    await page.getByRole('button', { name: /주간 회고/ }).click();
    const starLike = page.locator('button').filter({ has: page.locator('svg') });
    if (await starLike.count().catch(() => 0) >= 5) {
      await starLike.nth(4).click();
    }
    await clickActionButton(page);
    return (await verifyPointItemCompleted(page, POINT_LABELS.weeklyRetrospectiveScore4)) ? 'performed' : 'attempted';
  });
}

async function completeOneAssignment(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'complete-one-assignment', async () => {
    if (!shouldForceAction('assignment') && await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.assignment)) {
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
    return (await verifyPointItemCompleted(page, POINT_LABELS.assignment)) ? 'performed' : 'attempted';
  });
}

async function createOneCsrQuestion(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'create-one-csr-question', async () => {
    if (!shouldForceAction('csrQuestion') && await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.csrQuestion)) {
      return 'verified';
    }
    await page.goto(`${ENV.baseUrl}/csr-platform/knowledge/csr-question`);
    await waitForUiStable(page);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const ready = await firstVisible(page, [
        ...textboxCandidates({
          testIds: ['question-input', 'chat-input'],
          placeholders: [/여러분의 질문을 기다리고 있어요!/]
        }),
        (candidatePage) => candidatePage.getByRole('button', { name: /CSR을 하면 어떤 효과가 있나요|회고와 일기의 차이는 무엇인가요/ }).first()
      ]);
      if (ready) {
        break;
      }
      await page.reload();
      await waitForUiStable(page);
    }
    await expect(page.getByRole('link', { name: 'CSR 질문' })).toBeVisible({ timeout: 30_000 });
    const questionInput = await firstVisible(page, textboxCandidates({
      testIds: ['question-input', 'chat-input'],
      placeholders: [/여러분의 질문을 기다리고 있어요!/]
    }));
    if (!questionInput) {
      throw new Error(`CSR question input not found. Available controls: ${await dumpLinksAndButtons(page)}`);
    }
    await questionInput.fill('CSR 활동을 꾸준히 하기 위한 방법은 무엇인가요?');
    await clickFirstVisible(page, [
      ...byTestIds('send-question', 'submit-question'),
      (candidatePage) => candidatePage.locator('button').filter({ has: candidatePage.locator('img') }).nth(1)
    ]);
    return (await verifyPointItemCompleted(page, POINT_LABELS.csrQuestion)) ? 'performed' : 'attempted';
  });
}

async function sendOneThanksCard(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'send-one-thanks-card', async () => {
    if (!shouldForceAction('thanksCard') && await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.thanksCard)) {
      return 'verified';
    }
    await openReflectionHome(page);
    await page.getByRole('button', { name: /감사 카드 보관함/ }).click();
    await waitForUiStable(page);
    await smartClick(page, [
      ...byTestIds('new-thanks-card', 'create-thanks-card'),
      (candidatePage) => candidatePage.getByRole('button', { name: /신규 작성/ }),
      (candidatePage) => candidatePage.getByText(/신규 작성/)
    ]);
    await waitForUiStable(page);
    const recipient = await firstVisible(page, [
      ...byTestIds('recipient', 'recipient-item', 'user-item'),
      (candidatePage) => candidatePage.getByRole('checkbox').first(),
      (candidatePage) => candidatePage.getByRole('radio').first(),
      (candidatePage) => candidatePage.getByRole('button').filter({ hasText: /학생|교사|허동운|방세준|이준호/ }).first(),
      ...bySelectors('[data-value]', '[role="option"]', 'li')
    ]);
    if (recipient) {
      await recipient.click().catch(() => undefined);
    }
    const input = await selectMeaningfulInput(page);
    if (input) {
      await input.fill('항상 도와줘서 고마워요!');
    }
    await smartClick(page, [
      ...byTestIds('send', 'send-thanks-card', 'submit-thanks-card'),
      (candidatePage) => candidatePage.getByRole('button', { name: /전송|저장|등록/ }),
      (candidatePage) => candidatePage.getByText(/전송|저장|등록/)
    ]);
    return (await verifyPointItemCompleted(page, POINT_LABELS.thanksCard)) ? 'performed' : 'attempted';
  });
}

async function writeOneRetrospectiveComment(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'write-one-retrospective-comment', async () => {
    if (!shouldForceAction('retrospectiveComment') && await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.retrospectiveComment)) {
      return 'verified';
    }
    await openReflectionHome(page);
    await page.getByRole('button').filter({ hasText: /코멘트|읽음|스티커 회고/ }).first().click();
    const input = await selectMeaningfulInput(page);
    if (input) {
      await input.fill('좋은 회고 잘 읽었습니다.');
    }
    await clickActionButton(page);
    return (await verifyPointItemCompleted(page, POINT_LABELS.retrospectiveComment)) ? 'performed' : 'attempted';
  });
}

async function shareOneRetrospective(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'share-one-retrospective', async () => {
    if (!shouldForceAction('retrospectiveShare') && await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.retrospectiveShare)) {
      return 'verified';
    }
    await openReflectionHome(page);
    await openDailyReflectionEntry(page);
    await confirmReflectionStartIfNeeded(page);
    await clickFirstVisible(page, [
      (candidatePage) => candidatePage.getByRole('button', { name: /공유/ }),
      (candidatePage) => candidatePage.getByText(/URL 복사|복사|공개/)
    ]);
    return (await verifyPointItemCompleted(page, POINT_LABELS.retrospectiveShare)) ? 'performed' : 'attempted';
  });
}

async function addOnePracticeGoal(page: Page, testInfo: TestInfo): Promise<StepOutcome> {
  return runActionStep(page, testInfo, 'add-one-practice-goal', async () => {
    if (!shouldForceAction('practiceGoal') && await maybeSkipIfAlreadyCompleted(page, POINT_LABELS.practiceGoal)) {
      return 'verified';
    }
    await openReflectionHome(page);
    await openDailyReflectionEntry(page);
    await confirmReflectionStartIfNeeded(page);
    const input = await selectMeaningfulInput(page);
    if (!input) {
      return 'attempted';
    }
    await input.fill('매일 30분 학습하기');
    const saved = await clickActionButton(page);
    if (!saved) {
      return 'attempted';
    }
    return (await verifyPointItemCompleted(page, POINT_LABELS.practiceGoal)) ? 'performed' : 'attempted';
  });
}
