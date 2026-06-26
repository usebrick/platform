# Pre-commit Hooks with slopbrick

You can run `slopbrick` before each commit to catch slop before it reaches the repository. The `--staged` flag is the recommended mode for hooks because it scans changed files (staged and unstaged), giving fast feedback without re-auditing the entire project.

## Why `--staged`?

- **Focused feedback** — only changed files are scanned, so results are relevant to the current commit.
- **Fast** — skips unchanged code, keeping pre-commit checks quick.
- **Non-intrusive** — does not require a clean baseline for the whole project.
- **Includes unstaged changes** — `--staged` scans both staged and unstaged changed files. This is useful for local feedback, but it means the hook may flag changes you have not yet staged.

## Recommended `lint-staged` config

Add the following to your `package.json`:

```json
{
  "lint-staged": {
    "*.{js,jsx,ts,tsx,vue,svelte,astro}": [
      "slopbrick scan --staged"
    ]
  }
}
```

This runs `slopbrick scan --staged` against the staged files matched by the glob.

## Husky v9 hook example

Create `.husky/pre-commit` with a single line:

```bash
npx lint-staged
```

Make sure the file is executable:

```bash
chmod +x .husky/pre-commit
```

## Blocking commits

By default, `slopbrick scan` exits `0` when configured slop thresholds pass, even if individual issues are reported. To guarantee a commit is blocked on high-severity issues, add `--strict`:

```bash
slopbrick scan --staged --strict
```

To fail only when the slop index increases compared to the previous baseline, use `--no-increase`:

```bash
slopbrick scan --staged --no-increase
```

You can combine both flags if you want to block on high-severity issues *and* prevent regression:

```bash
slopbrick scan --staged --strict --no-increase
```

## Troubleshooting

- **`--staged` scans nothing** — `slopbrick` uses git to determine changed files. If the working directory is not inside a git repository, `--staged` will scan nothing. Make sure your project is initialized with `git init` and has at least one commit.
- **Slow commits** — if scanning staged files is still slow, narrow the `lint-staged` glob or exclude generated files in `slopbrick.config.mjs`.
- **Husky hook not running** — verify that `.husky/pre-commit` is executable and that Husky is installed (`npx husky install` for older versions; Husky v9 does this automatically).
