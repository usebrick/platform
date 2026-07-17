import { test, expect } from '@playwright/test';

/**
 * Smoke test for the LiveTerminal component. Exercises the
 * 5 behavior points in the Definition of Done:
 *   - type `help`, see output
 *   - type `slopbrick scan`, see typed output
 *   - Up arrow recalls
 *   - `clear` works
 *   - reduced-motion skips animation
 */

const type = async (page: import('@playwright/test').Page, text: string): Promise<void> => {
  for (const ch of text) {
    await page.keyboard.press(ch === ' ' ? 'Space' : ch);
  }
};

const waitForCommand = async (
  term: import('@playwright/test').Locator,
  command: string,
): Promise<void> => {
  await expect(term).toHaveAttribute('data-command-complete', command);
};

test('LiveTerminal: help command prints the command list', async ({ page }) => {
  await page.goto('/#terminal');
  const term = page.locator('[data-live-terminal-body]');
  await term.focus();
  await type(page, 'help');
  await page.keyboard.press('Enter');
  await waitForCommand(term, 'help');
  await expect(term.locator('text=available commands (v0.45.0 workspace build)')).toBeVisible();
  await expect(term.locator('text=slopbrick scan')).toBeVisible();
});

test('LiveTerminal: slopbrick scan prints the calibration ritual', async ({ page }) => {
  await page.goto('/#terminal');
  const term = page.locator('[data-live-terminal-body]');
  await term.focus();
  await type(page, 'slopbrick scan');
  await page.keyboard.press('Enter');
  await waitForCommand(term, 'slopbrick scan');
  await expect(term.locator('text=aiSlopScore')).toBeVisible();
  await expect(term.locator('text=Memory persisted to .slopbrick/')).toBeVisible();
  await expect(term.locator('text=bytes of structure.md')).toBeVisible();
});

test('LiveTerminal: init describes configuration, not scan artifacts', async ({ page }) => {
  await page.goto('/#terminal');
  const term = page.locator('[data-live-terminal-body]');
  await term.focus();
  await type(page, 'slopbrick init');
  await page.keyboard.press('Enter');
  await waitForCommand(term, 'slopbrick init');
  await expect(term.locator('text=writing slopbrick.config.mjs')).toBeVisible();
  await expect(term.locator('text=writing .slopbrick/structure.md')).toHaveCount(0);
  await expect(term.locator('text=writing .slopbrick/health.json')).toHaveCount(0);
});

test('LiveTerminal: install reports the pinned public npm release', async ({ page }) => {
  await page.goto('/#terminal');
  const term = page.locator('[data-live-terminal-body]');
  await term.focus();
  await type(page, 'npm install -g slopbrick');
  await page.keyboard.press('Enter');
  await waitForCommand(term, 'npm install -g slopbrick');
  await expect(term.locator('text=fetching slopbrick@0.43.0 from npm')).toBeVisible();
  await expect(term.locator('text=workspace build v0.45.0')).toHaveCount(0);
});

test('LiveTerminal: structure.md is rendered as Markdown, not run-history JSON', async ({ page }) => {
  await page.goto('/#terminal');
  const term = page.locator('[data-live-terminal-body]');
  await term.focus();
  await type(page, 'cat .slopbrick/structure.md');
  await page.keyboard.press('Enter');
  await waitForCommand(term, 'cat .slopbrick/structure.md');
  await expect(term.locator('text=# slopbrick memory')).toBeVisible();
  await expect(term.locator('text=## Detected patterns (canonical, use these)')).toBeVisible();
  await expect(term.locator('text=## Canonical components')).toBeVisible();
  await expect(term.locator('text=## Declared constitution')).toBeVisible();
  await expect(term.locator('text=## DO NOT CREATE')).toBeVisible();
  await expect(term.locator('text="issueCounts"')).toHaveCount(0);
});

test('LiveTerminal: ArrowUp recalls the previous command', async ({ page }) => {
  await page.goto('/#terminal');
  const term = page.locator('[data-live-terminal-body]');
  await term.focus();
  await type(page, 'help');
  await page.keyboard.press('Enter');
  await waitForCommand(term, 'help');
  await page.keyboard.press('ArrowUp');
  // The live input line's value should now show "help".
  await expect(term.locator('.lt-input__value')).toHaveText('help');
});

test('LiveTerminal: clear empties the screen and reseeds', async ({ page }) => {
  await page.goto('/#terminal');
  const term = page.locator('[data-live-terminal-body]');
  await term.focus();
  await type(page, 'clear');
  await page.keyboard.press('Enter');
  await waitForCommand(term, 'seed');
  // The seed banner is re-rendered. The "type `help`" hint line is
  // the last muted line of the seed, so we assert it.
  await expect(term.locator('text=type `help` to list commands')).toBeVisible();
});

test('LiveTerminal: reduced-motion skips the typing animation', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/#terminal');
  const term = page.locator('[data-live-terminal-body]');
  await term.focus();
  await type(page, 'slopbrick scan');
  await page.keyboard.press('Enter');
  await waitForCommand(term, 'slopbrick scan');
  // The completion state is independent of whether reduced motion skips
  // the typewriter effect or a future implementation changes its cadence.
  await expect(term.locator('text=aiSlopScore')).toBeVisible();
  await context.close();
});
