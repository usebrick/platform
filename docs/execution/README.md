# Usebrick execution control plane

This directory turns the product direction in [`ROADMAP.md`](../../ROADMAP.md)
into a small, schedulable portfolio.

## Authority

| File | Owns | Does not own |
| --- | --- | --- |
| [`ROADMAP.md`](../../ROADMAP.md) | Product thesis, sequence, and decision gates | Live task status or historical proof |
| [`index.json`](index.json) | Plan status, priority, dependencies, next actions, and WIP | Product strategy or mutable evidence counts |
| [`STATUS.md`](STATUS.md) | Human-readable snapshot of the index and dated verified facts | Scheduling authority |
| [`plans/`](plans/) | Bounded implementation contracts | Historical diaries or broad strategy |
| [`CHANGELOG.md`](CHANGELOG.md) | Append-only planning revisions and transitions | Product release notes |
| [`../archive/`](../archive/) | Recoverable superseded narratives | Current instructions |

Frozen specifications define contracts. Evidence documents prove results.
Neither changes plan status by itself.

## Status model

Plans use `draft`, `ready`, `in_progress`, `waiting_external`, `done`,
`parked`, `superseded`, or `cancelled`. The portfolio uses `advancing`,
`at_risk`, or `paused`. `blocked` is deliberately not a status.

Only `requires` dependencies prevent scheduling. `benefitsFrom` does not.
An external wait belongs to one plan and must identify an exact input, owner,
resume condition, safe recheck, and parallel-safe work.

## WIP and scheduler

At most two implementation plans and one company plan may be `in_progress`.
Choose the lowest-numbered `ready` plan whose `requires` plans are done and
which does not conflict with active work.

If a method fails or evidence is unavailable:

1. preserve the failure and the last verified state;
2. do not invent evidence or weaken an acceptance criterion;
3. reduce, replace, or quarantine the invalid path;
4. continue the highest-priority independent ready plan; and
5. record the plan change in `index.json`, `STATUS.md`, and `CHANGELOG.md`.

## Updating a plan

1. Edit the bounded plan and its entry in `index.json`.
2. Keep `STATUS.md` statuses identical to the index.
3. Increment `index.json#revision` for a planning transition.
4. Append the matching revision to `CHANGELOG.md`.
5. Run JSON parsing, plan validation when available, link checks, and
   `git diff --check`.

Publication, deployment, repository pushes, corpus deletion, and remote
mutations always retain their separate authorization gates.
