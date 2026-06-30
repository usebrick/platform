/* ============================================================
   LiveTerminal — a real, typeable terminal the visitor drives.
   Pure DOM + setTimeout. No frameworks. No external deps.
   ============================================================ */

type LineKind = 'echo' | 'output' | 'success' | 'accent' | 'muted' | 'err';

interface Line {
  kind: LineKind;
  text: string;
}

interface CommandSpec {
  /** exact string the user must type */
  match: string;
  /** returns lines, or null to signal "clear the screen" */
  run: () => Line[] | null;
}

const STRUCTURE_JSON = [
  '{',
  '  "version": "3",',
  '  "generatedAt": "2026-06-29T04:42:14.730Z",',
  '  "workspace": "/your-repo",',
  '  "aiQuality": 87,',
  '  "engineeringHygiene": 92,',
  '  "security": 95,',
  '  "repositoryHealth": 91,',
  '  "issueCounts": {',
  '    "high": 3,',
  '    "medium": 12,',
  '    "low": 47',
  '  }',
  '}',
].join('\n');

const COMMANDS: CommandSpec[] = [
  {
    match: 'help',
    run: () => [
      { kind: 'accent', text: 'available commands' },
      { kind: 'output', text: '  help                              show this list' },
      { kind: 'output', text: '  npm install -g slopbrick          install the CLI' },
      { kind: 'output', text: '  slopbrick scan                    run the calibration ritual' },
      { kind: 'output', text: '  slopbrick init                    create a .usebrick/ directory' },
      { kind: 'output', text: '  slopbrick rules                   list rule categories' },
      { kind: 'output', text: '  cat .usebrick/structure.json      show the structure file' },
      { kind: 'output', text: '  clear                             clear the screen' },
      { kind: 'muted',  text: 'tip: Up/Down arrows recall past commands.' },
    ],
  },
  {
    match: 'npm install -g slopbrick',
    run: () => [
      { kind: 'muted',  text: 'fetching slopbrick@latest ...' },
      { kind: 'success', text: 'added 1 package in 3s' },
      { kind: 'output', text: '/usr/local/bin/slopbrick' },
      { kind: 'muted',  text: 'try `slopbrick scan` to run the calibration ritual.' },
    ],
  },
  {
    match: 'slopbrick scan',
    run: () => [
      { kind: 'output', text: '       ▸ resolving workspace @ /your-repo' },
      { kind: 'output', text: '       ▸ loading 4 scores, 95 rules' },
      { kind: 'muted',  text: '       ▸ aiQuality .......... 87   good' },
      { kind: 'muted',  text: '       ▸ engineeringHygiene . 92   strong' },
      { kind: 'muted',  text: '       ▸ security ........... 95   solid' },
      { kind: 'muted',  text: '       ▸ repositoryHealth ... 91   ready to ship' },
      { kind: 'success', text: '✓ done in 1.42s — wrote .usebrick/structure.json' },
    ],
  },
  {
    match: 'slopbrick init',
    run: () => [
      { kind: 'output', text: '       ▸ creating .usebrick/ ...' },
      { kind: 'output', text: '       ▸ writing .usebrick/structure.json' },
      { kind: 'output', text: '       ▸ writing .usebrick/inventory.json' },
      { kind: 'output', text: '       ▸ writing .usebrick/constitution.json' },
      { kind: 'output', text: '       ▸ writing .usebrick/health.json' },
      { kind: 'success', text: '✓ usebrick initialized in 0.18s' },
      { kind: 'muted',  text: 'next: `slopbrick scan` to populate structure.json.' },
    ],
  },
  {
    match: 'slopbrick rules',
    run: () => [
      { kind: 'accent', text: '13 categories · 80+ rules' },
      { kind: 'output', text: '  security     18   sql-injection, xss, ssrf, secret-leak, ...' },
      { kind: 'output', text: '  logic        14   null-check, await-promise, type-coerce, ...' },
      { kind: 'output', text: '  layout       12   dead-code, magic-number, naming-conv, ...' },
      { kind: 'output', text: '  typo          9   identifier-shadow, comment-grammar, ...' },
      { kind: 'output', text: '  ai            6   ai-slop, prompt-leak, comment-artifact, ...' },
      { kind: 'output', text: '  arch          5   layer-violation, circular-import, ...' },
      { kind: 'output', text: '  ... and 7 more (component, product, visual, perf, test, context, wcag)' },
      { kind: 'muted',  text: 'each rule ships with recall/FP ratio · noise > signal goes back to defaultOff.' },
    ],
  },
  {
    match: 'cat .usebrick/structure.json',
    run: () => STRUCTURE_JSON.split('\n').map((text): Line => ({ kind: 'output', text })),
  },
  {
    match: 'clear',
    run: () => null,
  },
];

const COMMAND_INDEX = new Map(COMMANDS.map((c) => [c.match, c]));

export function initLiveTerminal(): () => void {
  const root = document.querySelector<HTMLElement>('[data-live-terminal]');
  if (!root) return () => {};
  const body = root.querySelector<HTMLElement>('[data-live-terminal-body]');
  if (!body) return () => {};

  // Only focus on clicks that *originated* on the terminal — `event.target`
  // is set on the bubble path too, so we also check the click was directly
  // on `body` (or a descendant of the terminal root). This prevents a click
  // on the hero install button from scrolling the page down to the terminal.
  const onTerminalClick = (e: MouseEvent): void => {
    if (!root.contains(e.target as Node)) return;
    body.focus();
  };

  const reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state = {
    buffer: '',
    history: [] as string[],
    historyCursor: -1, // -1 = "now" (typing fresh); otherwise index into `history`
    savedDraft: '',     // what the user was typing before walking back through history
    busy: false,        // true while output is being typed out
  };

  // ----- DOM helpers -----

  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
  ): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  };

  const scrollToBottom = (): void => {
    body.scrollTop = body.scrollHeight;
  };

  const appendLine = (kind: LineKind, text: string): HTMLElement => {
    const node = el('span', `lt-line lt-line--${kind}`);
    if (kind === 'echo') {
      const prompt = el('span', 'lt-prompt');
      prompt.textContent = '$ ';
      node.appendChild(prompt);
      node.appendChild(document.createTextNode(text));
    } else {
      node.textContent = text || '\u00a0'; // &nbsp; keeps blank lines visible
    }
    body.appendChild(node);
    scrollToBottom();
    return node;
  };

  /** Render or update the single live input line. */
  const renderInputLine = (): HTMLElement => {
    let inputLine = body.querySelector<HTMLElement>('.lt-input');
    if (!inputLine) {
      inputLine = el('span', 'lt-input');
      const prompt = el('span', 'lt-input__prompt');
      prompt.textContent = '$ ';
      const value = el('span', 'lt-input__value');
      const cursor = el('span', 'lt-cursor');
      cursor.setAttribute('aria-hidden', 'true');
      inputLine.append(prompt, value, cursor);
      body.appendChild(inputLine);
    }
    inputLine.querySelector<HTMLElement>('.lt-input__value')!.textContent = state.buffer;
    scrollToBottom();
    return inputLine;
  };

  // ----- Typewriter -----

  const typewrite = (node: HTMLElement, text: string): Promise<void> => {
    if (reduced || text.length === 0) {
      node.textContent = text;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let i = 0;
      const tick = () => {
        i += 1;
        node.textContent = text.slice(0, i);
        scrollToBottom();
        if (i >= text.length) {
          resolve();
          return;
        }
        // Per-char jitter keeps it from feeling mechanical.
        const base = 16;
        const jitter = (text.charCodeAt(i) % 7) * 2;
        window.setTimeout(tick, base + jitter);
      };
      window.setTimeout(tick, 16);
    });
  };

  const typeLine = async (kind: LineKind, text: string): Promise<void> => {
    const node = el('span', `lt-line lt-line--${kind}`);
    body.appendChild(node);
    scrollToBottom();
    await typewrite(node, text);
  };

  // ----- Boot banner -----

  const seedBanner = (): void => {
    appendLine('muted', 'slopbrick 0.17.4 · 4 scores · 95 rules · 15 categories · no telemetry');
    appendLine('muted', "type `help` to list commands. the CLI itself runs offline.");
    renderInputLine();
  };

  // ----- Command dispatch -----

  const execute = async (raw: string): Promise<void> => {
    const cmd = raw.trim();
    state.busy = true;
    appendLine('echo', cmd);

    if (cmd.length === 0) {
      state.busy = false;
      return;
    }

    const spec = COMMAND_INDEX.get(cmd);
    if (!spec) {
      appendLine('err', `command not found: ${cmd}`);
      appendLine('muted', "type `help` for the list of available commands.");
      state.busy = false;
      return;
    }

    const output = spec.run();
    if (output === null) {
      state.busy = false;
      body.replaceChildren();
      seedBanner();
      return;
    }

    for (const line of output) {
      await typeLine(line.kind, line.text);
    }
    state.busy = false;
  };

  // ----- Input -----

  const onKeyDown = (e: KeyboardEvent): void => {
    if (document.activeElement !== body) return;
    if (state.busy) {
      e.preventDefault();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = state.buffer;
      if (cmd.length > 0) {
        const last = state.history[state.history.length - 1];
        if (cmd !== last) state.history.push(cmd);
        state.historyCursor = -1;
        state.savedDraft = '';
      }
      state.buffer = '';
      renderInputLine();
      void execute(cmd);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (state.history.length === 0) return;
      if (state.historyCursor === -1) {
        state.savedDraft = state.buffer;
        state.historyCursor = state.history.length - 1;
      } else if (state.historyCursor > 0) {
        state.historyCursor -= 1;
      }
      state.buffer = state.history[state.historyCursor] ?? '';
      renderInputLine();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (state.historyCursor === -1) return;
      if (state.historyCursor >= state.history.length - 1) {
        state.historyCursor = -1;
        state.buffer = state.savedDraft;
      } else {
        state.historyCursor += 1;
        state.buffer = state.history[state.historyCursor] ?? '';
      }
      renderInputLine();
      return;
    }

    if (e.key === 'Backspace') {
      e.preventDefault();
      if (state.buffer.length > 0) {
        state.buffer = state.buffer.slice(0, -1);
        renderInputLine();
      }
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      return;
    }

    // Skip modifier / nav keys so they don't pollute the buffer.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length !== 1) return;

    e.preventDefault();
    state.buffer += e.key;
    renderInputLine();
  };

  body.addEventListener('keydown', onKeyDown);
  // Click-to-focus, but only for clicks that *originated* on the terminal
  // — not bubbled clicks from the hero / nav above. A bubbling click
  // listener on `body` would steal focus + auto-scroll the page to the
  // terminal on every click anywhere on the page, including the first
  // click on the install button in the hero.
  body.addEventListener('click', onTerminalClick);

  seedBanner();

  // Intentionally do NOT auto-focus on init. The terminal is in the
  // middle of the page; focusing it on load would scroll the page down
  // past the hero. The user opts in to focus by clicking inside the
  // terminal (handled by onTerminalClick above).

  return () => {
    body.removeEventListener('keydown', onKeyDown);
    body.removeEventListener('click', onTerminalClick);
  };
}