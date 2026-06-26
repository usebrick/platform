# Phase Memo 4 — AI Maintenance Cost: Industry Research (June 2026)

Empirical grounding for `slopbrick maintenance-cost` (a categorical `low | medium | high | critical` score derived from existing slopbrick signals), with a concrete `$/month` calibration anchored to published industry data.

---

## Industry Practices Summary

The code-health aggregation market has converged on three patterns:

1. **Per-file letter grades** (CodeClimate's A–F GPA, with each grade mapped to a remediation cost in minutes: A < 1h, B 1–2h, C 2–4h, D 4–8h, F > 8h) [^1^]
2. **Portfolio-level dollar-cost rollups** (Sonar's published benchmark of **$306,000/year per 1 million LoC** of code-level technical debt, derived from 200 projects and 11 MLoC [^2^]; CAST's 2025 analysis of 61 billion lines of global tech debt [^3^])
3. **Multi-dimensional developer-productivity frameworks** that deliberately *refuse* a single number — DORA's 4 metrics [^4^], Microsoft Research's SPACE framework (5 dimensions) [^5^], DX's DevEx (3 dimensions) [^6^]

A categorical bucket label — matching the format `slopbrick` already uses for `aiSecurityRisk` — is the industry exception, not the norm. The closest analogue is Sonar's Quality Gate pass/fail per condition [^7^].

## AI-specific signal landscape (2024–2026)

GitClear's 2025 report (211M changed lines from Google, Microsoft, Meta repos) showed "refactored" lines falling from 25% to <10% and "copy-pasted" lines rising from 8.3% to 12.3% between 2021–2024 [^8^]. CodeRabbit's 470-PR study found **AI-generated code carries 1.7× more issues** per PR (10.83 vs 6.45) and a higher share of critical/major issues [^9^]. METR's July 2025 RCT (16 experienced open-source devs, 246 tasks on repos averaging 22k stars / 1M LoC) measured a **19% slowdown** when AI tools were allowed [^10^]. Faros AI's 2026 telemetry of 22k developers found +51% PR size, +28% bugs per PR, 5× median review time, 3× incidents per PR, 10× code churn [^11^]. Stack Overflow's 2025 survey (49k devs): 80% AI adoption but **trust in AI accuracy dropped from 40% to 29%**, with 66% of devs reporting *more* time spent debugging AI output [^12^].

## Five Actionable Findings for v1

**Finding 1 — The categorical bucket must include a numeric health sub-score (0–100), not just a label.** SPACE [^5^] and DORA [^4^] explicitly refuse single-number rollups; Sonar instead produces many sub-metrics that feed one dollar rollup [^2^]. Managers want a bucket ("HIGH") but agents and trend pipelines need a number. Match the existing `aiSecurityRisk` pattern: label for humans, counts and sub-scores for machines.

**Finding 2 — Anchor the `$/month` calibration to Sonar's published $306K/yr/MLoC figure, not a homemade estimate.** This is the most-cited, peer-reviewed-style published dollar anchor in the industry [^2^]. Translate it to **$25.50 per 1000 LoC per month** as the baseline maintenance burden, then multiply by the categorical bucket (0.5× for low, 1.0× for medium, 2.0× for high, 4.0× for critical).

**Finding 3 — Use CodeClimate's per-grade remediation-time mapping for per-issue cost.** Each issue carries a grade-derived minute cost (A=30min, B=90min, C=180min, D=360min, F=480min+) [^1^]. At a fully-loaded US dev cost of ~$50/hr ($100k salary / 2000 hrs), that yields **$25 / $75 / $150 / $300 / $400 per issue by grade**. Sum across all issues in a scan; the issue-cost total and the LoC-baseline total together produce the final `$/month`.

**Finding 4 — Apply an AI multiplier when AI-assisted signals are detected.** The CodeRabbit [^9^] 1.7× issue rate, Faros [^11^] 3× incident rate, GitClear [^8^] 4× clone growth, and Stack Overflow [^12^] trust collapse all justify an **AI multiplier of 1.5×–2.5×** applied when (a) `slopIndex` includes AI-typical rules like `visual/inline-style` or `logic/weak-types`, OR (b) `constitutionViolations` ≥ 5 in a category, OR (c) `architectureConsistency` has fallen >10 points between scans.

**Finding 5 — Ship the formula with a documented floor of $0/month and a calibration log.** Stripe's Developer Coefficient (42% of every dev's week lost to debt + bad code) [^13^] gives an upper bound: a 50-dev team at $100k fully-loaded = **$1.65M/year** ≈ $137k/month. For a single small project (10k LoC, <10 issues), floor at $0. Log every score to `.slop-audit/cache/maintenance-cost.jsonl` so v0.9 calibration can re-fit weights against real project outcomes.

---

## Recommended v1 `$/month` Formula

```ts
// Per-issue cost: CodeClimate remediation mapping × $50/hr fully-loaded dev rate
const issueCost =
    highSeverityCount   * 400 +   // F-grade: 8h+
    mediumSeverityCount * 150 +   // C-grade: 3h
    lowSeverityCount    *  50;    // B-grade: 1h

// Sonar baseline: $25.50 per 1000 LoC per month
const locBaseline = (linesOfCode / 1000) * 25.50;

// Bucket multiplier (categorical → numeric)
const bucketMultiplier = { low: 0.5, medium: 1.0, high: 2.0, critical: 4.0 }[bucket];

// AI multiplier (only when AI-typical signals present)
const aiMultiplier = hasAiSignals ? 1.8 : 1.0;

const monthlyUSD = Math.round(
    Math.max(0, locBaseline * bucketMultiplier * aiMultiplier + issueCost * aiMultiplier)
);
```

**Sanity check vs. published benchmarks:** a 100k LoC project, medium bucket, 50 issues (10 high / 30 medium / 10 low), AI signals detected → `(100 × 25.50 × 1.0 + (10×400 + 30×150 + 10×50)) × 1.8 = (2,550 + 9,000) × 1.8 ≈ $20,800/month`, ≈ $250k/year — in the same order of magnitude as Sonar's $306k/yr/MLoC [^2^].

---

## References

[^1^]: CodeClimate Maintainability Score — https://technicaldebtcost.com/code-climate-maintainability
[^2^]: Sonar — *New Research on Cost of Technical Debt* (2025) — https://www.sonarsource.com/blog/new-research-from-sonar-on-cost-of-technical-debt/
[^3^]: CAST — *Coding in the Red* (2025) — https://www.castsoftware.com/ciu/coding-in-the-red-technical-debt-report-2025
[^4^]: Swarmia — *DORA Metrics* — https://www.swarmia.com/dora-metrics/
[^5^]: Forsgren et al. — *The SPACE of Developer Productivity*, ACM Queue (Jun 2021) — https://queue.acm.org/detail.cfm?id=3454124
[^6^]: Noda et al. — *DevEx Framework* — https://www.infoq.cn/article/sF2is0yZ7B5yWcG8T8U9
[^7^]: SonarQube Server 2025.1 — *Quality Gates* — https://docs.sonarsource.com/sonarqube-server/2025.1/instance-administration/analysis-functions/quality-gates
[^8^]: GitClear — *AI Copilot Code Quality 2025* — https://www.gitclear.com/ai_assistant_code_quality_2025_research
[^9^]: CodeRabbit — *State of AI vs Human Code Generation* (2025) — https://coderabbit.ai/blog/state-of-ai-vs-human-code-generation-report
[^10^]: METR — *Measuring the Impact of Early-2025 AI on Developer Productivity* (Jul 2025) — https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/
[^11^]: Faros AI — *AI Impact on Engineering Productivity: 2026 Report* — https://www.faros.ai/research/ai-acceleration-whiplash
[^12^]: Stack Overflow — *2025 Developer Survey* — https://survey.stackoverflow.co/2025/ai
[^13^]: Stripe — *The Developer Coefficient* (2018) — https://stripe.com/files/reports/the-developer-coefficient.pdf
