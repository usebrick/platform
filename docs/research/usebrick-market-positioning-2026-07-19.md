# UseBrick market positioning research — 2026-07-19

**Evidence date:** 2026-07-19
**Status:** dated strategy input, not market validation
**Durable authority:** [`ROADMAP.md`](../../ROADMAP.md)

This note isolates volatile market observations and explicit modeling
assumptions from durable product documentation. Figures below are directional
inputs, not evidence of UseBrick demand, product-market fit, or achievable
revenue. The repository owner remains the only completed product tester;
external observed sessions completed: **0**.

## Decision supported

UseBrick should compete as the repository-owned coherence and verification
layer for agent-built software; SlopBrick is the acquisition surface.

## Observed market evidence

- [SlashData's Q3 2025 estimate](https://www.slashdata.co/post/rapid-growth-in-edge-ai-developers-and-where-the-opportunity-lies)
  reports approximately 38.4 million professional developers worldwide.
- [JetBrains' January 2026 AI Pulse](https://blog.jetbrains.com/research/2026/04/which-ai-coding-tools-do-developers-actually-use-at-work/)
  reports that 74% of developers worldwide had adopted specialist developer AI
  tools. This is the source for the 74% input; it is not a SlashData finding.
- [Stack Overflow's 2025 survey summary](https://stackoverflow.blog/2025/12/29/developers-remain-willing-but-reluctant-to-use-ai-the-2025-developer-survey-results-are-here/)
  reports continued AI-tool use alongside reluctance and trust concerns. That
  tension supports verification as a problem hypothesis, not proof that teams
  will buy UseBrick.
- [DORA's 2025 report](https://dora.dev/research/2025/dora-report/) treats AI as
  an amplifier of an organization's existing system rather than an automatic
  route to better delivery outcomes. This supports a repository-coherence
  hypothesis, not a UseBrick outcome claim.
- [Gartner's May 2026 outlook](https://www.gartner.com/en/newsroom/press-releases/2026-05-20-gartner-says-the-market-for-enterprise-ai-coding-agents-is-entering-a-new-phase-of-expansion-and-competitive-realignment)
  describes continued expansion and realignment in enterprise coding agents.
  UseBrick should complement agents with repository-owned verification rather
  than compete as another coding agent.

## Directional market model

The first two inputs come from independent studies with different methods and
populations. Multiplying them is an explicit scenario, not a measured category
TAM. It is a scenario, not a forecast.

```text
38.4m professional developers × 74% specialist AI-tool adoption = 28.4m directional seats
28.4m × $18–$30/month × 12 = approximately $6.1B–$10.2B annual spend proxy
(14.5m medium + 7.5m large) × 74% × 10%–20% fit = 1.63m–3.26m serviceable seats
1.63m–3.26m × $18–$30/month × 12 = approximately $352M–$1.17B annual capacity scenario
```

The 14.5 million medium-company and 7.5 million large-enterprise developer
inputs come from [SlashData's 2025 company-size breakdown](https://www.slashdata.co/post/global-developer-population-trends-2025-how-many-developers-are-there).
The 10%–20% fit range and $18–$30 monthly price range are UseBrick assumptions.
No source measures a UseBrick market, conversion rate, or willingness to pay.

### Hypothetical company outcome scenarios

These are arithmetic scenarios for understanding possible company scale, not
forecasts, targets, valuation claims, or evidence of demand. Seats and monthly
prices are unvalidated assumptions.

| Scenario | Hypothetical paid seats | Monthly price per seat | Arithmetic | Hypothetical ARR |
| --- | ---: | ---: | --- | ---: |
| A | 5,000 | $18 | 5,000 × $18 × 12 | ~$1.1M ARR |
| B | 25,000 | $22 | 25,000 × $22 × 12 | ~$6.6M ARR |
| C | 100,000 | $25 | 100,000 × $25 × 12 | $30M ARR |
| D | 250,000 | $30 | 250,000 × $30 × 12 | $90M ARR |

## Competitive implications

Current official pages show an active market for AI-assisted review and
governance: [CodeRabbit](https://www.coderabbit.ai/pricing) lists paid
per-user review plans, [Greptile](https://www.greptile.com/pricing) lists a
$30-per-seat team plan, and [Qodo](https://www.qodo.ai/pricing/) combines code
review with team governance. These are dated product/pricing observations, not
feature-parity requirements.

[TechCrunch reported in September 2025](https://techcrunch.com/2025/09/16/coderabbit-raises-60m-valuing-the-2-year-old-ai-code-review-startup-at-550m/)
that CodeRabbit was above $15 million ARR, attributing the figure to its CEO.
CodeRabbit is private; the figure is reported company disclosure, not audited
market proof and not evidence that UseBrick can reproduce the result.

[TechCrunch reported on March 2, 2026](https://techcrunch.com/2026/03/02/cursor-has-reportedly-surpassed-2b-in-annualized-revenue/),
citing Bloomberg reporting, that Cursor had surpassed $2 billion in annualized
revenue. [TechCrunch reported on June 9, 2026](https://techcrunch.com/2026/06/09/lovable-says-it-has-hit-500m-in-annualized-revenue-with-1-million-new-projects-a-week/)
that Lovable said it had surpassed $500 million in annualized revenue. These
private-company figures are attributed reporting, not audited proof. They are
evidence of commercial activity in upstream AI coding and app-building markets
only—not evidence of UseBrick demand, category size, pricing power, or likely
outcomes.

The competitive map spans several adjacent capabilities; the entries below are
positioning hypotheses, not claims that every competitor provides or lacks a
given capability.

| Capability | Typical market job | UseBrick posture |
| --- | --- | --- |
| Static/security | Find deterministic defects, vulnerabilities, or policy violations | Consume and preserve useful evidence; do not claim to replace specialist linters, SAST, or dependency tooling |
| Maintainability | Surface complexity, duplication, drift, and code-health concerns | Connect findings to repository-owned intent and a verified follow-through loop |
| AI review | Comment on changes and proposed fixes | Do not become another generic reviewer; provide durable facts and constraints usable by reviewers, agents, and CI |
| Context | Give tools repository knowledge | Test whether facts, approved intent, provenance, and freshness can remain useful without becoming a stale memory store |
| Architecture | Document or assess boundaries and decisions | Preserve approved constraints and make drift observable; do not infer authority from generated prose |
| AI-code scanning | Estimate AI association or inspect common generated-code failures | Keep association separate from authorship and quality; current claims remain bounded to SlopBrick's admitted evidence |
| Runtime/visual | Observe rendered behavior and visual regressions | Keep this in a bounded Render Labs benchmark until incremental value and false-positive cost are demonstrated |

UseBrick does not win by offering more rules, another reviewer, another memory
store, another scanner score, another coding agent, or another browser. The
hypothesis wins only if one repository-owned contract measurably improves the
path from scan to protection and verified outcomes.

The strategic opening is not another generic AI reviewer. It is one local,
repository-owned contract that lets developers, coding agents, and CI share
facts, approved intent, provenance, freshness, and verification receipts. The
current SlopBrick scan is the truthful first surface; planned Memory, Lock,
Mend, and Render Labs capabilities must earn their claims independently.

## Initial customer hypothesis

The initial buyer hypothesis is AI-native software teams and agencies with
roughly 5–100 developers, especially TypeScript-heavy web teams combining
frequent agent-authored changes with architecture, maintenance, contractual,
or reputational risk.

Serious solo developers and vibe coders remain the free local-scan entry
audience. They are not a proven core buyer. The next evidence step is 10–20
consent-safe observed external sessions under `GTM-001`; completed sessions
remain zero and outreach is not authorized by this note.

## Business-model and pricing hypothesis

- Free: the local SlopBrick scan and useful first finding remain the
  acquisition surface, without requiring a paid workspace.
- Team: test an unvalidated range of $19–$29 per active contributor per month
  for a narrow, trusted new-debt enforcement workflow, with a possible
  $99–$399 monthly workspace minimum. Neither the unit nor the minimum has been
  offered to buyers.
- Enterprise: test a custom annual-contract hypothesis only for teams that
  demonstrate demand for shared governance, procurement support, auditability,
  or deployment controls. No enterprise price is proposed or validated.

This free/team/enterprise model and every price above are research prompts only.
No packaging or price has been offered, accepted, or validated with an external
buyer.

## Evidence still missing

- 10–20 consented external observations of scan completion, first useful
  finding, action or decline, rescan, return behavior, and team workflow.
- A willingness-to-pay signal tied to a concrete new-debt workflow rather than
  general interest in AI quality.
- Comparative evidence that repository-owned context improves tasks across
  agents without becoming stale or bloated.
- A bounded source-only versus rendered-evidence benchmark showing incremental
  detection value without unacceptable false positives.
- Repeated paid-team evidence before shared governance, enterprise controls,
  or a package extraction is considered.

## Sources

- [SlashData — professional developer estimate, Q3 2025](https://www.slashdata.co/post/rapid-growth-in-edge-ai-developers-and-where-the-opportunity-lies)
- [SlashData — developer population and company-size breakdown, 2025](https://www.slashdata.co/post/global-developer-population-trends-2025-how-many-developers-are-there)
- [JetBrains — specialist developer AI-tool adoption, January 2026](https://blog.jetbrains.com/research/2026/04/which-ai-coding-tools-do-developers-actually-use-at-work/)
- [Stack Overflow — 2025 Developer Survey AI summary](https://stackoverflow.blog/2025/12/29/developers-remain-willing-but-reluctant-to-use-ai-the-2025-developer-survey-results-are-here/)
- [DORA — State of AI-assisted Software Development 2025](https://dora.dev/research/2025/dora-report/)
- [Gartner — enterprise AI coding-agent outlook, May 2026](https://www.gartner.com/en/newsroom/press-releases/2026-05-20-gartner-says-the-market-for-enterprise-ai-coding-agents-is-entering-a-new-phase-of-expansion-and-competitive-realignment)
- [CodeRabbit pricing](https://www.coderabbit.ai/pricing)
- [Greptile pricing](https://www.greptile.com/pricing)
- [Qodo pricing](https://www.qodo.ai/pricing/)
- [TechCrunch — reported CodeRabbit financing and company-attributed ARR](https://techcrunch.com/2025/09/16/coderabbit-raises-60m-valuing-the-2-year-old-ai-code-review-startup-at-550m/)
- [TechCrunch — reported Cursor annualized revenue, March 2, 2026](https://techcrunch.com/2026/03/02/cursor-has-reportedly-surpassed-2b-in-annualized-revenue/)
- [TechCrunch — Lovable company-attributed annualized revenue, June 9, 2026](https://techcrunch.com/2026/06/09/lovable-says-it-has-hit-500m-in-annualized-revenue-with-1-million-new-projects-a-week/)
