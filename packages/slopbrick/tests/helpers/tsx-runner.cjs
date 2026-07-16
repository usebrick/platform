#!/usr/bin/env node

// `tsx <script>` starts an IPC server even for one-shot executions. In
// restricted macOS/Codex environments that socket can be denied, making
// subprocess contract tests fail before the TypeScript entrypoint runs. Use
// tsx as a Node loader instead; it preserves source execution without the
// one-shot IPC server.
const { spawnSync } = require('node:child_process');

const [script, ...args] = process.argv.slice(2);
if (!script) {
  process.stderr.write('tsx-runner requires a script path\n');
  process.exitCode = 2;
} else {
  const loader = require.resolve('tsx');
  const result = spawnSync(process.execPath, ['--import', loader, script, ...args], {
    stdio: 'inherit',
  });
  if (result.error) {
    process.stderr.write(`${result.error.message}\n`);
    process.exitCode = 1;
  } else if (result.signal) {
    process.kill(process.pid, result.signal);
  } else {
    process.exitCode = result.status ?? 1;
  }
}
