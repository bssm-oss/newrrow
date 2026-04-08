import type { Locator, Page } from '@playwright/test';

export type LocatorFactory = (page: Page) => Locator;

export async function firstVisible(page: Page, factories: LocatorFactory[]): Promise<Locator | null> {
  for (const factory of factories) {
    const locator = factory(page).first();
    if (await locator.count().catch(() => 0)) {
      if (await locator.isVisible().catch(() => false)) {
        return locator;
      }
    }
  }
  return null;
}

export async function clickFirstVisible(page: Page, factories: LocatorFactory[]): Promise<boolean> {
  const locator = await firstVisible(page, factories);
  if (!locator) {
    return false;
  }
  await locator.click();
  return true;
}

export function buttonByTexts(...texts: RegExp[]): LocatorFactory[] {
  return texts.map((text) => (page) => page.getByRole('button', { name: text }));
}

export function linkByTexts(...texts: RegExp[]): LocatorFactory[] {
  return texts.map((text) => (page) => page.getByRole('link', { name: text }));
}
