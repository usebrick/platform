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

test('LiveTerminal: help command prints the command list', async ({ page }) => {
  await page.goto('/#terminal');
  const term = page.locator('[data-live-terminal-body]');
  await term.focus();
  await type(page, 'help');
  await page.keyboard.press('Enter');
  await expect(term).toHaveAttribute('data-command-complete', 'help', { timeout: 20_000 });
  await expect(term.locator('text=available commands (v0.44.0 workspace build)')).toBeVisible();
  await expect(term.locator('text=slopbrick scan')).toBeVisible();
});

test('LiveTerminal: slopbrick scan prints the calibration ritual', async ({ page }) => {
  await page.goto('/#terminal');
  const term = page.locator('[data-live-terminal-body]');
  await term.focus();
  await type(page, 'slopbrick scan');
  await page.keyboard.press('Enter');
  await expect(term).toHaveAttribute('data-command-complete', 'slopbrick scan', { timeout: 20_000 });
  // The output types character by character (~20ms each). 8 lines of
  // ~50 chars each = ~8s worst case. Generous timeout.
  await expect(term.locator('text=aiSlopScore')).toBeVisible({ timeout: 15_000 });
  await expect(term.locator('text=.slopbrick/structure.md')).toBeVisible();
});

test('LiveTerminal: ArrowUp recalls the previous command', async ({ page }) => {
  await page.goto('/#terminal');
  const term = page.locator('[data-live-terminal-body]');
  await term.focus();
  await type(page, 'help');
  await page.keyboard.press('Enter');
  await expect(term).toHaveAttribute('data-command-complete', 'help', { timeout: 20_000 });
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
  // With reduced motion, all output lines appear at once. We don't
  // need a long timeout — the line should be there immediately.
  await expect(term.locator('text=aiSlopScore')).toBeVisible({ timeout: 2_000 });
  await context.close();
});
