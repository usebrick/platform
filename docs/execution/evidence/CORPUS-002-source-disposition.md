# CORPUS-002 source-use routing receipt

**Recorded:** 2026-07-18
**Disposition:** complete

## Reason for existence

This receipt preserves the reviewed source-use dispositions, frozen Corpus v1
artifact identities, and exact verification results that completed CORPUS-002.
It prevents a permitted internal calibration use from being misread later as
witnessed authorship, redistribution approval, v10.3 gold admission, product
usefulness evidence, or authorization to change rule state.

## Source routing

| Source | Authority | Integrity | Rights | Permitted executable use |
| --- | --- | --- | --- | --- |
| Mendeley HumanVSAI v1 | `publisher_attested` | `verified` | `internal_analysis` | `origin_measurement`, `calibration_evaluation` |
| FormAI v1 bounded projection | `repo_self_attested` | `pending` | `internal_analysis` | none |
| OSSForge HumanVsAICode | `publisher_attested` | `pending` | `reference_only` | none |
| Controlled HumanEval GPT-5 | `witnessed` | `pending` | `reference_only` | none |

Pending, quarantined, and reference-only sources fail closed before executable
corpus use. The routing contract does not modify candidate rows or receipts.

## Frozen artifact preservation

| Artifact | SHA-256 |
| --- | --- |
| CAL-001 protocol | `d78ceb22bd2d3a2bc91676d93facd7003af6c1b8351fdf773139a138bd1f1528` |
| Candidate manifest | `c15d3cbc95f251b5a0514da14b3f8a90e26124fbfb7db5ce342a873635b383ac` |
| Leakage plan | `9c4638526e9a4161d3e74f70197f0b25717439e6bd477bef98664a03c9a9219c` |
| Source-binding receipt | `47bd66907ec2efa67da718e0cfb38458151ca84d3cdedc941488fe4b001475ac` |
| Eligible manifest | `286134799c7f75837a7c292f0d18721d8da9263c25c041eef0ac4734801b52d8` |
| Eligible receipt | `9f5274f57ed4adf9d1c1ef55205493e9a833abc86cb8e1ca2b332cd8c72d28ba` |
| Smoke manifest | `bdbcd43279077fa760ae3c99da05b953c38134022fa34626b69a6b6400be00de` |
| Smoke receipt | `ccd74f7b9db49adc802c042df0d7b732d8284d2bbfc4e6ec39e6a1c001c60830` |

The portable focused run passed 10 test files and 57 tests, with 6 real-source
tests skipped by their explicit opt-in boundary. The opt-in run against
`/Users/cheng/corpus-expansion/v10.3` passed 6 test files and 41 tests. It
reproduced all eight frozen hashes above through read-only source checks; no
source byte was acquired, written, or mutated.

## Verification

| Command or gate | Observed result |
| --- | --- |
| Portable focused Corpus v1 command | exit 0; 10 files passed; 57 tests passed; 6 tests skipped |
| Opt-in real-source Corpus v1 command | exit 0; 6 files passed; 41 tests passed |
| `corepack pnpm plans:validate` before closeout | exit 0; 15 plans; implementation 1/2; company 0/1 |
| `corepack pnpm plans:validate` after closeout | exit 0; 15 plans; implementation 0/2; company 0/1 |
| `corepack pnpm -r lint` | exit 0 |
| `corepack pnpm -r typecheck` | exit 0; Core, Website, Engine, and SlopBrick passed |
| `corepack pnpm -r test` | exit 0; Core 285, Website 47, Engine 60, and SlopBrick 3,844 tests passed; SlopBrick retained 15 opt-in skips |
| `corepack pnpm -r build` | exit 0; all four built packages passed |
| `git diff --check` before closeout | exit 0 |
| `git diff --check` after closeout | exit 0 |

The build emitted only the existing non-fatal Zod declaration-bundling
warnings. No tracked generated-file drift remained after the build.

No source acquisition, redistribution, rule-state change, participant
research, publish, deploy, tag, push, or remote mutation occurred in this
slice.
