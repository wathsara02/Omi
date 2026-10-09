import { expect, type Page, type TestInfo } from '@playwright/test';

/** The widths the design is checked at, each with a height typical of such a screen. */
export const VIEWPORTS = [
  { width: 320, height: 640 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
] as const;

/**
 * Photographs the page as it stands at every width, into the test report, and
 * fails if the page scrolls sideways at any of them. The page is left at the
 * size it had.
 */
export const captureScreen = async (
  page: Page,
  name: string,
  testInfo: TestInfo,
): Promise<void> => {
  const original = page.viewportSize();
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    // Names the elements that stick out past the right edge, so a failure says where to look.
    const tooWide = await page.evaluate(() => {
      const edge = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth <= edge) return [];
      return Array.from(document.querySelectorAll('body *'))
        .filter((element) => element.getBoundingClientRect().right > edge + 0.5)
        .map((element) => `${element.tagName.toLowerCase()}.${element.className}`);
    });
    expect(tooWide, `${name} scrolls sideways at ${viewport.width}px`).toEqual([]);
    await testInfo.attach(`${name}-${viewport.width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  }
  if (original !== null) await page.setViewportSize(original);
};
