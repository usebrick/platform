import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initLiveTerminal } from '../../src/scripts/live-terminal';
import { stubMatchMedia } from './_helpers';

const terminalMarkup = `
  <div data-live-terminal>
    <div data-live-terminal-static>fallback</div>
    <div data-live-terminal-body tabindex="0"></div>
  </div>
`;

const press = (body: HTMLElement, key: string): void => {
  body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
};

const type = (body: HTMLElement, value: string): void => {
  for (const character of value) press(body, character);
};

beforeEach(() => {
  document.body.innerHTML = terminalMarkup;
  stubMatchMedia(true);
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('initLiveTerminal completion state', () => {
  it('publishes command completion after reduced-motion output finishes', async () => {
    const cleanup = initLiveTerminal();
    const body = document.querySelector<HTMLElement>('[data-live-terminal-body]')!;
    body.focus();

    type(body, 'help');
    press(body, 'Enter');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(body.dataset.commandComplete).toBe('help');
    expect(body.textContent).toContain('available commands');
    cleanup();
  });

  it('returns to the seed completion state after clear', async () => {
    const cleanup = initLiveTerminal();
    const body = document.querySelector<HTMLElement>('[data-live-terminal-body]')!;
    body.focus();

    type(body, 'clear');
    press(body, 'Enter');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(body.dataset.commandComplete).toBe('seed');
    expect(body.textContent).toContain('type `help` to list commands');
    cleanup();
  });
});
