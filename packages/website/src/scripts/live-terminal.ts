/* ============================================================
   LiveTerminal — a real, typeable terminal the visitor drives.
   Pure DOM + setTimeout. No frameworks. No external deps.
   ============================================================ */

import version from '../data/version.json';
import productFacts from '../data/product-facts.json';

const RELEASE_LABEL = `v${version.slopbrick}`;

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

const STRUCTURE_MARKDOWN = [
  '# slopbrick memory',
  '',
  'Generated: 2026-07-17T12:00:00.000Z',
  'Workspace: /your-repo',
  'Scanned files: 593',
  'Scan duration: 1.8s',
  '',
  '## Detected patterns (canonical, use these)',
  '',
  '### UI library',
  '',
  '- **local-components** (14 files, 14 imports)',
  '',
  '### Styling',
  '',
  '- **css-variables** (12 files, 12 imports)',
  '',
  '## Canonical components',
  '',
  '- **Button** (defined in 3 files; props: variant, children)',
  '',
  '## Declared constitution',
  '',
  '- **UI library:** local-components',
  '- **Styling:** css-variables',
  '',
  '## DO NOT CREATE',
  '',
  '- @mui/ (any package under this scope)',
  '',
  '## Top issues (most impactful)',
  '',
  '_Run `slopbrick scan` to populate cross-file drift findings. Persisted memory captures the canonical patterns, not the drift analysis._',
  '',
].join('\n');

const COMMANDS: CommandSpec[] = [
  {
    match: 'help',
    run: () => [
      { kind: 'accent', text: `available commands (${RELEASE_LABEL} workspace build)` },
      { kind: 'output', text: '  help                              show this list' },
      { kind: 'output', text: '  npm install -g slopbrick          install the CLI' },
      { kind: 'output', text: '  slopbrick init                    write a slopbrick.config.mjs' },
      { kind: 'output', text: '  slopbrick scan                    score + write .slopbrick/ artifacts' },
      { kind: 'output', text: '  slopbrick --brief                 one-line brief with per-score descriptions' },
      { kind: 'output', text: `  slopbrick rules                   list ${productFacts.ruleCount} rules in ${productFacts.categoryCount} categories` },
      { kind: 'output', text: '  slopbrick explain <ruleId>        rationale + remediation for a rule' },
      { kind: 'output', text: '  slopbrick doctor                  check setup, config, environment' },
      { kind: 'output', text: '  slopbrick mcp                     start the MCP server (JSON-RPC 2.0 over stdio)' },
      { kind: 'output', text: '  cat .slopbrick/structure.md      show what scan produces' },
      { kind: 'output', text: '  clear                             clear the screen' },
      { kind: 'muted',  text: 'tip: Up/Down arrows recall past commands.' },
    ],
  },
  {
    match: 'npm install -g slopbrick',
    run: () => [
      { kind: 'muted',  text: `fetching slopbrick@${productFacts.published.version} from npm...` },
      { kind: 'success', text: 'added 1 package in 3s' },
      { kind: 'output', text: '/usr/local/bin/slopbrick' },
      { kind: 'muted',  text: 'next: `slopbrick init` to write slopbrick.config.mjs, then `slopbrick scan`.' },
    ],
  },
  {
    match: 'slopbrick scan',
    run: () => [
      { kind: 'muted',  text: 'demo output — illustrative local example; no remote scan is running' },
      { kind: 'muted',  text: `[${RELEASE_LABEL}] auto-suppressed 0 INVERTED/NOISY issue(s) from ${productFacts.defaultOffCount} default-off rule(s).` },
      { kind: 'muted',  text: 'Memory persisted to .slopbrick/ (2 patterns, 1 components, 812 bytes of structure.md, health.json: repo=91 aiQ=13 eng=92 sec=95).' },
      { kind: 'output', text: '' },
      { kind: 'output', text: 'Repo is low (13/100). The biggest problem is AI patterns — worst file is src/cli/scan.ts.' },
      { kind: 'output', text: '' },
      { kind: 'output', text: '  AI Slop Score         13   low  (aiSlopScore; lower = cleaner)' },
      { kind: 'output', text: '                         raw amount of AI slop, 0-100' },
      { kind: 'output', text: '  Engineering Hygiene  92   excellent  (engineeringHygiene)' },
      { kind: 'output', text: '                         cross-category consistency, 0-100' },
      { kind: 'output', text: '  Security             95   excellent  (security)' },
      { kind: 'output', text: '                         AI Security Risk band, 0-100' },
      { kind: 'output', text: '  Repository Health     91   passing  (repositoryHealth)' },
      { kind: 'output', text: '                         weighted composite, 0-100' },
      { kind: 'output', text: '' },
      { kind: 'success', text: '  CI gate: AI Slop Score <= 30 -> pass' },
      { kind: 'output', text: '' },
      { kind: 'output', text: '  Scanned 593 files, 62 findings (high: 3, medium: 12, low: 47)' },
      { kind: 'muted',  text: 'Tip: pass --all for the full report, --brief for CI/scripts.' },
    ],
  },
  {
    match: 'slopbrick init',
    run: () => [
      { kind: 'output', text: '       ▸ detecting repository defaults' },
      { kind: 'output', text: '       ▸ writing slopbrick.config.mjs' },
      { kind: 'output', text: '       ▸ refreshing the local rule-registry snapshot' },
      { kind: 'success', text: '✓ slopbrick configuration initialized' },
      { kind: 'muted',  text: 'next: `slopbrick scan` to create the .slopbrick/ scan artifacts.' },
    ],
  },
  {
    match: 'slopbrick rules',
    run: () => [
      { kind: 'accent', text: '27 categories · 119 rules (unreleased v0.45.0 candidate; v10.1 is historical evidence)' },
      { kind: 'output', text: '  ai           15   compression-profile, comment-ratio, segment-surprisal-cv, ...' },
      { kind: 'output', text: '  logic        12   ghost-defensive, zipf-slope-anomaly, dead-state, ...' },
      { kind: 'output', text: '  security     11   sql-construction, dangerous-cors, public-admin-route, ...' },
      { kind: 'output', text: '  visual       10   spacing-scale-violation, math-color-cluster, naturalness-anomaly, ...' },
      { kind: 'output', text: '  dead          5   dead-branch, unused-import, unused-local, ...' },
      { kind: 'output', text: '  swift         5   print-debug, fatal-error-thrown, ...' },
      { kind: 'output', text: '  ... and 21 more categories; run the real CLI for the complete generated list' },
      { kind: 'muted',  text: '36 default-off rules (INVERTED/NOISY; auto-suppressed). Per-rule evidence lives in src/rules/signal-strength.json.' },
    ],
  },
  {
    match: 'slopbrick explain ai/comment-ratio',
    run: () => [
      { kind: 'accent', text: 'Rule: ai/comment-ratio · Category: ai · Severity: medium · AI-specific: yes' },
      { kind: 'output', text: '' },
      { kind: 'output', text: '  Pattern:' },
      { kind: 'output', text: '    AI tools either skip comments (reductive) or over-comment' },
      { kind: 'output', text: '    (expansive). Match the corpus mean ± 2σ.' },
      { kind: 'output', text: '    Source: Rahman et al. 2024, Bisztray et al. 2025.' },
      { kind: 'output', text: '' },
      { kind: 'output', text: '  Remediation:' },
      { kind: 'output', text: '    See the rule source for the canonical before/after:' },
      { kind: 'output', text: '    src/rules/ai/comment-ratio.ts' },
      { kind: 'output', text: '' },
      { kind: 'muted', text: 'Suppress: rules: { "ai/comment-ratio": "off" } in slopbrick.config.mjs' },
    ],
  },
  {
    match: 'cat .slopbrick/structure.md',
    run: () => STRUCTURE_MARKDOWN.split('\n').map((text): Line => ({ kind: 'output', text })),
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
  
  // v0.43.0: hide the static fallback content (rendered into the HTML
  // so the terminal looks alive even when JS module fails to load —
  // see LiveTerminal.astro). Without this, the static content would
  // stay visible alongside the dynamic terminal output.
  const staticEl = root.querySelector<HTMLElement>('[data-live-terminal-static]');
  if (staticEl) staticEl.remove();
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
        // Per-char jitter keeps it from feeling mechanical while keeping the
        // complete command response inside a short, testable interaction
        // window. Completion is still driven by the promise, never by a
        // consumer-side animation-duration guess.
        const base = 1;
        const jitter = text.charCodeAt(i) % 2;
        window.setTimeout(tick, base + jitter);
      };
      window.setTimeout(tick, 4);
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
    body.dataset.commandComplete = 'seed';
    appendLine('muted', `${RELEASE_LABEL} candidate · 4 scores · ${productFacts.ruleCount} rules · ${productFacts.categoryCount} categories · ${productFacts.measuredRuleCount} measured in historical ${productFacts.corpusLabel} · local-first`);
    appendLine('muted', 'type `help` to list commands. outbound reporting is opt-in; local run history is enabled by default.');
    renderInputLine();
  };

  // ----- Command dispatch -----

  const execute = async (raw: string): Promise<void> => {
    const cmd = raw.trim();
    state.busy = true;
    delete body.dataset.commandComplete;
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
    body.dataset.commandComplete = cmd;
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
