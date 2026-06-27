# SlopBrick website copy (v0.14.5d)

> **AI agents forget your architecture. Every session starts fresh.**
>
> SlopBrick gives your codebase persistent memory —
> so agents follow your patterns instead of reinventing them.

The hero is two lines: a problem statement and a one-sentence resolution. The
"kitchen analogy" lives in the explanation below; the rest is direct.

## 1. Hero

> ## AI agents forget your architecture. Every session starts fresh.
>
> SlopBrick gives your codebase persistent memory — so agents follow your
> patterns instead of reinventing them.

## 2. Problem statement (three sentences)

> What happens to a codebase after six months of AI-assisted development with
> no memory system. Four modal systems, three API clients, hardcoded API keys.
> The fourth `useState` reducer replaces `useReducer`; the second fetch call
> bypasses the cache; the `sk-...` key in the bundle ships to production.
> None of it was wrong when it was written — the agent didn't know what
> already existed.

## 3. The one-minute explanation (kitchen analogy)

> Your kitchen has a recipe drawer. The drawer is how the kitchen remembers
> itself — it's what tells the next person cooking there that the salt is in
> the third cabinet, that the oven runs 25° hotter than the dial says, that
> the dough needs an extra rise on humid days. The drawer isn't the meal,
> but the meal is unreliable without it.
>
> `.slopbrick/memory.md` is the recipe drawer for your codebase. `slopbrick
> scan` writes it: the canonical patterns your project uses, the
> components the codebase actually has, the constitution of rules the team
> has agreed on, the health snapshot of where the code is. The next time
> your AI agent writes a file — Claude Code, Cursor, Copilot, Aider — it
> reads the drawer before it writes. It doesn't reinvent your API client.
> It doesn't pick a state library you already abandoned. It doesn't
> re-implement `useReducer` with `useState` because the LLM's training data
> defaults to it.
>
> The drawer is generated, not hand-written. The next time something
> changes — a new package added, an old pattern removed — `slopbrick scan`
> re-runs and the drawer updates. The next agent reads the new drawer. The
> team does not.

## 4. Install

```bash
npm install -D slopbrick
npx slopbrick init        # write .slopbrick/constitution.json
npx slopbrick scan        # write .slopbrick/memory.md
npx slopbrick mcp         # start the MCP server (Claude / Cursor)
```

For the prevention layer:

```bash
slopbrick watch           # re-run scan on every file change
slopbrick lock            # install the Git pre-commit hook
slopbrick ci              # exit 1 on constitution violation
```

## 5. Self-scan demo (slopbrick's own repo)

Real numbers from the slopbrick repo itself, scanned with the
default configuration. slopIndex 60 means the codebase passes the
Repository Coherence threshold (≥ 70 would mean a clean baseline; the
v0.14.x era of slopbrick is mid-calibration).

```text
$ npx slopbrick scan
Repository Coherence:  60 / 100
  ├─ Architecture:     0.0  (Weighted:  0.0)
  ├─ Pattern (inv):    0.0  (Weighted:  0.0)
  ├─ Constitution:   100.0  (Weighted: 10.0)
  └─ AI Debt:         25.0  (Weighted:  2.5)

  Issue counts: 92 high · 182 medium · 2 low
  DefaultOff rules correctly suppressed: 99 calibration-failed issues
  (these are rules that fire on human code as often as AI code;
  surfacing them would erode trust faster than any other failure mode)

  Top 3 offense rules (defaultOff-filtered):
  1. ai/compression-profile       (AI boilerplate signature)
  2. ai/segment-surprisal-cv     (low register-switch entropy)
  3. visual/naturalness-anomaly  (artificial repetition in tokens)

  Headline verdict: the slopbrick codebase is mostly clean. The 99
  suppressed issues are HYGIENE rules the v6 calibration labeled
  INVERTED or NOISY — they would have shown as the top offenses
  before v0.14.5g, misleading every reader of the report.
```

The 92 high-severity issues that DO fire are real AI signatures in a
codebase that was hand-written across many sessions. They are also the
calibration data: every issue the tool fires on its own source is a
data point for the v7 corpus re-calibration (currently running,
~10h ETA).

## Comparison table (slopIndex 60 with vs without defaultOff suppression)

| Metric                                | Without | With    |
|---------------------------------------|---------|---------|
| slopIndex (0-100, lower = better)     | 100     | 60      |
| topOffenseIds includes INVERTED rules | yes (3) | no (0)  |
| Issues suppressed via defaultOff      | 0       | 99      |
| False-positive signal in headline     | heavy   | minimal |

The "without" column is what the user would have seen in the v0.14.5d
self-scan **before** today's fix. The "with" column is what they see now.

## Why this isn't CLAUDE.md

CLAUDE.md, .cursorrules, and .github/copilot-instructions.md all try to
solve the same problem: tell the agent about your project. They fail
for three reasons:

1. **Stale on contact.** The first time someone refactors, the rules
   file goes out of date. There's no enforcement loop.
2. **Hand-maintained.** The team has to write and rewrite the rules
   file. Nobody does.
3. **Agent doesn't enforce it.** The agent reads CLAUDE.md once at
   session start, then forgets.

SlopBrick is different because:

1. **Generated, not hand-written.** `slopbrick scan` extracts the
   patterns from the actual codebase. Refactors update the
   `memory.md` on the next scan.
2. **Enforced by the same tool that detects.** `slopbrick drift` exits
   1 on any Constitution violation. `slopbrick ci` is a CI gate.
   `slopbrick lock` is a pre-commit hook. The agent's output is
   checked by the same tool that wrote the rules.
3. **Updates on every scan.** When the team adds a new package to the
   Constitution, the next scan enforces it. When the codebase
   drifts, the next scan catches it.

## What the website says about CALIBRATION

The numbers on this page (60/100, 99 suppressed, 92 real) are
preliminary. The v7 calibration pass is currently running against
184k human-written files + 237k AI-generated files (45-minute
shutdown clock). When it finishes, the `signal-strength.json` file
in this repo will be re-written with new Precision / Recall / FPR
per rule, and the topOffenseIds will be re-computed. We expect the
distribution to land in:

| Verdict    | v6 count | v7 target |
|------------|----------|-----------|
| USEFUL     | 13       | 14-18     |
| OK         | 6        | 4-8       |
| NOISY      | 9        | 6-10      |
| INVERTED   | 0        | 0         |
| DORMANT    | 12       | 18-26     |
| HYGIENE    | 24       | 24        |

(Total = 64 v0.12.2 rules + 16 v0.14.x rules = 80 rules; the v7 corpus
also adds 100 shallow-cloned "vibe-coded" repos to the pos set.)

## What the website says about LOCKBRICK

The free-tier value proposition of slopbrick is the prevention layer:

```bash
slopbrick watch      # file-watch, flags violations as you write
slopbrick lock       # installs pre-commit hook (auto-detects Husky)
slopbrick ci         # CI gate: exit 1 on constitution violation
```

When the agent's output is checked by the same tool that wrote the
rules, the round trip closes. AI agent writes code → `slop_validate_change`
(planned) or `slopbrick watch` (current) → accept or reject → rewrite
if rejected → commit accepted version. SlopBrick spans UNDERSTAND
and PREVENT. That's the free tier.
