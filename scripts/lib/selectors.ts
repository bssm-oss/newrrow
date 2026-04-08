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

export function byTestIds(...testIds: string[]): LocatorFactory[] {
  return testIds.map((testId) => (page) => page.getByTestId(testId));
}

export function bySelectors(...selectors: string[]): LocatorFactory[] {
  return selectors.map((selector) => (page) => page.locator(selector));
}

export function textboxCandidates(options: { testIds?: string[]; names?: RegExp[]; placeholders?: RegExp[] } = {}): LocatorFactory[] {
  return [
    ...(options.testIds ? byTestIds(...options.testIds) : []),
    ...((options.names ?? []).map((name) => (page: Page) => page.getByRole('textbox', { name }))),
    ...((options.placeholders ?? []).map((placeholder) => (page: Page) => page.getByPlaceholder(placeholder))),
    (page: Page) => page.locator('textarea'),
    (page: Page) => page.locator('input[type="text"]')
  ];
}

export function actionButtonCandidates(texts: RegExp[], testIds: string[] = []): LocatorFactory[] {
  return [
    ...byTestIds(...testIds),
    ...texts.map((text) => (page: Page) => page.getByRole('button', { name: text })),
    ...texts.map((text) => (page: Page) => page.getByText(text))
  ];
}

export function buttonByTexts(...texts: RegExp[]): LocatorFactory[] {
  return texts.map((text) => (page) => page.getByRole('button', { name: text }));
}

export function linkByTexts(...texts: RegExp[]): LocatorFactory[] {
  return texts.map((text) => (page) => page.getByRole('link', { name: text }));
}
