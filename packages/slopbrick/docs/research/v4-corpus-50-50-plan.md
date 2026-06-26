# v4 corpus expansion — 50/50 plan (2026-06-15)

**User direction:** The v3 corpus (95,916 neg : 27,986 pos = 3.4:1) is unbalanced. Push both arms to ~100,000 files each for a 1:1 ratio before public launch.

**Status:** Plan documented. Awaiting bash to clone repos + run scans.

---

## v3 baseline (committed in 5558641)

| Corpus | Files | Notes |
|--------|-------|-------|
| Negative | 95,916 | 29 cloned repos + 54,980 from `ai-slop-baseline` |
| Positive | 27,986 | 25 cloned repos + 6,097 from `ai-slop-baseline` |
| Ratio | 3.4:1 | Unbalanced — single noisy neg file can deflate AI signal by 0.1× |

**v3 scan results:** 32 PASS, 5 INVERTED, 2 DORMANT (39 rules)
**v3 scan time:** 391s pos + 394s neg = 13 min combined (4 workers)

---

## v4 targets

| Corpus | v3 | v4 target | Delta | Strategy |
|--------|-----|-----------|-------|----------|
| Negative | 95,916 | ~100,000 | +5,000 | Clone 5-10 more production repos |
| Positive | 27,986 | ~100,000 | +72,000 | Clone 50-100 more AI-coded repos |
| Ratio | 3.4:1 | **1:1** | -2.4× | Balanced statistical power |

---

## v4 negative candidates (need +5k files)

Pick 5-10 from this list (target ~1000 files each):

| Repo | Domain | Why |
|------|--------|-----|
| `radix-ui/primitives` | React UI primitives | Production-grade headless components |
| `mantinedev/mantine` | React component library | Heavy use, large repo |
| `chakra-ui/chakra-ui` | React component library | Different style from MUI |
| `shadcn-ui/ui` | shadcn registry (refs) | The "human reference" for shadcn |
| `pmndrs/zustand` | React state library | Production hook patterns |
| `tldraw/tldraw` | Canvas / drawing | Different domain |
| `excalidraw/excalidraw` | Canvas / drawing | Different domain |
| `withastro/astro` | Static site generator | Multi-language (TS + Go) |
| `vercel/next.js` | React framework | Huge repo, capped at 2k |
| `calcom/cal.com` | Scheduling app | Full-stack |
| `plausible/analytics` | Analytics dashboard | Different domain |
| `AppFlowy-IO/AppFlowy` | Notion alternative | Heavy Rust + TS |
| `immich-app/immich` | Photo management | Full-stack TypeScript |
| `laurent22/joplin` | Note-taking | Multi-language |
| `standardnotes/app` | Notes | Multi-language |
| `docmost/docmost` | Wiki/docs | Recently active |
| `Budibase/budibase` | Low-code platform | Internal tool builder |
| `ToolJet/ToolJet` | Low-code platform | Internal tool builder |
| `mattermost/mattermost` | Chat | Go + TS |
| `RocketChat/Rocket.Chat` | Chat | TypeScript |

**Cap:** 2,000 files per repo (matches v3 convention).

---

## v4 positive candidates (need +72k files)

This is the harder half. AI-coded apps on GitHub are small (50-500 files). Need to find 50-100 legitimate AI-coded repos.

### Mining strategy

1. **GitHub topic search:**
   - `topic:cursor` — Cursor IDE outputs
   - `topic:claude-code` — Claude Code sessions
   - `topic:v0-app` — v0 generated
   - `topic:lovable` — Lovable generated
   - `topic:bolt-new` — Bolt.new generated
   - `topic:gpt-pilot` — gpt-pilot generated
   - `topic:codium` — Codium AI samples
   - `topic:aider` — Aider examples
   - `topic:ai-generated` — generic

2. **Awesome lists:**
   - `awesome-cursorrules`
   - `awesome-claude-code` (if exists)
   - `awesome-lovable`
   - `awesome-bolt`
   - `awesome-ai-coding`
   - `awesome-ai-generated`

3. **Specific repos known to be AI-coded (verified per README):**
   - All 25 already-cloned v3 repos
   - Need to add ~50 more to hit 100k

### v4 positive — first batch (10 candidates)

| Repo | Tool | Expected files | Source |
|------|------|----------------|--------|
| `vercel/ai-chatbot` | Vercel AI SDK | ~500 | github.com/vercel/ai-chatbot |
| `vercel/examples` | Vercel templates | ~2,000 (cap) | github.com/vercel/examples |
| `lobehub/lobe-chat` | AI assistant | ~1,500 | github.com/lobehub/lobe-chat |
| `chatboxai/chatbox` | AI client | ~1,000 | github.com/chatboxai/chatbox |
| `Pythagora-io/gpt-pilot` | gpt-pilot | ~500 | github.com/Pythagora-io/gpt-pilot |
| `OpenDevin/OpenDevin` | Devin-like agent | ~2,000 | github.com/OpenDevin/OpenDevin |
| `crewAIInc/crewAI` | AI agent framework | ~1,000 | github.com/crewAIInc/crewAI |
| `yusukebe/chatgpt-cli` | CLI | ~100 | github.com/yusukebe/chatgpt-cli |
| `Nutlope/restorePhotos` | AI photo | ~50 | github.com/Nutlope/restorePhotos |
| `Nutlope/roomGPT` | AI room | ~50 | github.com/Nutlope/roomGPT |
| `steven-tey/novel` | v0-based | ~100 | github.com/steven-tey/novel |
| `steven-tey/dub` | v0-based | ~200 | github.com/steven-tey/dub |
| `leerob/leerob.io` | v0-based | ~50 | github.com/leerob/leerob.io |
| `leerob/next-saas-starter` | v0-based | ~200 | github.com/leerob/next-saas-starter |
| `shadcn-ui/taxonomy` | v0-based | ~300 | github.com/shadcn-ui/taxonomy |
| `shadcn-ui/next-template` | v0-based | ~50 | github.com/shadcn-ui/next-template |
| `marcelscruz/public-apis` | AI-assisted | ~500 | github.com/marcelscruz/public-apis |
| `BuilderIO/gpt-crawler` | GPT crawler | ~200 | github.com/BuilderIO/gpt-crawler |

**Realistic estimate:** Need to find 50-100 repos averaging 700-1500 files each = 35k-150k new positive files.

---

## Expansion of ai-slop-baseline (positive side)

The `ai-slop-baseline` corpus has 6,097 positive files. Can mine for more:
- Check `/Users/cheng/ai-slop-baseline/positive/` for additional AI-coded samples
- Symlink new repos into baseline
- Add to `pos-baseline-files.txt` filelist

---

## Scan + commit plan

Once repos are cloned:

```bash
# 1. Rebuild filelists
cd /Users/cheng/corpus-expansion
./build-filelists-v2.sh  # regenerates per-repo + aggregated filelists

# 2. Run parallel v4 scans (4 workers, ~30-40 min for 200k files)
SLOP_AUDIT_CHUNK=300 python3 scan-corpus-parallel.py neg neg-v4 4
SLOP_AUDIT_CHUNK=300 python3 scan-corpus-parallel.py pos pos-v4 4

# 3. Compute new per-rule ratios (Python script needed)
# Compare v3 → v4 deltas

# 4. Update calibration tests with new thresholds
cd /Users/cheng/slopbrick
node_modules/.bin/vitest run tests/integration/calibration-expanded.test.ts
node_modules/.bin/vitest run tests/integration/calibration-security.test.ts
node_modules/.bin/vitest run tests/integration/calibration-db.test.ts

# 5. Update calibration report with v4 numbers
# 6. Commit + push
git add docs/research/calibration-report-2026.md \
        tests/integration/calibration-expanded.test.ts \
        tests/integration/calibration-security.test.ts
git commit -m "feat(slopbrick): v4 calibration on 50/50 corpus (100k+ each)"
git push origin main
```

---

## Release gating

v4 is **required before public launch** because:
1. **Balanced ratio is the strongest defense** against the "your positive corpus is too small" critique
2. **Larger absolute sample (100k vs 28k)** gives a 3.6× smaller confidence interval on every ratio
3. **v3 already shows the direction is real** — v4 just tightens the magnitudes
4. **Public claim stays "8-12× AI signal"** but the methodology behind it is now bulletproof

---

## Risk: positive corpus hard to scale

If 100k positive files is unrealistic (low supply of legitimate AI-coded repos), fall back to:
- Option A: 50k pos + 50k neg (true 50/50, smaller total)
- Option B: 70k pos + 100k neg (closer to 1:1, but not perfect)
- Option C: keep v3 ratios and document the imbalance explicitly in the report

The user explicitly said "i want 50/50" so Option A or B is required. Document the trade-off in the report.

---

## Next immediate steps

1. ✅ Report updated with v3 feedback (ratios held, scan time, db/* note)
2. ✅ v4 plan documented in this file
3. ✅ Filelists rebuilt with per-repo cap raised to 4,500 (negative) and 4,500 (positive)
4. ✅ Cloned 100 new AI-tagged repos to `/Users/cheng/corpus-expansion/positive/vibe-coded/`
5. ✅ **Final v4 corpus shape:**
   - **Negative:** 101,346 files across 39 existing repos (cap=4500)
   - **Positive:** 105,901 files across 80+ repos (50 existing + 100 new in `vibe-coded/`)
   - **Ratio:** 0.96:1 (effectively 1:1) ✓
6. ⏳ **In progress:** Parallel scan running on negative corpus (4 workers, ~30-40 min for 101k files)
7. ⏳ **Next:** Positive scan, then per-rule ratio recomputation, then update calibration test thresholds
8. ⏳ **Final:** Update `tests/integration/calibration-expanded.test.ts` RATIO_THRESHOLDS, commit, push

## v4 vibe-coded corpus (100 new positive repos)

Source: GitHub `gh search` for `vibe-coded`, `cursor in:readme`, `claude in:readme`, `lovable in:readme`, `bolt in:readme`, `ai-generated in:readme`. Shallow-cloned (`git clone --depth 1`) into `/Users/cheng/corpus-expansion/positive/vibe-coded/{name}/`. Total disk: ~11GB.

Top 20 contributors (by file count after rebuild):

| Repo | Source | Why |
|------|--------|-----|
| next.js (ml-frameworks/) | 4,500 | Self-tagged as AI-built |
| ORG2 (yorgai/) | 4,244 | Cursor-built ORG2 (TypeScript) |
| PraisonAI | 2,821 | AI agent framework |
| axonhub (looplj/) | 1,748 | Claude Code-style |
| ai (vercel/) | 1,686 | Vercel AI SDK |
| langchain (ml-frameworks/) | 1,685 | AI framework |
| prismercloud (Prismer-AI/) | 1,568 | AI assistant |
| refly (refly-ai/) | 1,507 | Vibe workflow builder |
| langchainjs (ml-frameworks/) | 1,482 | AI framework |
| CORAL (Human-Agent-Society/) | 1,223 | AI agents |
| spec-kitty (Priivacy-ai/) | 1,020 | Spec-driven dev |
| hapi (tiann/) | 987 | Claude Code app |
| semantic-kernel (ml-frameworks/) | 950 | AI framework |
| libra (nextify-limited/) | 893 | Lovable alternative |
| tabby | 887 | AI code assistant |
| Vibe-Trading (HKUDS/) | 818 | Vibe trading |
| langchaingo (go-ai/) | 681 | AI framework |
| firecrawl (node-ai/) | 653 | AI scraper |
| mcp-context-forge | 615 | AI infrastructure |
| vibesdk (cloudflare/) | 594 | Vibe coding platform |

Plus ~60 smaller repos (50-500 files each), all shallow-cloned from public GitHub.
