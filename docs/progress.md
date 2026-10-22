# Implementation ledger — docs/plan.md

- Started on 2026-10-19 from clean main, base 9cc45cf.
- Preflight: unit 1 schemas are consumed by adapters/engine/renderer; the model owns
  analysis content only, the controller owns run status, IDs, SHA, policy and side effects.
- Preflight: provider snapshots must keep native diff references for comment positioning;
  the engine must never reconstruct GitLab start/base/head refs from branch names.
- Preflight: all posting steps must reconcile platform state after an unknown response;
  database completion alone cannot guarantee external exactly-once behavior.
- Implementation and local verification completed; external account/webhook setup deferred.
- Unit 1: implemented strict model JSON schemas and fixed Korean templates. Initial
  missing-module RED observed; `npm test` GREEN, 5 tests (schema, fixed sections,
  unsafe markup, incomplete verdict, native suggestion/answer shape).
- Unit 2: original-byte GitHub HMAC / timestamped GitLab signing (explicit legacy mode),
  event normalization, paginated APIs, GitHub App/PAT credentials, native diff refs,
  permission checks, check evidence and issue retrieval implemented. `npm test`: 9 pass.
- Ruling: a provider fixture initially returned an unrelated web host; corrected the
  fixture after confirming origin validation was correctly refusing it.
- Unit 3: bounded Git snapshot export, base policy, contextual two-pass review,
  real diff/evidence validation, conservative finding lifecycle and isolated subprocess
  adapter implemented. Real local Git and subprocess boundary tests pass; no model
  inference claimed by fixture tests. A live account check remains pending setup.
- Unit 4: PostgreSQL durable admission, single global lease, restart fencing, debounced
  work, marker-based publication reconciliation, authorized commands and approved-only
  repository learning connected to HTTP ingress/controller/runner. Real PostgreSQL and
  signed-HTTP-to-publication integration passes (external model/provider responses are fixtures).
- Ruling: disable Codex shell and unrelated tools, expose only a bounded read-only MCP
  source server. This makes repository script execution unavailable rather than relying
  only on prompting. Pinned MCP 1.32.1 maintenance SDK remains security-supported and
  is covered by a real stdio handshake/tool test.
- Ruling: deleted code uses LEFT-side native refs; incremental selection uses canonical
  full-PR hunks for comment positioning. Historical findings retain their observed SHA.
- Unit 5: separate least-privilege Compose services, disabled repository examples,
  idempotent private setup, n8n workflow generation/import/publish, local smoke script,
  CI, demo and connection/operations guides implemented. Both container images built;
  real n8n 2.43.8 import/publish and authenticated dispatch to the controller passed.
  Baseline: 23 unit + 3 PostgreSQL integration tests passed, production npm audit clean.
- User steering: external GitHub/GitLab/Codex account authentication and Cloudflare
  connection are deferred. No personal auth copied, remote webhook, DNS or tunnel activated.
- Final independent review in progress; regression cases first reproduced for semantic
  coverage, full-PR rename mappings, oversized output, stale dismissal and in-flight CI.
- Final review: fixed sensitive old-path rename export, queued CI refresh, GitLab dual
  context coordinates, GitHub Maintain roles, stable IDs across renames and stale answers.
  Independent reviewer revalidated all six fixes with no remaining blockers in offline scope.
- Final verification: 30 unit tests and 4 real PostgreSQL integration tests passed;
  both final images built, real n8n import/publish and authenticated dispatch passed.
  A real temporary-Git test covers multi-rename, reused filenames and sensitive old paths.
  Production npm audit reported 0 vulnerabilities. Generated workflows reproduce cleanly.
- Environment finding: the 20 GiB Colima disk filled during a repeated image build.
  Stopped only this stack and removed its confirmed old build cache, then final build,
  PostgreSQL integration and n8n smoke passed. No other project's resources were pruned.
  Connection-time setup must check VM disk capacity; local services are stopped afterward.
- Removed npm's installation cache from the runner image and rebuilt it successfully;
  reclaimed only confirmed project cache records. VM disk still needs capacity planning
  before live operation; the host disk and Colima VM disk are separate capacities.
- Deferred evidence: live Codex inference quality, real GitHub/GitLab permissions/comment
  rendering, DNS/tunnel and external webhook delivery. No successful live review claimed.
- User revision: concise four-section format and 3–10 questions to help the developer
  understand this change, including essential behavior, design choices, edge cases and
  relevant technical learning/interview prompts. No generic filler or automatic answers.
- Branch codex/concise-review-questions from 1e40353; initially clean. Existing no-Jira
  feature-branch ruling still applies. Keep external connections and services deferred.
- Observed RED for old six-section rendering, missing question count/schema constraints
  and legacy same-SHA caching. Implemented schema + two-pass question generation,
  source/diff and duplicate validation, compact rendering, legacy refresh and failure clearing.
- Independent review found no-anchor changes, escape-expanded comment budgets and hidden
  skipped-CI details. Added failing regressions, source anchors for pure renames, explicit
  partial/no-source results with reusable status, bounded escaped output, and skipped/neutral
  provider statuses plus concise CI details. Final independent revalidation found no
  remaining P1/P2 blockers; combined schema-max/Unicode/escaping output fits 28,285
  characters with all three complete questions and code URLs preserved.
- Revision completed in 6ee8d0f on codex/concise-review-questions. Final verification:
  40 unit tests, 4 real PostgreSQL/HTTP integration tests and git diff --check passed;
  demo regenerated. No account/model connection or service activation; Docker images
  must be rebuilt from this source before the later live connection step.
- Interactive-learning scope: user requested answer grading/problem or per-option explanations,
  then `더 알아보자` to request further questions for technical learning about this change.
  Branch codex/interactive-learning from 49b52447e3a4c3f829af093124a7494a2e434263; initially clean.
  Existing no-Jira feature-branch ruling applies. Account/auth/tunnel activation remains deferred.
- RED reproduced missing trigger/answer commands, choice constraints, revision-bound IDs,
  question/grade runner schemas and durable command storage; implemented bounded contracts,
  read-only source-grounded learning phases, native replies and immutable response-before-write.
- Real PostgreSQL plus signed HTTP test exercises duplicate delivery, an accepted remote
  write whose response is lost, controller restart, grade of a persisted extra question,
  stale revision rejection and bot-loop exclusion. Boundaries use provider/model fixtures.
- Fresh independent review identified reply ancestry, failed/replaced same-ref report history,
  oversized accumulated prompts and GitHub numeric comment namespaces. Regression tests first
  reproduced each gap; fixes preserve same-ref question history, namespace events/comments,
  resolve root/child/discussion identity and bound prompts without dropping prior question text.
  Malformed commands show usage; learner answers retain the full admitted 8,000-character body.
- Final re-review found the near-60k reply-link boundary; reproduced a valid 59,988-character
  grade whose request link overflowed, reserved caller headroom and passed the regression.
  Independent revalidation reports no remaining P1/P2 blockers in offline scope.
- Final interactive-learning verification: 63 unit tests, 7 real PostgreSQL/HTTP integration
  tests, Compose validation, demo and diff checks passed; dependency audit has 0 findings.
  Both images built; the final controller was rebuilt after the rendering-only fix. A real
  temporary runner container passed auth, questions/grade HTTP phases, isolated subprocess
  and strict-output schema checks with a fixture CLI. No actual model/account quality claimed.
- Colima's existing 20 GiB disk filled during image verification. Removed only the confirmed
  current build's private compile caches and CLI cache/new runner image after its smoke test;
  no other project images, caches, containers or volumes were removed. Final controller image
  retained, runner must be rebuilt after capacity planning before live connection. Services
  remain stopped. Disk was approximately 591 MiB free after final controller verification.
- Interactive-learning implementation completed in c9de00d on codex/interactive-learning.
  PR preparation targets a separate Draft PR based on codex/concise-review-questions
  (existing Draft PR #1). Publication of this new branch remains pending; no merge,
  live account/model connection, webhook/tunnel or service activation performed.
- Simplification (user decision, 2026-10-20): removed renderer-invisible report fields
  (`flow`, `changes`, `rules`, `delta`, candidate `ruleId`), unused `analysisJsonSchema`,
  `Snapshot.previousSha`, the unread `context.json` write and never-produced `running`/`paused`
  report states. Removed pre-deployment compatibility paths: question-less report upgrade,
  surface-less comment keys and additive `ALTER TABLE` statements. 63 unit and 7 real
  PostgreSQL/HTTP integration tests passed; demo regenerated.
- Readiness re-check (2026-10-20) found the folded migration regressed the existing local
  Compose database: its jobs table predates `command_result`, and a disposable copy confirmed
  the column stayed missing. Restored the idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`;
  the copy then gained the column, a repeated run was a no-op, and 63 unit plus 7 real
  PostgreSQL/HTTP integration tests passed. The original volume was mounted read-only.
- Answer merge gate (user decision, 2026-10-20): opt-in `requireAnswers` policy posts a
  `codereviewbot/questions` commit status (GitHub status API; GitLab commit status attached
  to the MR pipeline). Pending until every question visible in the published report has a
  published grade of any verdict; success when no question can exist; pending on failed
  reviews. Synced after publication, after graded answers and on each recovery pass, only
  when changed; gate errors never block publication. The bot's own status is excluded from
  CI results. 70 unit and 9 real PostgreSQL/HTTP integration tests passed. Live GitHub
  branch protection and GitLab "Pipelines must succeed" behaviour remain unverified.
- H1 (2026-10-21): `codex/command-help` from clean 2db8478 in the isolated
  `/Users/Joseph/.codex/worktrees/question-bot/codereviewbot` checkout; the original
  checkout's uncommitted changes were left untouched. Work-unit commit subject:
  `feat(commands): show full command reference only on help`.
  RED reproduced absent help parsing and verbose malformed-command replies; added a
  deterministic 13-command, four-column help response with marker reconciliation and
  no report/snapshot/workspace/model access. Reports, follow-up questions, grades and
  invalid answers now point to help without repeated command tables or examples.
  `npm test` passed 87 unit tests and `git diff --check` passed. Both signed GitHub/GitLab
  HTTP/PostgreSQL paused/no-report/reply-loss tests passed on the disposable database.
  The logged first-attempt failures are injected remote response loss. Independent review is
  delegated to the parent task before integration; no remote push or PR was created.

- Question-bot transition accepted 2026-10-21; base main `2db847897c9c291ce36999ef72e68d759bc9d6c5`.
  Original `/Users/Joseph/workspaces/codereviewbot` stays on main with pre-existing
  README/operations/application/controller/platform/render/learning-test changes and
  untracked compose.override.yaml + ack.test.mjs. Clean managed worktrees isolate
  `codex/command-help` and `codex/question-bot`; no original edits copied or staged.
- Q1 complete in `2c88e20`: additive 3–10 initial-question schema, Codex/Claude bounded
  real subprocess checks and authenticated runner HTTP contract; 9 focused tests passed
  on a staged-only clean snapshot. H1 cherry-picked as `18d68f8` from `7aea43e`.
- Q2: replaced automatic review+verification with one 120-second initial-question call,
  question-only comments and inline questions. Removed CI admission/polling and automatic
  findings. Retained archival findings, history, grading, supplementary batches and gates.
  Versioned same-SHA caches, legacy ready results/recovery, and generation-only estimates.
- RED observed missing generation API, old review output, CI admission and lost manual
  regeneration/full intent when same-head automatic events coalesce. GREEN after fixes.
  Independent H1 review found command examples in learn/dismiss/oversized fallback;
  replaced with help-only hints and added ordinary-command regression. Independent Q2
  review found queued intent loss; same-head coalescing now preserves regeneration/full
  intent. Revalidation found no remaining confirmed source/test defects.
- Current Q2/Q3 combined evidence: 92 unit tests and 31 real PostgreSQL integration
  tests passed, including 19 transition cases across GitHub/GitLab, real signed help
  HTTP, history/gate, queue/restart/ref fences and generation-time filtering.
  Provider/model network boundaries are fixtures; no live quality or latency claim.
- Q2 completed in `a087379` on `codex/question-bot` after independent source/test
  review and passing unit/integration suites. Q3 adds the dedicated 19-case real-DB
  transition harness: both-provider legacy same-SHA/ready/recovery/current-cache,
  command regeneration, pushes during generation/publication, timing separation and
  same-head review/full coalescing. All cases passed in the final 31-test integration run.
- Q3 completed in `ba50412`. Final failure-path audit reproduced loss of the opt-in
  answer gate on a first-ever failed generation (no previous report). Captured the
  prepared policy for the failure result; explicit false overrides old true, and an
  unavailable policy still falls back to previous state. A real-DB regression forces
  final-attempt failure, verifies the stored report and pending published gate.
  Independent delta review passed; full verification now 92 unit + 32 DB integration
  tests passed. This corrective work unit is separate from docs/demo updates.
- Failure-path correction completed in `7b1fc35`. Q4 documentation and fixture demo
  describe question-only comments, all 13 help entries, historical command behavior,
  version-2 upgrade/recovery, timing budgets and visible-question-only answer gates.
  Independent docs/demo review found only overly broad gate wording, now corrected.
  Demo generation, artifact shape/link assertions and local doc links passed.
- Final verification: 92 unit + 32 real PostgreSQL/signed-HTTP integration tests passed;
  `git diff --check` and Compose configuration passed. Both final controller/runner
  images built with task-specific verification tags. A disposable runner container
  passed HTTP auth, one bounded initial-question fixture CLI and invalid-count rejection;
  the controller image passed current schema/help contract checks. No actual model
  invoked. Production services, credentials, webhooks and original checkout unchanged.
- Q4 completed in `8d6006b`. Final source is integrated on `codex/question-bot`;
  the standalone help feature remains on `codex/command-help` at `7aea43e`.
  Temporary test PostgreSQL/runner containers and task-specific verification image
  tags were removed after verification; existing service containers/tags were not touched.
  Final hash comparison confirmed original main's tracked diff and both untracked
  user files unchanged. Live-model quality/latency sampling and production rollout
  remain unperformed; the completed implementation worktree is clean.

- Live validation/deployment authorized 2026-10-21; isolated release branch
  `codex/question-bot-live-validation` starts at `c0d70c7`, original main/diff hashes
  unchanged. Authenticated production provider observed as Claude Opus 5.5 from CLI
  modelUsage, with existing account/configuration and isolated baseline/candidate RPCs.
- Pre-release live source audit found an ambiguous correct option in a dataset-ignore
  question: a two-path question's choice could read as excluding only one path.
  Deployment held. Strengthened question instructions for complete scope, consistent
  explanations, quantified wording and explicit external-state assumptions, preserving
  the 3–10 question count, one model call and 120-second budget. Final live samples
  must be rerun on the corrected prompt; initial samples are diagnostic evidence only.
- Corrected prompt `79c6e57` passed five real-model runs (four distinct archived
  production refs, largest repeated), 28 questions audited against source/primary docs.
  Actual CLI modelUsage: claude-opus-5-5, Claude Code 2.1.290. Initial-generation
  median 69.777s, range 43.455–84.280s; one call each, no timeout/schema/source failures.
  Correct options now cover both ignore paths and explicitly state untracked-file
  assumptions. All 92 unit tests passed again; unchanged DB integration evidence reused.
  GO decision and limits recorded in docs/verification/question-bot-live-2026-10-21.json.
  No causal speedup percentage: the corrected candidate was a separate validation block.

- A1 (2026-10-21): user authorized organizing pending changes and integrating command
  acknowledgements + failure diagnostics into the question-bot branch. Reused the clean
  help worktree, branched `codex/command-acknowledgements` from `2db8478` with no Jira
  task (existing feature-name ruling). Original dirty files were saved in the question
  worktree's ignored `.local/pending-changes-backup` before splitting overlapping hunks.
- A1 contains only immediate permission-checked command notices, successful deletion,
  terminal-failure notices, native provider edit/delete helpers and their README/tests.
  Failure-cause logging is reserved for its own branch; Cloudflare override is excluded.
  RED: missing acknowledge API/terminal cleanup. GREEN: 90 unit + 10 real PostgreSQL
  integration tests, including signed HTTP/replay, native comment surfaces, foreign
  comment exclusion and duplicate platform views. `git diff --check` passed.
  Scoped author review covers the complete dirty/new source and tests; no fresh-context
  reviewer was used in this follow-up. No deployment or remote publication performed.

- L1 (2026-10-21): split pending failure-cause diagnostics into the independent
  `codex/failure-diagnostics` branch from `2db8478`. No acknowledgement code or local
  Cloudflare override included. Logs add work kind, retry attempt, classified schema/
  JSON failures and redacted bounded generic causes. Operations notes are preserved.
  RED reproduced absent cause/kind/attempt fields; GREEN: 88 unit tests, including
  generic, schema-field-only, JSON-input-suppression and credential/size regressions.
  Scoped author review + diff check passed; no independent reviewer used for this slice.

- Integration (2026-10-21): A1 `240eea9` and L1 `d05086d` remain independent feature
  branches from `2db8478`; cherry-picked with provenance as `0ec0556` and `d89a09a`
  onto `codex/question-bot` from `c0d70c7`. Resolved renderer imports and appended
  ledgers without restoring review behavior or losing question/gate failure handling.
- The previous question worktree switched externally to `codex/question-bot-live-validation`
  during preparation. Aborted our initial cherry-pick there, preserving that branch and
  source, and moved integration to `/Users/Joseph/.codex/worktrees/question-integration/codereviewbot`.
- Integration RED: help's old lost-reply fixture treated the new acknowledgement as its
  help response and lacked deletion support. Kept the accepted-but-lost help/restart
  checks, modeled notices separately, and now assert one notice for duplicate delivery,
  native thread identity and successful cleanup on both providers. Grading/gate fixture
  also verifies notice cleanup. GREEN: 102 unit + 32 real PostgreSQL integration tests.
  Author review covers committed feature changes plus both integration test updates;
  fresh-context review is unavailable in this follow-up (no subagents dispatched).
- I1 completed in `85167b5`; final 102 unit + 32 real PostgreSQL integration tests,
  Compose configuration, fixture demo and diff checks passed. Both final images built;
  built controller exercised immediate notice → full help → cleanup plus classified
  failure logs. Built runner exercised authenticated HTTP, bounded fixture generation
  and invalid-count rejection. No actual model/provider call or deployment performed.
- Original main's pending files matched the saved byte hashes before cleanup. Their
  functionality now exists in A1/L1 commits and the verified question-bot integration;
  only those known tracked changes were restored and the committed/split ack test was
  cleared from the original checkout. Main remains at `2db8478` with a clean status.
  Cloudflare override is byte-identical and ignored using local `info/exclude`; no
  Cloudflare file, token or local exclusion rule was added to a Git commit.
  Temporary test DB/container/image tags were removed; existing services and the
  separate live-validation branch were left alone. Integration worktree is clean.

- Release reconciliation: another user-authorized chat committed the original pending
  command acknowledgements and failure diagnostics, integrated them in `4f7e8e3`,
  and opened PR #8 while live validation was running. Integrated that branch into
  the isolated release branch to retain those runtime features. Original tracked
  patch and all eight source/test snapshots match their initial hashes; local
  Cloudflare override also matches. No original checkout files were restored/reset
  by this release task. Generation engine/provider/schema files are byte-identical
  to live-tested `79c6e57`; refreshed full suites pass 102 unit + 32 real-DB/HTTP tests.

- Production release `a32c053` deployed 2026-10-21 05:34:44 UTC (14:34 KST).
  Matching controller/runner images are healthy; PostgreSQL/n8n/tunnel container IDs
  unchanged. Production data counts remain jobs30/targets8/deliveries41/feedback0.
  Public webhook rejects invalid auth (401), accepts signed/configured auth (202)
  with zero jobs for an ignored event. Deployed help has 13 rows; ordinary output
  contains only questions/help hint; command receipt renderer retained.
- Runtime caveat: first additional integrated-production model canary reached the
  existing 120s process budget. Runner released busy state normally. Same-input
  manual retry completed in 41.858s with five questions; all keys/options/explanations
  audited against source and passed. Cause not established; no generation/provider
  code or endpoint drift found. This failure is recorded separately from the five
  successful pre-release trials, not removed from reliability evidence. Existing
  job retry/final-failure/gate behavior is covered by the refreshed integration suite.
  Earlier production canary on `79c6e57` passed in 40.546s with five audited questions.
- Application rollback images and protected DB/auth backups retained. Rollback entry
  point: `.local/releases/question-a32c053-20261021/deploy.py --rollback` (Python).
  Backed-up DB restore was tested separately; application rollback does not restore DB.
  No open MR in the enabled production repository, so external MR comment publication
  was not exercised; no real test comments were posted. Source release remains on
  its feature branch; this task does not change main, push or merge the existing PR.

- Push-question history task 2026-10-21: isolated feature branch
  `feat/push-question-history`, base `aa851b1` (includes current fixed three-question
  policy and answer-reveal formatting). Original checkout was clean and remains
  untouched by this task. Existing no-Jira repository ruling applies.
- P1: exact head/base/start revision marker scopes generation progress, publication
  reconciliation and grade refresh to the corresponding comment. A new revision
  creates a fresh comment and leaves earlier questions/grades untouched. Unversioned
  legacy comments are retained. Same-revision retries reconcile the accepted comment.
  Observed two focused regressions fail before the fix and pass after it. Full local
  verification passes 105 unit + 34 disposable PostgreSQL/HTTP integration tests,
  including GitHub/GitLab push/progress/response-loss/retry/latest-grade scenarios.
  Author source review covered all current P1 changes; no independent reviewer used.
  Delta-only question material and intent/rationale prompting remain the next slice.
- P1 completed in `341fcd3`. Compatibility source review then found that grading a
  pre-update current summary lacked the new revision marker. Added a narrowly scoped
  fallback: all question IDs in the stored current report must match the owned legacy
  summary before grade refresh can adopt it; earlier revision comments cannot match.
  A real-DB regression failed before the fix and passed after it. Current full suites
  pass 106 unit + 35 PostgreSQL/HTTP integration tests, including pending delta tests.
- P2: incremental source preparation now supplies a separate bounded diff from the
  last completed question revision, while retaining canonical MR/PR base coordinates
  and base source for publication/deletion checks. Rename chains retain both the
  incremental old path and canonical old path; excluded intermediate paths and oversized
  deltas are withheld. Real-Git regression confirms the second push adds `second`
  without presenting the earlier added `first` as a new addition, preserving exclusions.
- Initial generation keeps exactly two basic and one advanced question and one bounded
  model call. Prompt includes previous question text, explicitly scopes incremental
  questions to the new delta, and requires at least one code-supported purpose/rationale
  question alongside behavior/flow/edge-case understanding. It forbids guessing the
  author's private intent as the answer. README and operations describe new-comment,
  latest-question grading, full-scope fallbacks and coalesced intermediate push behavior.
- P2 red/green: exact-delta payload and real-Git rename/source checks failed before
  implementation and passed afterward. Final current-source suites: 106 unit + 35
  disposable PostgreSQL/HTTP integration tests passed. Source self-review covers
  P1 committed changes, legacy-grade correction and all current P2 code/tests/docs;
  publication ownership/ref fences, sensitive old paths, bounded payloads and recovery
  were traced. Independent semantic/model review was not run. This task does not claim
  new real-model quality/timing measurements or production deployment.
- Push-history completion: P1 `341fcd3`, legacy-grade compatibility `08de725`,
  P2 purpose/rationale + exact incremental material `61a0013`. Required final checks
  passed on that runtime source: 106 unit tests, 35 PostgreSQL/HTTP integration tests,
  real Git source/rename/exclusion tests, Codex/Claude subprocess and runner contract
  fixtures, fixture demo generation, Compose configuration and diff whitespace checks.
  Controller and runner images carry exact revision `61a0013` (full revision recorded
  in ignored `.local/push-question-verification.json`). Disposable image execution
  verified progress/publication/retry/latest-grade preservation and legacy-current
  grading, plus runner health/auth/schema. No live model quality/timing sample was run.
  Author review covered actual committed/current changes; independent review unavailable.
  Task-owned verification containers/tags are removed after checks. Original checkout,
  original local settings and production services were not modified; no remote push,
  PR/MR mutation or production rollout was performed for this follow-up feature.
- Final concurrent-work check found separate uncommitted four-question changes in the
  original checkout (`feat/four-initial-questions`). They were not copied, staged or
  modified. Made only the newly added rationale instruction/docs count-neutral so a
  later question-count change does not conflict with a hardcoded three-question phrase.
  Existing count/schema policy in this feature's base remains unchanged. Refreshed
  suites still pass 106 unit + 35 DB/HTTP integration tests; no live-model claim.
- Count-neutral adjustment completed in `b51df1b`; final matching-revision controller
  and runner image builds and disposable runtime probes passed again. Demo, Compose
  configuration, 106 unit + 35 PostgreSQL/HTTP integration tests and diff checks pass.
  Detailed image IDs/check scope recorded in ignored local verification evidence.
  Final working tree is clean after this record; original concurrent four-question
  work remains outside this branch and is preserved. No production redeployment.

- Four-question/push-history release authorized 2026-10-22. Isolated integration
  branch `feat/four-question-push-release` starts at `08a8c62`; merges committed
  `288c62f`, including four questions (three basic/one advanced), self-describing
  follow-ups and current closed/merged-command behavior, to avoid runtime regression.
  Original checkout was clean on `feat/commands-on-closed`; initial patch/config
  hashes saved privately. No original source/config changes copied or discarded.
- Integration resolves count versus rationale prompt, revision markers versus four-item
  rendering and current command acknowledgement imports. One new push fixture still
  supplied three initial questions: observed failure, corrected it to the four-question
  fixture; retained legacy three-question reports for compatibility. All 109 unit and
  37 PostgreSQL/HTTP integration tests pass, including old-comment preservation through
  progress/retry/grading on GitHub/GitLab. Live quality/deployment gates remain pending.
- Live diagnostic hold: first four-question request reached 120s process budget.
  Unchanged tiny real-model query passed in 5.919s and same four-question input with
  profiling passed in 35.778s (MCP ready 0.435s/source read 2.089s); timeout cause
  remains unestablished. All failure/profile evidence retained, no rollout performed.
- Source audit of subsequent samples found an overbroad option explanation claiming
  RangeError occurs only on argument validation. A real transpilation/execution probe
  with valid maxAttempts=3 and a callback RangeError reproduced three calls followed
  by the original RangeError. Held sampling; tightened prompts to explain only each
  distractor's source-supported failing condition, distinguish local versus propagated
  callback/API errors, and keep key explanations concise. Prompt-boundary regression
  observed red before the change. Full unit/DB suites pass again; final live samples
  must be regenerated on the corrected candidate before GO.
- Corrected candidate `3660af5` passed five real-model runs: 20 questions, each three
  basic/one advanced, one initial_questions RPC. CLI modelUsage: claude-opus-5-5;
  CLI 2.1.290. Median 58.455s, range 41.986–91.040s. No timeout/schema/source failures
  in this corrected cohort. Full source/choice/key audit passed; initial diagnostics
  (120s timeout, overbroad explanation, controlled pre-fix cancellation) retained.
  Incremental questions in both repeated runs cover only changed retry behavior.
  Actual-source probes verify capped waits, no-wait nonretryable errors and predicate
  exception propagation. Actual model reports pass local publication/progress/retry/
  grading/legacy-four-question history checks. Independent semantic review unavailable.
  GO report: docs/verification/four-question-push-live-2026-10-22.json; rollout pending.
- Authorized rollout reconciled concurrent PR #14 deployment: original checkout moved
  to main `5fb7a07`, with runtime JS byte-identical to `288c62f`, already included in
  this candidate. Initial preflight held before changing services; refreshed rollback
  image references to this new baseline, preserving its functionality/configuration.
- First candidate activation passed health/image/environment checks, but native model
  canary returned API401. Rolled application back to the refreshed baseline. CLI auth
  status showed production logged out while the isolated validation copy was logged
  in. CLI identity checks against the original protected backup confirmed the same
  existing account/organization/subscription. Restored only opaque current credential
  state atomically, retaining original backups and without printing/parsing tokens.
  Actual baseline production source query then passed in 6.607s. Credential-state
  divergence is observed; refresh-token rotation from the copy is an inference.
- Final rollout: runtime source `3660af5`, 2026-10-22 00:38:17 UTC (09:38 KST).
  Both matching images healthy; complete runtime environment and PostgreSQL/n8n/tunnel
  container identities unchanged. Final native production canary passed in 36.032s,
  four questions (basic3/advanced1), all choices/keys audited. Public configured webhook
  invalid/valid auth:401/202, ignored event admitted0. Controller failed0/queued0/inactive;
  runner ready/idle. Database remains jobs42/targets10/deliveries55/feedback0.
  Original tracked diff/local config hashes unchanged; original branch/main merge was
  by the concurrent task. Current source branch and work-unit history remain isolated.
  Operational guidance now prevents independently rotating copied OAuth stores and
  requires actual-model verification after restoring the same account state.
- Cleanup/completion: removed the owned model container, both isolated OAuth volumes,
  four unreferenced validation snapshots, one owned fixture Git cache and temporary
  canary files. Preserved protected initial/current backups, rollback images, immutable
  deployed version tags and private evidence. Production authentication directory is
  writable for normal refresh. Final image/health and original source/config hash
  checks pass. No uncommitted user files staged/reset/restored; no branch push or PR
  mutation performed here. Detailed report records concurrent deployment, the failed
  auth canary, actual rollback, same-account repair and successful final native canary.

- hey rename (2026-10-22): user chose `hey` for the product and short command prefix.
  Branch `codex/rename-to-hey` started clean from main
  `5fb7a07b9c478ba8c5f384dddaf21ae3f173a914`; existing no-Jira ruling applies.
- R1 completed in `da4fa8088763da25e7747fb72f6aaefb5aae3a6a`: canonical `/hey` and
  `@hey`, comment titles/help, package/lockfile, images, n8n display names, examples
  and Korean/English documentation. Base `.hey.yaml` wins over the legacy filename.
  Old command aliases, comment markers, finding/question IDs, gate status context,
  Compose storage identity, DB names and n8n IDs remain compatible.
- RED: new commands/rendering failed 32 of 39 focused checks; the real-Git policy
  precedence test failed against the old filename-only loader. GREEN: 108 unit
  tests and 34 disposable PostgreSQL/HTTP integration tests passed. Existing test
  assertions were preserved apart from the public names; alias/collision and base
  policy precedence/trust checks were added.
- D1 completed in `3b91cf08d55ec8c064029e6e4604a4ddb44d1f14`: fixed the pre-existing
  demo's three-question fixture to meet the four-question contract. Its pre-edit
  blob matched the base commit; `npm run demo` first failed the exact-count/basic
  quota checks, then generated four questions (three basic, one advanced).
- Compose configuration, workflow regeneration/stable-ID checks, manifest/lockfile
  checks, fixture outputs and `git diff --check` passed. Both hey images built and
  passed isolated, network-disabled command/help/summary checks and a real MCP
  handshake/source read returning server name `hey-source`.
- Author review covered base-to-HEAD plus staged/unstaged/new task files, including
  the policy rename; scope receipt is `.local/hey-final-review-scope.json`.
  No remaining author-review blockers. Fresh-context independent review was
  unavailable; no subagents were dispatched. Live model quality and external
  publication were not evaluated for this rename. No production rollout, remote
  push, repository/account rename or tunnel/DNS change was performed.

- hey rollout integration (2026-10-22): production was already on `3660af5`,
  whose push-specific questions and revision-bound comment history had merged in
  `90f6399` after the rename branch started. Integrated that merged revision before
  rollout, preserving both revision markers and the hey display/command names.
  Integration checks pass: 111 unit tests, 37 disposable PostgreSQL/HTTP tests.
  Existing feature commits remain separate; production activation is pending.

- Authorized hey production rollout completed 2026-10-22 02:36:50 UTC (11:36 KST)
  from integrated source `eb559b97fb880ef8561e847cf894e751f0b15b40`. Controller and
  runner use matching immutable hey images, remain healthy, and preserve exact
  runtime environment/mounts and PostgreSQL/n8n/tunnel container IDs. Rollback
  plans and restoration of a production DB dump into an isolated old controller
  passed; protected DB/auth backups and exact old images remain available.
- Production checks: new/legacy help both return 14 hey commands, hey progress
  titles and per-revision markers remain, authenticated n8n dispatch returns 202,
  public webhook rejects invalid auth (401) and accepts an ignored authenticated
  event (202, admitted0). Controller failed0/queued0/inactive; runner healthy/idle.
  Existing 50 jobs/13 targets/0 feedback remain. One real closed-MR delivery during
  preflight explains deliveries67→68; no job was created by that closed event.
- n8n workflow display names updated to hey with existing IDs, nodes, schedules,
  connections and settings preserved; both active after restarting the same n8n
  container. GitLab bot avatar replaced with the user's final selected JPEG; upload
  returned 200 and current-user API readback confirmed the new avatar URL. The
  earlier withdrawn image was not used. No GitLab test comments were posted.
- Native model acceptance remains blocked by Claude session quota: two source-read
  canaries returned API429; a direct CLI request without application code also
  returned 429 and reported reset at 2026-10-22 13:40 Asia/Seoul. Authentication is
  logged in. Kept the healthy hey deployment because the limit is independent of
  the rename; provider/model/credential settings are unchanged. No model success
  or post-reset recovery is claimed. Full evidence: docs/verification/hey-release-2026-10-22.json.
  Rollback: `python3 .local/releases/hey-eb559b9-20261022/deploy.py --rollback`.
  Author review only; independent review unavailable. No remote push or main merge.

- Question title update (2026-10-22): branch `codex/question-heading-copy` started
  clean from `85835d49e0b0f7eb0932c7a89ea5663d8a0addcd`; existing no-Jira ruling applies.
  Changed the report and generation-progress title to `hey! 이건 알고 머지하는거지? 😏`.
  The user selected H4 (`####`) after confirming H2 would increase the current H3 size.
  Korean/English README examples and existing title expectations now match.
- Verification passed: 111 unit tests, 37 disposable PostgreSQL/HTTP integration
  tests, five direct report/progress rendering checks, and `git diff --check`.
  Author review covers all eight changed files; no remaining blockers. Independent
  review unavailable. Completion is recorded by this work-unit commit on the branch.
  No deployment, remote push, or main merge was performed.

- Mattermost notifications (2026-10-22): branch `codex/mattermost-notifications`
  started clean from `adac621`; existing no-Jira ruling applies. Replaces native
  MR/comment messages with two-line event-specific notices, MR-author given names,
  linked titles and publication-complete question notices. Internal markers and
  account handles remain absent from MM; human comment notifications are preserved.
  Destinations are explicit per-repository secrets. PostgreSQL admission/deduplication
  and delivery claims survive restart; ambiguous writes are not repeated automatically.
  Native pipeline/deployment notifications remain outside the replacement scope.
- Observed missing-module RED; GREEN: 115 unit tests and 40 disposable PostgreSQL/HTTP
  integration tests. Author review only; independent review unavailable. Live activation
  remains pending destination configuration and final runtime checks.
