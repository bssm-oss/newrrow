import fs from 'node:fs';
import { expect, type Browser, type Page } from '@playwright/test';
import { ENV } from './env.js';

async function fillLoginForm(page: Page): Promise<void> {
  await page.getByRole('textbox', { name: /이메일 주소를 입력하세요\./ }).fill(ENV.email);
  await page.getByRole('textbox', { name: /비밀번호를 입력하세요\./ }).fill(ENV.password);
  await page.getByRole('button', { name: '로그인' }).click();
}

export async function createOrRefreshStorageState(browser: Browser): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${ENV.baseUrl}${ENV.dashboardPath}`);

  if (/auth\.inhrplus\.com/.test(page.url())) {
    await fillLoginForm(page);
  }

  await page.waitForURL(/bssm\.newrrow\.com\/csr-platform\/dashboard/, { timeout: 60_000 });
  await expect(page.getByText('대시보드')).toBeVisible({ timeout: 30_000 });
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
