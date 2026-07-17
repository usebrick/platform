# GTM-001 — Validate the vibecoder scan-to-rescan loop

- **Status:** `ready`
- **Priority:** 3
- **Track / lane:** company / adoption
- **Owner:** usebrick product
- **Updated:** 2026-07-17

## Outcome

Observe five vibecoders run the local scan, understand a useful finding, make a
change, and rescan, then decide which trust and UX problem most limits
activation.

## Current truth

Vibecoders are the intended entry point. The consent-safe protocol and blank
outcome template now exist at `docs/research/vibecoder-pilots.md`; no pilot is
scheduled or completed, so there is no behavioral evidence or CI-interest
signal yet.

## Scope

- Recruit five people using AI-assisted frontend/application workflows.
- Use a consent-safe template with no source collection by default.
- Record time to install, completed/incomplete scan, first useful finding,
  confusing/noisy finding, fix attempt, rescan, abandonment, and CI interest.
- Synthesize patterns after all five sessions without turning anecdotes into
  detector calibration labels.

## Non-goals

- A statistically representative market study, paid acquisition campaign, or
  enterprise sales motion.
- Uploading private source, recordings, repository identifiers, or findings
  without explicit consent.
- Promising roadmap features during recruitment.

## Dependencies

- `requires`: none
- `benefitsFrom`: `SB-045`

## Acceptance criteria

- Five completed sessions use the same outcome fields.
- Each session records whether the user reached a useful evidenced finding and
  a fix/rescan.
- Failures distinguish install, discovery, runtime, trust, explanation,
  remediation, and rescan causes.
- The synthesis identifies the top three product changes and evidence behind
  each, plus whether anyone would enable new-debt-only CI.
- Private code and identity are absent unless separately consented and needed.

## Execution steps

1. Create the pilot protocol, consent boundary, and outcome template ->
   complete; verify:
   `test -f docs/research/vibecoder-pilots.md`.
2. Recruit 10–15 candidates to complete five sessions -> verify: five scheduled
   rows exist without private repository data.
3. Observe the scan-to-rescan loop and record structured outcomes -> verify:
   five completed outcome rows.
4. Synthesize the top three activation changes and CI-interest signal ->
   verify: every recommendation cites at least two session observations or is
   explicitly marked a hypothesis.

## Verification

Review the final record for five completed sessions, consistent fields, no raw
source, and no unsupported claims.

## Evidence destination

`docs/research/vibecoder-pilots.md`

## Rollback

Withdraw or anonymize any participant record on request. Product code is not
changed by this plan.

## Next action

Recruit the first five pilots using the consent-safe outcome template before
the first scan. Do not record participant data until consent is explicit.
