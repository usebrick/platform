import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('unknown paths return a real 404 page', async ({ page }) => {
  const response = await page.goto('/this-route-does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'That brick is not here.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to usebrick.dev' })).toHaveAttribute('href', '/');
});

test('docs and changelog routes are real pages, not soft-200 placeholders', async ({ page }) => {
  for (const route of ['/docs', '/changelog']) {
    const response = await page.goto(route);
    expect(response?.status(), `${route} status`).toBe(200);
    await expect(page.locator('main#top')).toBeVisible();
  }
});

test('secondary routes have no critical or serious axe violations', async ({ page }) => {
  for (const route of ['/404', '/docs', '/changelog']) {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious'),
      `${route} critical/serious violations`,
    ).toEqual([]);
  }
});

test('robots and sitemap are available and point at the canonical domain', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain('https://usebrick.dev/sitemap.xml');

  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const sitemapBody = await sitemap.text();
  expect(sitemapBody).toContain('<loc>https://usebrick.dev/</loc>');
  expect(sitemapBody).toContain('<loc>https://usebrick.dev/docs</loc>');
  expect(sitemapBody).toContain('<loc>https://usebrick.dev/changelog</loc>');
});
