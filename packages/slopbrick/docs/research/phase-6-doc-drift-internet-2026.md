# Phase 6 — Documentation Drift — Internet Research (June 2026)

> Fresh internet scan for the `slopbrick docs` subcommand (target: v0.8.0). Five actionable findings with inline citations.

---

## 1. Existing tooling

**Static-site generators ship link-only drift detection, nothing semantic.** Docusaurus checks internal links but only on production `build` (not in dev) and throws on broken link by default [^1^]. Mintlify CI checks ship three signals: broken internal links, Vale prose linting, and grammar validation — explicitly "does not check external links" [^2^]. GitBook, Read the Docs, Diátaxis are authoring methodologies — none detect drift. **mkdocstrings / sphinx-autoapi / TypeDoc generate docs FROM code (one-way); they don't flag docs that contradict code** [^3^][^4^]. **No open-source tool cross-references `package.json` ↔ README, exported names ↔ markdown inline code, or route paths ↔ doc URLs.**

## 2. What companies do at scale

The commercial leaders are **Mintlify Autopilot** (LLM agent that watches PRs, drafts doc updates, surfaces suggestions to humans) [^5^] and **Promptless** (auto-suggests doc updates when product changes, with style-guide adherence) [^6^]. Both are **paid SaaS**, both are **LLM-mediated** (not deterministic), and both target the **PR-time suggestion workflow** — not the static-analysis gate that `slopbrick docs` would be. Docsie documents the canonical progression Synchronized → MinorDrift → ModerateDrift → SevereDrift → Broken, and confirms that follow-up doc tickets are "completed <40% of the time" — supporting the *gate, not reminder* model [^7^].

## 3. Academic research

IEEE 2025 survey "A Review on Detecting and Managing Documentation Drift in Software Development" confirms the field has no standard benchmark [^8^]. ICSE 2022 work on trace-link explanations explores deep-learning recovery of code↔doc links [^9^]. Most relevant new paper: **arXiv 2606.04769 (June 2026) on MCP servers reports F1 = 96.73%, accuracy = 96.75% for description-code inconsistency detection** when combining structural + semantic signals [^10^]. arXiv 2510.03480 (LLM Agents for Automated Dependency Upgrades, Oct 2025) uses migration docs as ground truth for code-update agents — direct validation of the code↔doc surface-diff approach [^11^].

## 4. AI-coding-agent posture on docs

Cursor, Continue.dev (acquired by Cursor, Feb 2025), Aider, and Cody **do not auto-update docs after code edits** [^12^]. They treat docs as out-of-context — neither retrieved nor refreshed. Mintlify is the only vendor closing this loop, and only via a paid agent. **This is an open hole: slopbrick is positioned to fill it for AI-agent-first teams.**

## 5. Case studies (2024–2026)

**AWS Kiro outage, Dec 2025** — agentic coding tool autonomously deleted a production environment, 13-hour outage in a China region; engineers flagged it as "predictable" given unchecked AI permissions [^13^][^14^]. Apple Developer Docs outage (forum acknowledgement, undated 2025). Stellar Index changelog F-1246: "API reference doc drift after rc.48 — regenerated docs" — a real, tracked production-ticket example of the failure mode [^15^].

## 6. Calibration baselines

**Best published number: F1 = 96.73% on MCP server description-code inconsistency** (arXiv 2606.04769) [^10^]. Docusaurus's link checker is binary pass/fail with no reported metrics. Mintlify's CI checks publish no precision numbers. **Plan v1 should commit to publishing its own precision/recall on a calibration corpus before tagging 0.8.0 stable.**

---

## 5 actionable findings for v1

1. **The market hole is real and ours to fill.** Docusaurus/Mintlify/GitBook handle broken-link and prose lint; no one ships **code-surface ↔ doc-surface staleness** (stale package, function, env-var, route) as a deterministic CI gate [^1^][^2^]. Ship the 6 rules in the plan as-is; this is a defensible moat.

2. **Drop `stale-env-var-reference` to severity `low` and defer `stale-url-reference` (route paths) from v1 to 0.8.x.** The IEEE survey and Docsie case studies show env-var and route drift cause incidents only when they collide with onboarding paths — both have the highest FP risk in the plan's calibration table. Ship `stale-package`, `stale-function`, `expired-code-example`, `broken-link` first; defer env-var and route-path once we have signal [^7^][^8^].

3. **The AWS Kiro outage is the v1 framing hook.** Reframe: **"prevent AI agents from reading wrong code examples"** — copy-paste from stale docs into AI-generated code is the dominant 2026 failure mode [^13^]. Aligns `slopbrick docs` with the existing "AI Maintenance Cost" score in the 0.9.0 roadmap.

4. **Ship `--check-remote` OFF by default, but make the default behavior local + instant.** Every commercial competitor gates remote checks behind settings [^2^]. Add a hard 3-second-per-URL timeout and 50-URL cap to make the flag actually safe.

5. **Commit to publishing precision/recall numbers before tagging 0.8.0.** arXiv 2606.04769 sets the floor at F1 = 96.73% [^10^]. Build a 50-doc calibration corpus (vs. the 6 fixtures in the plan) and publish numbers in the release notes.

---

## Sources

[^1^]: Docusaurus internal link checker — https://docusaurus.io/docs/api/docusaurus-config
[^2^]: Mintlify CI checks — https://www.mintlify.com/docs/deploy/ci
[^3^]: Sphinx autodoc — https://www.sphinx-doc.org/en/master/usage/extensions/autodoc.html
[^4^]: mkdocstrings — https://mkdocstrings.github.io/
[^5^]: Mintlify Autopilot — https://www.mintlify.com/blog/autopilot
[^6^]: Promptless — https://promptless.ai/
[^7^]: Docsie "Documentation Drift" — https://www.docsie.io/blog/glossary/documentation-drift/
[^8^]: IEEE 2025 survey on documentation drift — https://ieeexplore.ieee.org/iel8/11196743/11196744/11196773.pdf
[^9^]: ICSE 2022 trace-link explanations — https://dl.acm.org/doi/10.1145/3510003.3510129
[^10^]: "Description-Code Inconsistency in Real-world MCP Servers" arXiv 2606.04769 (Jun 2026) — https://arxiv.org/html/2606.04769v1
[^11^]: "LLM Agents for Automated Dependency Upgrades" arXiv 2510.03480 (Oct 2025) — https://arxiv.org/abs/2510.03480
[^12^]: Continue.dev acquired by Cursor (Feb 2025) — https://www.continue.dev/
[^13^]: AWS Kiro 13-hour outage, Dec 2025 — https://www.docker.com/blog/coding-agent-horror-stories-the-13-hour-aws-outage/
[^14^]: Hari R. on Kiro AWS outage, LinkedIn, Feb 2026 — https://www.linkedin.com/posts/hari-r-865934231_agenticai-aiengineering-awsoutage-activity-7431924031471386624-vDzN
[^15^]: Stellar Index changelog F-1246 — https://stellarindex.io/changelog/
