# slopbrick GitHub Action

A composite GitHub Action that installs and runs [slopbrick](https://github.com/usebrick/slopbrick) in your workflow, with optional SARIF upload support for the GitHub Security tab and an optional PR-comment step that posts a Markdown summary on the pull request.

## Inputs

| Input              | Description                                                               | Required | Default                   |
| ------------------ | ------------------------------------------------------------------------- | -------- | ------------------------- |
| `version`          | slopbrick version to install                                             | No       | `latest`                  |
| `config-path`      | Path to slopbrick config file                                            | No       | `slopbrick.config.mjs`   |
| `format`           | Output format (`pretty`, `json`, `html`, `sarif`)                         | No       | `sarif`                   |
| `fail-on-error`    | Set to `true` to fail the job when slopbrick reports issues (exits non-zero); set to `false` to never fail | No       | `true`                    |
| `output-path`      | Path for the report file. Extension should match `format`. slopbrick writes the report to stdout, so the action redirects stdout to this path. | No       | `slopbrick-report.sarif` |
| `pr-comment`       | Post a Markdown summary as a PR comment (idempotent across re-runs)       | No       | `false`                   |
| `pr-number`        | PR number to comment on. Defaults to the `pull_request.number` from the workflow event. | No       | `${{ github.event.pull_request.number }}` |

## Outputs

| Output         | Description                                                     |
| -------------- | --------------------------------------------------------------- |
| `slop-index`   | Computed slop index (only populated for `json` format)          |
| `report-path`  | Path to generated report file                                   |
| `issues-count` | Total number of issues found (only populated for `json` and `sarif` formats) |

> **Note:** `slop-index` and `issues-count` are parsed from the generated report. `slop-index` is only populated when `format` is `json`. `issues-count` is populated when `format` is `json` or `sarif`. For `pretty` or `html` formats, both outputs default to empty / `0`.

## Example workflow — SARIF only

```yaml
name: slopbrick
on: [pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/slopbrick
        with:
          format: sarif
          output-path: slopbrick.sarif
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: slopbrick.sarif
```

## Example workflow — PR comment + SARIF

When `pr-comment: 'true'` is set, the action posts a single Markdown comment on the PR summarising the run. The step is idempotent: on re-runs it updates the existing comment rather than creating duplicates. The post step uses `continue-on-error: true`, so a failed comment never fails the workflow.

For best results, use `format: json` — the Slop Index field is only populated in JSON output; SARIF reports will display `n/a`. If you also want SARIF upload, run the action twice (once per format) or stick with `format: sarif` and accept the missing Slop Index.

```yaml
name: slopbrick
on: [pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write   # required to post PR comments
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/slopbrick
        with:
          format: json
          output-path: slopbrick-report.json
          pr-comment: 'true'
      - name: Build SARIF for Security tab
        if: always()
        uses: ./.github/actions/slopbrick
        with:
          format: sarif
          output-path: slopbrick.sarif
          pr-comment: 'false'
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: slopbrick.sarif
```

### Minimal permissions

The PR-comment step posts through the GitHub REST API as the workflow's `GITHUB_TOKEN` user (`github-actions[bot]`). The token must have `pull-requests: write` for the comment to be created. The action does not request any additional scopes.

## How the comment is built

The post step runs `post-comment.sh <report-path>`, which:

1. Parses the SARIF or JSON report and extracts total issue count, top-5 rules by frequency, and top-3 offending files.
2. Builds a Markdown body containing the marker `<!-- slopbrick-comment -->`.
3. Calls `GET /repos/{owner}/{repo}/issues/{pr}/comments` to look for an existing comment containing that marker.
4. If found, sends `PATCH` to update it. Otherwise sends `POST` to create a new one.

A failure in the post step never fails the workflow (`continue-on-error: true`).
