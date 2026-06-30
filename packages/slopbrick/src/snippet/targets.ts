// Snippet target registry.
//
//   SnippetTarget        — type for one agent's metadata + generator.
//   SNIPPET_TARGETS      — the canonical list of supported targets.
//   resolveTargetPath    — turn a target into a project-relative path.
//   renderMatrix         — pretty-print the agent × file matrix.
//
// This module is the bridge between the per-target generators
// (./generators.ts) and the init command (cli/program.ts). The init
// action filters SNIPPET_TARGETS by CLI flag, then for each match
// calls resolveTargetPath(target) + target.generator(rules).

import { join } from 'node:path';
import type { Rule } from '../types';
import {
  generateAgentsMdSnippet,
  generateAiderSnippet,
  generateClaudeMdSnippet,
  generateClineRules,
  generateCopilotSnippet,
  generateCursorSnippet,
  generateCursorrulesLegacySnippet,
  generateGeminiSnippet,
  generateWindsurfSnippet,
} from './generators.js';

export interface SnippetTarget {
  flag: string;             // CLI flag name (camelCase)
  cliName: string;          // long option string
  path: string;             // relative file path under project root
  isFolder: boolean;        // true if path is a folder containing a file
  filename: string;         // actual filename inside the folder
  agent: string;            // human-readable agent name
  agentType: 'ide' | 'cli' | 'assistant' | 'framework';
  generator: (rules: Rule[]) => string;
}

export const SNIPPET_TARGETS: SnippetTarget[] = [
  {
    flag: 'cursor',
    cliName: '--cursor',
    path: '.cursor/rules',
    isFolder: true,
    filename: 'slopbrick.mdc',
    agent: 'Cursor (new format)',
    agentType: 'ide',
    generator: generateCursorSnippet,
  },
  {
    flag: 'cursorrules',
    cliName: '--cursorrules',
    path: '.cursorrules',
    isFolder: false,
    filename: '.cursorrules',
    agent: 'Cursor (legacy format, deprecated)',
    agentType: 'ide',
    generator: generateCursorrulesLegacySnippet,
  },
  {
    flag: 'agentsMd',
    cliName: '--agents-md',
    path: 'AGENTS.md',
    isFolder: false,
    filename: 'AGENTS.md',
    agent: 'OpenAI Codex / opencode / Pi / Cline / Continue / Gemini',
    agentType: 'cli',
    generator: generateAgentsMdSnippet,
  },
  {
    flag: 'claudeMd',
    cliName: '--claude-md',
    path: 'CLAUDE.md',
    isFolder: false,
    filename: 'CLAUDE.md',
    agent: 'Claude Code',
    agentType: 'assistant',
    generator: generateClaudeMdSnippet,
  },
  {
    flag: 'aider',
    cliName: '--aider',
    path: 'CONVENTIONS.md',
    isFolder: false,
    filename: 'CONVENTIONS.md',
    agent: 'Aider',
    agentType: 'assistant',
    generator: generateAiderSnippet,
  },
  {
    flag: 'windsurf',
    cliName: '--windsurf',
    path: '.windsurfrules',
    isFolder: false,
    filename: '.windsurfrules',
    agent: 'Windsurf (Cascade)',
    agentType: 'ide',
    generator: generateWindsurfSnippet,
  },
  {
    flag: 'cline',
    cliName: '--cline',
    path: '.clinerules',
    isFolder: true,
    filename: 'AGENTS.md',
    agent: 'Cline (folder-based)',
    agentType: 'ide',
    generator: generateClineRules,
  },
  {
    flag: 'gemini',
    cliName: '--gemini',
    path: '.gemini',
    isFolder: true,
    filename: 'GEMINI.md',
    agent: 'Gemini CLI',
    agentType: 'cli',
    generator: generateGeminiSnippet,
  },
  {
    flag: 'copilot',
    cliName: '--copilot',
    path: '.github',
    isFolder: true,
    filename: 'copilot-instructions.md',
    agent: 'GitHub Copilot',
    agentType: 'assistant',
    generator: generateCopilotSnippet,
  },
];

export function resolveTargetPath(target: SnippetTarget): string {
  return target.isFolder ? join(target.path, target.filename) : target.path;
}

export function renderMatrix(): string {
  const lines: string[] = [];
  lines.push('Agent snippet matrix:');
  lines.push('');
  lines.push('| Flag | File | Agent |');
  lines.push('|------|------|-------|');
  for (const t of SNIPPET_TARGETS) {
    lines.push('| `' + t.cliName + '` | `' + resolveTargetPath(t) + '` | ' + t.agent + ' |');
  }
  return lines.join('\n');
}

// Re-export path constants for backwards compatibility with round 18 callers.
export const CURSOR_SNIPPET_PATH = '.cursor/rules/slopbrick.mdc';
export const AGENTS_MD_SNIPPET_PATH = 'AGENTS.md';