import fs from 'node:fs';
import { expect, type Browser, type Page } from '@playwright/test';
import { ENV, getCredentials } from './env.js';

async function fillLoginForm(page: Page): Promise<void> {
  const { email, password } = getCredentials();
  await page.getByRole('textbox', { name: /이메일 주소를 입력하세요\./ }).fill(email);
  await page.getByRole('textbox', { name: /비밀번호를 입력하세요\./ }).fill(password);
  await page.getByRole('button', { name: '로그인' }).click();
}

async function waitForDashboard(page: Page, timeout: number): Promise<boolean> {
  try {
    await page.waitForURL(/bssm\.newrrow\.com\/csr-platform\/dashboard/, { timeout });
    await expect(page.getByRole('link', { name: '대시보드' })).toBeVisible({ timeout: Math.min(timeout, 30_000) });
    return true;
  } catch {
    return false;
  }
}

export async function createOrRefreshStorageState(browser: Browser): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${ENV.baseUrl}${ENV.dashboardPath}`);

  if (/auth\.inhrplus\.com/.test(page.url())) {
    await fillLoginForm(page);
  }

  const autoLoginWorked = await waitForDashboard(page, 20_000);
  if (!autoLoginWorked) {
    console.log('[newrrow-points] Automatic login did not finish. Waiting for manual login in the headed browser...');
    const manualLoginWorked = await waitForDashboard(page, 120_000);
    if (!manualLoginWorked) {
      throw new Error('Unable to establish an authenticated Newrrow dashboard session. Complete login manually in the opened browser or provide a valid storageState file.');
    }
  }

  await context.storageState({ path: ENV.storageStatePath });
  await context.close();
}

export async function ensureStorageState(browser: Browser): Promise<void> {
  if (!fs.existsSync(ENV.storageStatePath)) {
    await createOrRefreshStorageState(browser);
    return;
  }

  const context = await browser.newContext({ storageState: ENV.storageStatePath });
  const page = await context.newPage();
  await page.goto(`${ENV.baseUrl}${ENV.dashboardPath}`);
  const stillAuthenticated = /bssm\.newrrow\.com/.test(page.url()) && !/auth\.inhrplus\.com/.test(page.url());
  await context.close();

  if (!stillAuthenticated) {
    await createOrRefreshStorageState(browser);
  }
}
