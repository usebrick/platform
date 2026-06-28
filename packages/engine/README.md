# @usebrick/engine

The pure scanning engine extracted from `slopbrick`. No I/O, no `console.log`, no `process.exit`. Reusable from the CLI, the MCP server, and future web IDEs.

## What lives here

Pure functions that:
- read structured inputs (parsed ASTs, signal-strength data, calibration)
- produce structured outputs (LRs, scores, classifications)
- have no filesystem, network, or process side effects

## What does NOT live here

Anything that touches the filesystem (`fs.readFile`, `fs.writeFile`), the process (`process.exit`, `process.argv`), or stdout/stderr (`console.log`). Those concerns live in the slopbrick CLI and MCP server.

## Status

v0.15.0: package scaffolded (B.1). Files will be moved here in B.2-B.7.
