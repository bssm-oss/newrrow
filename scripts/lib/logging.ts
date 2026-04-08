import fs from 'node:fs';
import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import { ENV } from './env.js';

function nowStamp(): string {
  return new Date().toISOString().replace(/[.:]/g, '-');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function logLine(message: string): void {
  console.log(`[newrrow-points] ${message}`);
}

export async function captureEvidence(page: Page, testInfo: TestInfo, stepName: string, status: 'success' | 'failure' | 'info', extra?: string): Promise<void> {
  const baseName = `${nowStamp()}-${slugify(stepName)}-${status}`;
  const screenshotPath = path.join(ENV.artifactDir, 'screenshots', `${baseName}.png`);
  const logPath = path.join(ENV.artifactDir, 'logs', `${baseName}.txt`);

  const canUsePage = !page.isClosed();
  if (canUsePage) {
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
  }

  const bodyText = canUsePage
    ? await page.locator('body').innerText().catch(() => '[body text unavailable]')
    : '[page already closed]';
  const logText = [
    `step=${stepName}`,
    `status=${status}`,
    `url=${canUsePage ? page.url() : '[page already closed]'}`,
    extra ?? '',
    '',
    bodyText
  ].join('\n');
  fs.writeFileSync(logPath, logText, 'utf8');

  if (canUsePage && fs.existsSync(screenshotPath)) {
    await testInfo.attach(`${baseName}-screenshot`, { path: screenshotPath, contentType: 'image/png' });
  }
  await testInfo.attach(`${baseName}-log`, { path: logPath, contentType: 'text/plain' });
}
