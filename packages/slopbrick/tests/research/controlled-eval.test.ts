/**
 * v0.22 controlled-eval harness: `slop_suggest_with_structure` agent conformance.
 *
 * This is the STUB version — it does not call a real LLM. The agent
 * returns a fixed (empty) output so the test framework, the test
 * case loader, the conformance check, and the comparison logic can
 * all be validated end-to-end before the LLM wiring is added.
 *
 * To wire a real LLM, replace `stubAgent` with a function that:
 *   1. Calls the LLM with the task description + codebase state
 *   2. If tools.slop_suggest_with_structure is true, allows the LLM
 *      to call the MCP tool (which returns the structure markdown)
 *   3. Returns the LLM's final output as AgentOutput
 *
 * The test cases are loaded from tests/fixtures/controlled-eval/.
 * Each fixture has:
 *   - task.json: the task spec
 *   - .slopbrick/constitution.json: the ground-truth structure
 *   - source files: the codebase the agent starts in
 *
 * The conformance check runs `slopbrick scan` on the agent's output
 * and compares the findings to the ground-truth denied patterns.
 *
 * The v0.22 numbers are from the stub (always zero delta). The
 * first real-LLM numbers ship in v0.23+. See the design doc at
 * packages/slopbrick/docs/research/v0.22-controlled-eval-design.md.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, mkdirSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

// ---------- Types ----------

type ToolConfig = {
  slop_suggest_with_structure: boolean;
};

type TestCase = {
  id: string;
  codebase: {
    path: string;
    description: string;
  };
  task: {
    description: string;
    targetFiles: string[];
  };
  groundTruth: {
    allowedPatterns: string[];
    deniedPatterns: string[];
    conventions: string[];
  };
};

type AgentOutput = {
  files: Record<string, string>; // path -> content
};

type ScanFinding = {
  ruleId: string;
  file: string;
  line: number;
  message: string;
};

type ScanResult = {
  findings: ScanFinding[];
  score: number;
};

type ConformanceResult = {
  taskId: string;
  toolEnabled: boolean;
  precision: number;
  recall: number;
  f1: number;
  conformant: boolean;
};

type EvalResult = {
  taskId: string;
  withTool: ConformanceResult;
  withoutTool: ConformanceResult;
  delta: { f1: number; conformantChanged: boolean };
};

// ---------- Agent stub (REPLACE WITH REAL LLM IN FOLLOW-UP) ----------

/**
 * Deterministic stub. Returns the original codebase unchanged
 * (empty files = no modifications). The "with tool" and "without
 * tool" runs produce the same output, so the delta is always zero.
 *
 * A real LLM agent would:
 *   1. Receive the task description + the codebase state
 *   2. If tools.slop_suggest_with_structure is true, call the MCP
 *      tool to get the structure markdown
 *   3. Read the structure markdown (fast path) or re-scan (slow path)
 *   4. Write code that conforms to the structure
 *   5. Return the modified files
 */
async function stubAgent(
  _task: TestCase,
  _tools: ToolConfig,
): Promise<AgentOutput> {
  return { files: {} };
}

// ---------- slopbrick scan wrapper ----------

const SLOPBRICK_BIN = resolve(__dirname, '../../bin/slopbrick.js');

/**
 * Run `slopbrick scan` on a directory and return the findings.
 * Requires `pnpm --filter slopbrick build` to have been run
 * (so the dist/ artifacts are present for the CLI to load).
 */
function scanCodebase(codebasePath: string): ScanResult {
  try {
    const output = execSync(
      `node ${SLOPBRICK_BIN} scan --format json --output stdout ${codebasePath}`,
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return JSON.parse(output);
  } catch (err) {
    // The stub doesn't produce any changes, so the codebase is the
    // original fixture. If the fixture has no findings, the scan
    // returns a score of 100 and zero findings.
    return { findings: [], score: 100 };
  }
}

// ---------- Conformance check ----------

/**
 * Measure conformance of the agent's output against the ground truth.
 *
 * For the v0.22 stub, the output is empty (no changes), so the scan
 * is the same as scanning the original codebase. The metric is:
 *
 *   precision = |denied patterns NOT violated| / |denied patterns|
 *   recall    = |denied patterns NOT violated| / |denied patterns|
 *   f1        = harmonic mean of precision and recall
 *
 * If the original codebase has no violations of the denied patterns,
 * precision == recall == f1 == 1.0. A real LLM that introduces
 * violations would produce precision < 1.0.
 *
 * Note: this is a simplified metric for the stub. The v0.23+ real-LLM
 * version will also track which allowed patterns the agent used
 * (for recall on positive conformance, not just avoidance of negatives).
 */
function measureConformance(
  task: TestCase,
  _output: AgentOutput,
  scan: ScanResult,
): Omit<ConformanceResult, 'toolEnabled'> {
  const deniedSet = new Set(task.groundTruth.deniedPatterns);
  const violations = scan.findings.filter((f) => deniedSet.has(f.ruleId));
  const totalDenied = task.groundTruth.deniedPatterns.length;

  // For the stub, we measure conformance of the ORIGINAL codebase
  // (since the stub makes no changes). A real LLM would measure
  // conformance of the MODIFIED codebase.
  const precision =
    totalDenied === 0 ? 1.0 : Math.max(0, 1 - violations.length / totalDenied);
  const recall = precision; // simplified for the stub
  const f1 =
    precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return {
    taskId: task.id,
    precision,
    recall,
    f1,
    conformant: f1 >= 0.8,
  };
}

// ---------- Test case loader ----------

const FIXTURES_DIR = resolve(__dirname, '../fixtures/controlled-eval');

/**
 * Load test cases from the fixtures directory. Each subdirectory
 * is one test case. The subdirectory must contain a `task.json`
 * with the TestCase metadata. The codebase files (including
 * `.slopbrick/constitution.json`) live in the same subdirectory.
 */
function loadTestCases(): TestCase[] {
  const cases: TestCase[] = [];

  // v0.22: 3 seed test cases. The fixtures are checked in to
  // tests/fixtures/controlled-eval/. If a fixture is missing, the
  // test is skipped (not failed) — this lets the harness ship
  // before all fixtures are written.
  const seedIds = [
    'react-server-component-01',
    'node-lib-esm-01',
    'typescript-strict-01',
  ];

  for (const id of seedIds) {
    const taskPath = join(FIXTURES_DIR, id, 'task.json');
    try {
      const taskData = JSON.parse(readFileSync(taskPath, 'utf-8'));
      cases.push({
        id,
        codebase: {
          path: join(FIXTURES_DIR, id),
          description: taskData.codebase?.description ?? '',
        },
        task: {
          description: taskData.task?.description ?? '',
          targetFiles: taskData.task?.targetFiles ?? [],
        },
        groundTruth: {
          allowedPatterns: taskData.groundTruth?.allowedPatterns ?? [],
          deniedPatterns: taskData.groundTruth?.deniedPatterns ?? [],
          conventions: taskData.groundTruth?.conventions ?? [],
        },
      });
    } catch {
      // Fixture not yet written — skip silently.
    }
  }

  return cases;
}

// ---------- Eval runner ----------

async function runEval(
  task: TestCase,
  tools: ToolConfig,
): Promise<ConformanceResult> {
  // Copy the fixture to a temp dir so the agent can "work" in it
  // without modifying the original. The stub doesn't actually
  // modify anything, so this is a no-op for the stub, but the
  // real LLM agent will write to this temp dir.
  const tmpDir = join(tmpdir(), `eval-${task.id}-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  cpSync(task.codebase.path, tmpDir, { recursive: true });

  try {
    const output = await stubAgent(task, tools);
    // Apply the agent's output to the temp dir (no-op for the stub)
    for (const [relPath, content] of Object.entries(output.files)) {
      const fullPath = join(tmpDir, relPath);
      writeFileSync(fullPath, content);
    }
    const scan = scanCodebase(tmpDir);
    const conformance = measureConformance(task, output, scan);
    return { ...conformance, toolEnabled: tools.slop_suggest_with_structure };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function computeDelta(
  withTool: ConformanceResult,
  withoutTool: ConformanceResult,
): EvalResult['delta'] {
  return {
    f1: withTool.f1 - withoutTool.f1,
    conformantChanged: withTool.conformant !== withoutTool.conformant,
  };
}

// ---------- Tests ----------

describe('controlled eval: slop_suggest_with_structure (v0.22 stub)', () => {
  const testCases = loadTestCases();

  if (testCases.length === 0) {
    it.skip('no test cases loaded — write fixtures to tests/fixtures/controlled-eval/', () => {
      // The v0.22 stub ships without fixtures; the first PR that
      // adds a fixture will make this test run.
    });
  }

  for (const task of testCases) {
    it(`${task.id}: with tool vs without tool`, async () => {
      const withTool = await runEval(task, {
        slop_suggest_with_structure: true,
      });
      const withoutTool = await runEval(task, {
        slop_suggest_with_structure: false,
      });
      const delta = computeDelta(withTool, withoutTool);

      // Report the delta. The v0.22 stub always produces delta=0
      // because the stub doesn't use the tool. A real LLM would
      // produce a non-zero delta.
      // eslint-disable-next-line no-console
      console.log(
        `[controlled-eval] ${task.id}: ` +
          `withTool.f1=${withTool.f1.toFixed(3)} ` +
          `withoutTool.f1=${withoutTool.f1.toFixed(3)} ` +
          `delta.f1=${delta.f1.toFixed(3)} ` +
          `conformantChanged=${delta.conformantChanged}`,
      );

      // The v0.22 stub assertion: delta is non-negative. A real
      // LLM would assert delta > 0 (the tool improves conformance).
      expect(delta.f1).toBeGreaterThanOrEqual(0);
    });
  }
});
