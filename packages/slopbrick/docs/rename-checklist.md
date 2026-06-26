# slop-audit → slopbrick — User-Action Checklist (CLOSED in v0.11.0)

This document captures the steps that **cannot be done from the agent**
because they require GitHub/npm credentials under the user's account.

## Status: v0.11.0 complete (clean rename + platform move)

The full rename landed in v0.11.0. Every `slop-audit` reference in code,
docs, and CLI surface has been removed. The on-disk artifact directory
has been renamed from `.slop-audit/` to `.slopbrick/`. The schema
version field bumped from `'1'` → `'2'`.

For projects previously scanned by `slop-audit@≤0.10.1`:

```bash
npm install --save-dev slopbrick
npx slopbrick migrate     # renames .slop-audit/ → .slopbrick/, updates .gitignore
npx slopbrick scan        # regenerates inventory + constitution at schema v2
```

## Already done (this session + earlier)

- [x] Repo transferred `Dystx/slop-audit` → `usebrick/slopbrick` (GitHub auto-redirect is active)
- [x] Code + docs renamed (`slop-audit` → `slopbrick` in src/, tests/, scripts/, docs/, README.md, AGENTS.md, CHANGELOG.md, ROADMAP.md)
- [x] `package.json` updated: `name: "slopbrick"`, `bin: { slopbrick: "bin/slopbrick.js" }`, `version: "0.11.0"`, `repository.url: github.com/usebrick/slopbrick`, `author: usebrick.dev`
- [x] `bin/slop-audit.js` → `bin/slopbrick.js` (via `git mv`)
- [x] `src/cli/program.ts` `.name('slopbrick')` — CLI program name updated
- [x] `src/config/load.ts`: back-compat fallback REMOVED in v0.11.0 — only `slopbrick.config.*` accepted
- [x] **Artifact dir renamed**: `.slop-audit/` → `.slopbrick/` (BREAKING)
- [x] **Cache file renamed**: `.slop-audit-cache.json` → `.slopbrick-cache.json` (BREAKING)
- [x] **Config filename**: `slop-audit.config.*` → `slopbrick.config.*` (BREAKING)
- [x] **`slopbrick migrate` subcommand** — one-shot migration for existing v1 projects
- [x] **`MEMORY_SCHEMA_VERSION`**: bumped `'1'` → `'2'` in `@usebrick/core@0.2.0`
- [x] `distribute/aur/PKGBUILD` → `distribute/aur/slopbrick-bin.PKGBUILD` + content updated
- [x] `distribute/homebrew/slop-audit.rb` → `distribute/homebrew/slopbrick.rb` + content updated
- [x] `.github/actions/slop-audit/` → `.github/actions/slopbrick/` (action.yml body + README updated)
- [x] `.github/workflows/slop-audit.yml` → `.github/workflows/slopbrick.yml`
- [x] `examples/*/slop-audit.config.mjs` → `examples/*/slopbrick.config.mjs`
- [x] `.gitignore` updated (`.slop-audit/` lines replaced with `.slopbrick/`)
- [x] All 1521/1521 tests passing + `pnpm typecheck` clean
- [x] `slopbrick@0.11.0` published on npm (with the migrate subcommand + clean rename)
- [x] CHANGELOG.md v0.11.0 entry documenting the breaking change + `slopbrick migrate` workflow

## User action items (after v0.11.0)

### 1. ✅ npm deprecate `slop-audit`

```bash
npm deprecate slop-audit "Renamed to slopbrick — see https://github.com/usebrick/slopbrick"
```

### 2. ✅ npm publish `slopbrick` 0.11.0

Already done. Verify with:

```bash
npm view slopbrick@0.11.0
```

### 3. Verify install (optional)

```bash
mkdir /tmp/slopbrick-verify && cd /tmp/slopbrick-verify
npm init -y && npm install --save-dev slopbrick
npx slopbrick --version          # should print 0.11.0
npx slopbrick migrate --dry-run  # should print the migration plan (or no-op if already migrated)
```

### 4. Submit AUR + Homebrew tap (publishing step)

`distribute/aur/slopbrick-bin.PKGBUILD` and `distribute/homebrew/slopbrick.rb`
are ready. Submission commands in CHANGELOG.md v0.11.0 entry.

## Backward-compat window

**Closed in v0.11.0**. From this release forward:

- **Config filename**: `slop-audit.config.*` is no longer accepted.
  Users with old configs must run `slopbrick migrate` (which renames
  the config file too) OR manually rename `slop-audit.config.*` →
  `slopbrick.config.*`.
- **`.slop-audit/` artifact directory**: renamed permanently to
  `.slopbrick/`. `slopbrick migrate` does the rename.
- **`slop-audit` npm package**: deprecated. Removal from npm would
  break anyone still depending on it; leave the deprecation warning
  active.

## Decision log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Renamed `package.json` `name`? | **Yes** | `slopbrick` is the new canonical install |
| Renamed `bin` script? | **Yes** (`slopbrick`) | Same binary, new name |
| Renamed `.slop-audit/` artifact directory? | **Yes** (v0.11.0) | Was the on-disk contract, but `slopbrick migrate` makes the rename one-shot |
| Renamed config filename (`slop-audit.config.mjs`)? | **Yes** (v0.11.0) | Back-compat removed; `slopbrick migrate` renames the file |
| Renamed GitHub Action directory? | **Yes** | The `uses: ./...` path is the consumer-facing surface |
| Renamed workflows? | **Yes** (`slopbrick.yml`) | Matches the action name + simpler CI badge paths |
| Renamed `distribute/aur/PKGBUILD`? | **Yes** (`slopbrick-bin`) | AUR package name must match the binary |
| Renamed `distribute/homebrew/slop-audit.rb`? | **Yes** (`slopbrick.rb`) | Formula filename mirrors the binary |
| Renamed `examples/*/slop-audit.config.mjs`? | **Yes** (`slopbrick.config.mjs`) | New convention |
| Version bumps? | `0.10.0` → `0.10.1` → `0.11.0` | Each user-visible change bumps the minor version |
