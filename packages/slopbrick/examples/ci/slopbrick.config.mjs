// CI-tuned config.
//
// Use this when running slopbrick in a CI pipeline. Outputs:
//   * human-readable summary to stdout (always)
//   * JSON report to ./slopbrick-report.json (for archival / diffing)
//   * SARIF to ./slopbrick.sarif (for GitHub code scanning upload)
//
// Example GitHub Actions step:
//
//   - name: slopbrick
//     run: |
//       npx slopbrick scan \
//         --json ./slopbrick-report.json \
//         --sarif ./slopbrick.sarif
//   - name: Upload SARIF
//     uses: github/codeql-action/upload-sarif@v3
//     with:
//       sarif_file: ./slopbrick.sarif

export default {
  include: [
    'app/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
    'src/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
    'components/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
    'pages/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
  ],
  exclude: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/coverage/**',
  ],

  // Stricter thresholds for CI gating.
  thresholds: {
    meanSlop: 18,
    p90Slop: 35,
    individualSlopThreshold: 55,
  },

  // Block if any slop grew vs. baseline.
  noIncrease: true,
  // Emit a trend delta vs. persisted baseline.
  trend: true,
  // Disable telemetry in CI (don't phone home).
  telemetry: false,
};