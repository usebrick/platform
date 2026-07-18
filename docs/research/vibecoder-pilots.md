# Vibecoder pilot protocol

**Status:** parked template — 0 sessions scheduled, 0 completed; recruitment not authorized
**Owner:** usebrick product
**Plan:** [`GTM-001`](../execution/plans/GTM-001-vibecoder-pilots.md)
**Updated:** 2026-07-18

## Reason for existence

Preserve one consent-safe protocol for a possible future, separately authorized
external-participant study. This file is dormant reference material and a
blank outcome template; it is not evidence that pilots occurred and must never
be populated from owner-only, synthetic, inferred, or invented sessions.

## Parked authorization boundary

No participant recruitment, scheduling, consent collection, or data recording
is authorized. The repository owner is the only current product tester, and
owner-run scan-to-rescan evidence belongs in `VAL-001`, not this file. A future
external study requires a new owner-approved execution revision that defines
its purpose and scale before anyone is contacted.

## Study question

If a future external study is authorized: can a vibecoder install SlopBrick,
understand one useful evidenced finding, make a change, and rescan without
needing hosted access or source upload?

The study observes activation and trust. It does not produce AI/human labels,
calibration data, or claims about detector precision.

## Non-negotiable boundaries

- Never collect source code, repository paths, repository names, commit hashes,
  remote URLs, screenshots, recordings, or raw scanner output by default.
- Never collect a participant name, email, handle, employer, or identity in
  the outcome table. The organizer keeps scheduling contact separately, if
  needed, and does not link it to a session ID here.
- Never send source, findings, telemetry, or transcripts to Usebrick as part
  of this study. The participant runs the local CLI; outbound reporting stays
  opt-in and separate.
- Never convert a participant's AI-assisted workflow, finding, or opinion into
  a calibration label or authorship claim.
- A participant may skip any prompt, withdraw at any time, or request deletion
  of their row without justification.
- Record only bounded categories and short paraphrases. If a note contains
  source or identity, delete the note before saving this file.

## Dormant recruitment boundary

No candidates may be recruited under the current plan. If a future revision
authorizes recruitment, each candidate must:

1. use an AI-assisted frontend or application development workflow;
2. be able to run a local Node.js CLI on a repository they control; and
3. consent to recording the fields below without sharing private code.

Do not promise features, roadmap dates, detector accuracy, or a release date.
The invitation must say that the session evaluates the workflow, not the
participant or their code.

### Short consent script

> This session tests whether a local scan helps you find, understand, fix, and
> recheck one repository problem. We will record only bounded workflow
> outcomes such as install success, scan completion, comprehension, fix/rescan
> progress, and CI interest. We will not collect your code, repository
> identity, raw output, recording, or screenshot by default. You may skip any
> step or withdraw and request deletion at any time.

Record `consent = yes` only after the participant agrees. A declined or
withdrawn session is not a completed pilot.

## Session procedure

Only after a future authorization, use the same sequence for every participant.

1. Confirm consent and explain that no source or identity will be recorded.
2. Ask the participant to install or invoke the documented local package.
3. Ask them to scan a repository they control without sharing its identity.
4. Ask them to choose the first finding they would act on and explain why.
5. Ask them to make one change using their normal workflow.
6. Ask them to rescan and describe whether the change was reflected.
7. Ask whether they would enable a new-debt-only CI check, and why.
8. Assign only a pseudonymous session ID after consent.
9. Record the bounded row fields below; do not paste terminal output.

Use outcome categories rather than raw explanations:

- install: `success`, `partial`, `failed`
- scan: `complete`, `incomplete`, `failed`
- first finding: `useful`, `not-useful`, `none`
- trust issue: `none`, `noise`, `unclear-evidence`, `privacy-concern`,
  `other-bounded`
- fix: `attempted`, `not-attempted`, `blocked`
- rescan: `confirmed-change`, `no-change`, `not-reached`, `failed`
- abandonment: `none`, `install`, `discovery`, `runtime`, `trust`,
  `explanation`, `remediation`, `rescan`, `other-bounded`
- CI interest: `yes`, `no`, `unclear`

## Outcome template

One row may be created only after future authorization and consent. The empty
table is not a participant record.

| Session | Consent | Status | Install | Scan | First finding | Trust issue | Fix | Rescan | Abandonment | CI interest | Bounded note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

`Bounded note` is limited to one sentence without source, identity, path,
verbatim output, or unsupported inference. Examples: “Could not tell why the
finding applied” and “Asked whether the result would block a pull request.”

### Field rules

- `Status` is one of `unscheduled`, `scheduled`, `completed`, `withdrawn`, or
  `incomplete`.
- A row is `completed` only when it records a scan outcome, first-finding
  comprehension, fix attempt, and rescan outcome.
- `Abandonment` is `none` for a completed session. If a participant stops,
  record the first blocking stage only.
- `CI interest` records stated intent, not adoption or willingness to pay.
- A session may be counted in synthesis only once and only if its consent is
  `yes`.

## Synthesis rules

If a future authorized study produces completed rows:

1. Count install, scan, useful-finding, fix, rescan, abandonment, and CI
   outcomes from this table only.
2. Identify the top three activation changes. Each recommendation must cite at
   least two session IDs; otherwise label it `hypothesis`.
3. Separate observed workflow friction from product ideas and from detector
   quality claims.
4. Report CI interest as a bounded signal (`yes`/`no`/`unclear`), never as a
   market-size or demand claim.
5. Remove or anonymize any row on request before sharing the synthesis.

## Verification and next step

The protocol is ready only when the file exists and contains the consent,
boundary, outcome, synthesis, and verification sections:

```sh
test -f docs/research/vibecoder-pilots.md
rg -n '^## (Reason for existence|Non-negotiable boundaries|Outcome template|Synthesis rules|Verification and next step)$' docs/research/vibecoder-pilots.md
```

Next step: preserve this parked template. Do not contact, schedule, or record a
participant unless the repository owner first authorizes a new external-study
execution revision; owner-only testing remains in `VAL-001`.
