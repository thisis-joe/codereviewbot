# CodeReviewBot implementation contract

Accepted: 2026-10-19. Base: `9cc45cf1c7777c6e4f3a391dbfa8b58eeb3cd7ca`.

Implement the accepted conversation plan: GitHub PR/GitLab MR review on this Mac mini,
Colima/Compose, Cloudflare Tunnel at codereviewbot.thisis-joe.com, n8n orchestration,
PostgreSQL durable work, isolated Codex CLI. Debounce 30s, latest snapshot only,
one review at a time, 10 minute review budget. No automatic commits/approvals/merges.

## Required behavior

1. Versioned strict JSON and deterministic Korean report/inline/answer templates.
   Format v2 (user revision): compact metadata and four sections: summary, findings,
   checks/caveats, change-understanding questions. No successful verdict for partial/failed work.
   Remove duplicate change tables, empty diagrams/lists and long audit inventories from output.
   Generate 3–10 varied questions about the actual diff, independently check them, validate
   unique text and real diff/source anchors, and publish questions without answers.
   Failed/in-progress/legacy reports show an explicit unavailable message, never fabricated
   questions. Upgrade question-less legacy caches while retaining the same summary marker.
   Pure renames may use readable source anchors. Changes without any usable text source
   return an explicit partial/unavailable result, preserve unresolved findings, and do not
   retry inference solely to invent three questions. Preserve skipped/neutral CI disclosures.
2. Signed webhook admission and repository allowlist, durable inbox, debounce and
   leased work; normalize PR/MR and comment/CI events. Confirm live head before writes.
3. Exact-snapshot code and context collection, base-branch policy, two-pass Codex
   review, validated lines/evidence, single-location suggestions, CI evidence and
   source-linked issue requirements. No execution of repository scripts or tests.
4. Incremental review plus affected context, full fallback on changed ancestry/base,
   persistent finding IDs/statuses and deduplicated side effects after unknown outcomes.
5. Authorized review/full/pause/resume/explain/dismiss commands and threaded questions;
   feedback records with explicit maintainer approval before policy learning.
6. Runnable Compose, n8n workflows, setup/operations documentation, recovery,
   fixtures/evaluation, meaningful unit + real PostgreSQL/HTTP/CLI-boundary integration tests.
7. Interactive technical learning: revision-bound Q IDs; 3–10 optional multiple-choice
   or open-ended questions, answer grading with correct/partial/incorrect/unverifiable
   results, problem explanations and every option explained. Confirm real source evidence
   before a conclusive grade; accept reasonable design alternatives. Natural replies in
   one-question owned threads, explicit Q ID in ambiguous threads. `더 알아보자` and
   `/reviewbot questions` generate 3–10 deeper questions tied to this change, excluding
   prior questions. Same-ref report history and persisted extra batches survive replacement
   and failed full reviews. Five extra requests per target/ref triple, two-minute calls,
   bounded prompts/comments with honest compaction or an unavailable notice.
   Save immutable command responses under the job lease before writes. Reconcile owned
   surface-qualified markers on unknown outcomes. Preserve native reply roots/discussions;
   GitHub general comments use a linked new comment. No live integration activation.

## Work units and verification

| ID | Feature branch | Acceptance |
|---|---|---|
| 1 | codex/output-contract | fixed shapes, escaping, verdicts, schema and report tests |
| 2 | codex/platform-adapters | webhook auth, exact refs, provider HTTP fixtures, checks/permissions |
| 3 | codex/review-engine | isolated snapshots, two passes, evidence/diff validation, incremental state |
| 4 | codex/durable-workflows | PostgreSQL leases, replay-safe publishing, commands, n8n HTTP end-to-end |
| 5 | codex/local-operations | images, Compose, setup, docs, real DB integration and final review |
| 6 | codex/interactive-learning | question IDs, technical follow-ups, grading, history, thread/retry and bounded input/output checks |

Each branch builds on the preceding feature branch. Work-unit commits stay separate;
do not merge or push main. Tests: `npm test`, `npm run test:integration`, Compose config/build
and disposable local service verification. Live platform and account-auth checks require
operator-provided credentials; record unavailable checks honestly.

## Decisions

- Ruling: use feature-named branches without Jira numbers: no Jira task exists in this
  new repository and the user's instruction requires feature branches, not invented tickets.
- Ruling: use the existing clean checkout on feature branches; do not create another
  managed checkout or interrupt other Colima stacks.
- Threat boundaries: external webhooks, repository text/config, model JSON and CI logs
  are untrusted. Git credentials live only in the controller; runner has dedicated Codex
  state and no Docker socket or host home. Base policy cannot change runtime privileges.
- Existing CI is evidence, not a claim of locally executed tests. Missing CI is explicit.
- Whole-branch independent review happens after all implementation units, before completion.
