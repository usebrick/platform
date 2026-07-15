# Task 2B authority-publication planner review

**Review date:** 2026-07-15  
**Reviewed head:** `b27ab684f`; the root follow-up hardening is recorded in
`5feb27aff` and re-ran the focused suite.  
**Verdict:** APPROVE for the bounded planner slice; no P0/P1 findings.

## Review evidence

An independent reviewer ran the focused planner suite (**6/6**), the Core
authority-rebuild contract suite (**6/6**), and SlopBrick typecheck. The review
found a P1 in the first planner correction: caller-selected recovery nonces
changed lock bytes but not transaction IDs or staging paths. Commit `b27ab684f`
bound the nonce into a transaction-identity digest and added a regression test.
The final commit `5feb27aff` further keeps the full SHA-256 identity suffix and
rejects self-aliased prior/current input and static generations.

The planner remains pure and caller-selected; it does not discover or publish
authority and cannot make the external census ready. Filesystem descriptor
identity/TOCTOU, publication ordering, recovery, CLI, static/witness/resource
authority, corpus admission, and release gates remain downstream work.

## Remaining non-blocking follow-ups

The planner's path contract will need to be consumed by a descriptor-safe
publisher/recovery implementation. That implementation must bind the loaded
prior static/current graph to the explicit parent CAS and preserve unknown
files/generations; it must not infer parent authority from generation numbers.
