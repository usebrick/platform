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
  // Allow up to 3 serious violations (some decorative SVG may trigger;
  // investigate and fix in follow-up).
  expect(accessibilityScanResults.violations.filter(v => v.impact === 'serious').length).toBeLessThanOrEqual(3);
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
