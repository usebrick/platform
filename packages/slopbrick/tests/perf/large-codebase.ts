import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { scanProject } from '../../src/index';
import { generatePerfFixtures } from '../../scripts/generate-perf-fixtures';

const BUDGET_MS = 8000;
const COMPONENT_COUNT = 2000;
const WORKER_SCRIPT = resolve(process.cwd(), 'dist', 'engine', 'worker.cjs');

function assertDistBuilt(): void {
  if (!existsSync(WORKER_SCRIPT)) {
    throw new Error(`dist/ is not built. Run "pnpm build" before running the perf benchmark. (missing ${WORKER_SCRIPT})`);
  }
}

async function main(): Promise<void> {
  assertDistBuilt();

  const fixtureDir = mkdtempSync(join(tmpdir(), 'slopbrick-perf-'));
  const srcDir = join(fixtureDir, 'src');
  try {
    const { componentCount, filesCreated } = generatePerfFixtures(srcDir, COMPONENT_COUNT);
    console.log(`Scanning ${componentCount} components in ${filesCreated} files...`);

    const start = performance.now();
    const report = await scanProject({ cwd: fixtureDir, workerScript: WORKER_SCRIPT });
    const elapsed = performance.now() - start;

    console.log(`Scanned ${report.componentCount} components in ${elapsed.toFixed(0)}ms`);
    console.log(`Slop Index: ${(report.aiQuality ?? 0).toFixed(2)}`);

    if (elapsed > BUDGET_MS) {
      throw new Error(`Performance budget exceeded: ${elapsed.toFixed(0)}ms > ${BUDGET_MS}ms`);
    }

    console.log(`✅ Performance benchmark passed (${elapsed.toFixed(0)}ms <= ${BUDGET_MS}ms)`);
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
