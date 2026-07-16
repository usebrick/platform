import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('homepage has no critical a11y violations', async ({ page }) => {
  await page.goto('/');
  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(accessibilityScanResults.violations.filter(v => v.impact === 'critical')).toEqual([]);
});

test('homepage has no serious a11y violations', async ({ page }) => {
  await page.goto('/');
  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(accessibilityScanResults.violations.filter(v => v.impact === 'serious')).toEqual([]);
});

test('skip-to-content link is present and focusable', async ({ page }) => {
  await page.goto('/');
  const link = page.getByRole('link', { name: 'Skip to content' });
  await expect(link).toBeAttached();
  await link.focus();
  await expect(link).toBeFocused();
});

test('tool cards are keyboard-focusable', async ({ page }) => {
  await page.goto('/');
  const firstCard = page.locator('.tool-card').first();
  await expect(firstCard).toHaveAttribute('role', 'button');
  await expect(firstCard).toHaveAttribute('tabindex', '0');
});

test.describe('mobile layout', () => {
  test('hero title remains fully visible at 320px', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
    const page = await context.newPage();
    try {
      await page.goto('/');
      const title = page.locator('.hero__title');
      const accent = page.locator('.hero__title-accent');
      const bounds = await Promise.all([
        title.boundingBox(),
        accent.boundingBox(),
        accent.evaluate((el) => getComputedStyle(el).whiteSpace),
      ]);
      expect(bounds[0]).not.toBeNull();
      expect(bounds[1]).not.toBeNull();
      expect(bounds[2]).toBe('normal');
      expect(bounds[1]!.x + bounds[1]!.width).toBeLessThanOrEqual(
        bounds[0]!.x + bounds[0]!.width + 1,
      );
    } finally {
      await context.close();
    }
  });

  for (const width of [320, 375, 390]) {
    test(`does not overflow horizontally at ${width}px`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width, height: 800 },
      });
      const page = await context.newPage();
      try {
        await page.goto('/');
        const dimensions = await page.evaluate(() => ({
          viewport: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
        }));
        expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewport);
        expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.viewport);
      } finally {
        await context.close();
      }
    });
  }
});
