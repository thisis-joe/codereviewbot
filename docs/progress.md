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

- MR/question notification implementation committed as `c37dc85`. User extended
  scope to push notifications: sender given name, branch, complete commit count,
  comparison link; new branches link to commits, while deletion/tag events are skipped.
  Push support is a separate work unit on the same notification feature branch.
- Push RED reproduced unsupported notification rendering; GREEN: 116 unit tests and
  41 disposable PostgreSQL/HTTP integration tests. Real local HTTP receives the MM
  payload; authenticated push delivery/replay, counts above GitLab's 20-item payload,
  author attribution, unsafe links, disallowed repositories, loss/restart and 429
  cases pass. Author review found no remaining blockers; live activation pending.
- Activation completed at 2026-10-22 12:39 KST from `367d357` (MR/question unit
  `c37dc85`, push unit `367d357`). Only the controller was replaced; original
  runner/PostgreSQL/n8n/tunnel containers, mounts and existing environment remain;
  the existing MM webhook URL was added as the sole environment change.
- GitLab UI readback: hey webhook Push events enabled for all branches. Native MM
  MR and comment events disabled; native Push stays off to avoid duplication.
  Existing native pipeline/deployment events stay enabled. Integration username
  saved as `hey`; webhook authentication and destinations are preserved.
- Live acceptance: historical completed MR !13 produced exactly one four-question
  notice linking its published question comment. A real new MR !16 independently
  produced the new author-attributed open notice. Both deliveries are `sent`, and
  public invalid/valid ignored-event admission returned 401/202. Controller healthy.
- Remaining external setting: MM client configuration exposes
  `EnablePostUsernameOverride=false`; the actual posts therefore show the existing
  webhook owner's display name despite the requested `username: hey`. The current
  account has no System Console entry. No account/profile/permission changes made.
  Evidence: `docs/verification/mm-notifications-2026-10-22.json`. Author review only;
  no remote branch push or main merge. Runtime rollback also requires restoring
  native MR/comment notifications and the original hey Push-event setting in GitLab.

- Question failure recovery (2026-10-22): user authorized all diagnosed fixes, a live
  MR !15 rerun through question publication/MM delivery, GitLab display name `hey`,
  and the shortest permitted bot username. Branch `codex/question-failure-recovery`
  started clean from `df86721`; existing no-Jira ruling applies.
- F1: structured, allowlisted failure metadata now survives Claude CLI → runner HTTP
  → controller → failed report. Quota/authentication failures stop immediate retry;
  user notices show the actual category and scheduled retry time. Error payloads
  retain no provider text or credentials. Failed-report publication remains failed;
  health counts current failed reports while preserving historical audit outcomes.
  RED reproduced missing error transport; GREEN: 118 unit + 42 PostgreSQL/HTTP tests,
  including real subprocess/HTTP failure propagation and legacy false-success repair.
- F2: same-revision failed generations now derive a fresh recovery delivery from
  the preceding failed job, with shared admission deduplication, cooldown and at
  most three automatic recovery attempts. Authentication/invalid output stay
  manual. Operator retry clears a failed generation result instead of republishing
  the error notice. RED reproduced all three recovery defects; GREEN: 118 unit +
  45 PostgreSQL/HTTP tests, including concurrent controller recovery.
- F3: a published partial report with valid questions now sends the same concise
  MM notification, with an explicit `일부 변경 제외` scope qualifier and exact
  summary-comment link. Failed/empty output and repeated same-revision grading
  remain silent. RED proved the missing first-partial notification; GREEN: 118
  unit + 46 disposable PostgreSQL/HTTP tests; source/diff author review passed.
- Identity investigation: existing bot self-token update of its display name
  returned 403; project token UI only exposes revoke/rotate, not rename. GitLab's
  documented user modification endpoint requires an instance administrator.
  No credential rotation, access expansion or replacement account was attempted.

## 2026-10-22 — hey command cleanup and concise replies

- Branch `codex/hey-command-cleanup`, initially based on `df86721`, rebased onto
  `adb3c43` after the existing failure-recovery work committed independently.
  Recovery commits `08d5e9b`/`fee3cb6` and partial-notification commit `adb3c43`
  remain included. The original checkout was not reset or edited by this task.
  No Jira task exists; the established `codex/` naming rule applies.
- `ee002a8`: removed full/pause/resume/explain/dismiss/learn/approve/reject and their
  handlers, feedback storage/context injection and pause scheduling. Regeneration
  is `/hey tryagain`; the former review spelling is rejected, including in failure
  guidance. Help has six commands, with unbroken names and short description lines
  that survive GitLab sanitization. The migration retires only obsolete command
  state and preserves question, answer, report and queued-work history.
- `0cbf4e2`: confirmation replies contain a short message and the help hint. Code
  answers show evidence and follow-up sections only when populated, using smaller
  headings. No empty evidence or follow-up headings appear on regeneration replies.
- Red checks reproduced unsupported tryagain/accepted retired commands, the old
  14-command help and empty reply headings. Before integration, 116 unit and 41
  PostgreSQL/HTTP tests passed; the first staged work-unit snapshot separately
  passed 115 unit and 41 integration tests. After integration, 118 unit and 46
  PostgreSQL/HTTP tests passed, including bounded recovery and partial notifications.
  All six failure variants point to tryagain; restoring full in an isolated compiled
  copy made that regression check fail. Docker disk exhaustion during an image export
  was bypassed with disposable tmpfs PostgreSQL for the repeated integration checks.
- Both original Dockerfile images built and passed isolated module smoke checks.
  Final compiled code/migrations were overlaid on those images after integration,
  then both final images passed command/failure/reply smoke checks. Dependencies
  and runtime configuration were unchanged. Compose, demo and whitespace checks pass.
- Actual GitLab (201) and GitHub (200) Markdown rendering retained the six-row table;
  GitLab confirmation output and a local browser preview confirm the compact reply
  and balanced columns. Author review covered the complete integrated diff; no
  blocking findings remain. Independent review was not performed. This branch was
  not deployed; production DB and remote comments were not changed by this task.
  Evidence: `docs/verification/hey-command-cleanup-2026-10-22.json`.
- Production activation completed from `adb3c4379a29aac6774801beb71ef864258f22ab`:
  matching controller and runner are healthy; exact existing environment, mounts,
  auth volumes and PostgreSQL/n8n/tunnel identities are preserved. Protected dump
  and exact-image rollback live under `.local/releases/question-recovery-20261022/`.
- Before activation, simultaneous image builds exhausted the Docker data disk and
  PostgreSQL temporarily repeated crash recovery. The author missed a free-space
  check before building. Removed only rebuildable unused BuildKit cache (187.5 MB
  old cache + 3.176 GB unused cache), preserving all volumes and rollback images.
  PostgreSQL recovered; health and data reads succeeded before rollout. Future
  image builds must check Docker data-disk free space and concurrent build demand.
- Live MR !15 rerun `5aa33234-16fd-4276-bfad-e9d5f198b006`: actual Claude call 1,
  generation 49 seconds, completed, three basic + one advanced question; H4 title,
  no answer keys in published body. Exact note `2906252` updated in place. Existing
  same-revision MM completion post `z5sx7redj3ndpbkcndpo9xd8uy` is sent and visibly
  links that note; no duplicate completion notice was generated. The existing
  notice was sent at 14:59 KST, before this post-deployment rerun at 15:19–15:20.
- Historical MR !15 note `2906188` retains its f3e79bd9 revision and comment ID; its
  old title/generic error were replaced by H4 and the confirmed historical quota
  429 cause, directing readers to the latest questions. Legacy false-success jobs
  are now failed; zero completed jobs contain a failed generation result. Current
  health still reports four failed targets from other historical MR reports;
  MR !15 is successful and no MR !15 work remains queued/running.
- Remaining external blocker: GitLab name `hey` and shortest requested login `hey`
  could not be applied (403); `hey` is available. Bot user 33767 needs an instance
  administrator's name/username update and coordinated `botLogin` config change.
  Existing identity/config/credentials remain consistent. MM sender override is
  still disabled server-wide as recorded previously. No alternate account created.
- Verification: `docs/verification/question-recovery-2026-10-22.json`; GitLab and MM
  screenshots saved under `.local/question-recovery/`. Author review only; 118 unit
  + 46 integration checks pass. Three implementation units are separate commits;
  no remote branch push or merge requested/performed.
- MM inline links (2026-10-22): user requested clickable branch names, MR numbers
  and `MR !18 · 질문 4개` within the sentence. MR titles remain plain context on
  the next line. Branch `codex/mattermost-inline-links` from `8ef3ed3`; existing
  no-Jira ruling applies. Pre-existing untracked `.local-ship-audit.json` is not
  owned or modified by this task.
- Renderer now places each URL on the named object, removes the separate push
  link line and keeps author attribution, exact-comment destinations and partial
  scope warning. Parentheses in new-branch URLs are percent-encoded so they stay
  inside the Markdown link; mention escaping remains intact. RED: four display
  checks and a reserved-character URL check failed before their fixes. GREEN:
  120 unit + 46 disposable PostgreSQL/HTTP checks; full task diff author-reviewed.
- Identity follow-up: actual GitLab 18.11.5 source has an admin-only user update
  endpoint and no self-name REST mutation or token rename endpoint. Creating a
  *new* project token named `hey` gives its new bot that name, under Maintainer
  permissions, but changes identity, leaves old comment authors intact and keeps
  the generated long login. This is an alternative, not a rename of the old bot.
  Sources: https://docs.gitlab.com/user/project/settings/project_access_tokens/
  and https://gitlab.com/gitlab-org/gitlab/-/raw/v18.11.5-ee/lib/api/users.rb .
- MM 11.7.2 readback: `EnablePostUsernameOverride=false`,
  `EnableBotAccountCreation=false`; bot accounts are absent from Integrations.
  Public config also has `EnableUserCreation=false`. With the existing account,
  webhook owner and permissions, a distinct `hey` sender needs administrator
  support. No new account, credential or personal-profile edit performed.
  Source: https://docs.mattermost.com/administration-guide/configure/integrations-configuration-settings .


## 2026-10-22 — hey command cleanup production rollout and live GitLab proof

- User authorized production deployment and actual GitLab checks. Deployed source
  `9ba3be930540a06232b74d4c154eca0337dc1a2d` on feature branch
  `codex/hey-command-cleanup`; controller and runner are healthy with zero restarts.
  This supersedes the earlier entry's undeployed and author-review-only status.
- Initial `3bd6109` rollout and live checks passed, but the final revision probe
  detected another chat replacing the controller with `bbf4bb5`, which omitted the
  command cleanup. Completion was withheld. Its Mattermost inline-link change was
  retained by cherry-picking into this branch as `9ba3be9`; both services were
  redeployed together and the actual GitLab checks repeated on that final source.
- Independent `release_review` covered the original release and combined change;
  no blocking findings. Final source passed 120 unit and 46 disposable PostgreSQL
  integration tests. Production dependency audit has zero advisories. Both image
  contents matched all 88 compiled/migration files and passed parser/notification
  smoke checks. Existing credentials, environment, mounts, limits, networks and
  PostgreSQL/n8n/tunnel container identities were preserved.
- Protected full DB dumps and exact-image recovery are under
  `.local/releases/hey-commands-9ba3be9-20261022/`. A real production dump was
  restored into an isolated tmpfs DB; migration and startup of the schema-compatible
  `3bd6109` fallback passed with question/answer/job history preserved. The initial
  pre-removal schema/state recovery was separately tested in the initial release.
- Actual human `/hey help` note `2908189` produced bot reply `2908191`: six rows,
  no retired commands, and measured columns 170/98/332/211 px with no table overflow.
  `/hey tryagain` note `2908195` produced concise reply `2908197`: confirmation and
  help hint only, no headings or empty sections. Temporary acknowledgements were
  removed for both requests.
- Regeneration job `b7fe602f-bb51-42d8-9302-bbfe84f3a4cb` completed: one model
  call, 92,450 ms generation / 93 seconds recorded review time, three basic plus
  one advanced question. Actual GitLab note `2906252` updated at 16:14:30 KST,
  replacing progress with all four questions; browser DOM and screenshots confirm.
  All three final test jobs completed. Final runtime probe accepts tryagain,
  rejects review and all eight removed commands, and confirms retired DB state is
  absent, zero false-success jobs, no queued/active work, and both services still
  running `9ba3be9`. Four failed targets in health are pre-existing history.
- Sanitized proof: `docs/verification/hey-command-cleanup-live-2026-10-22.json`;
  actual GitLab screenshots: `.local/command-cleanup/live-final-gitlab-*.png`.
  No branch push or merge requested/performed. Production release and its
  verification documentation are distinct work units.


## 2026-10-22 — PR publication review: preserve bounded recovery after platform failures

- User authorized feature-branch push, PR creation, merge and production rollout.
  Published `codex/hey-command-cleanup` at `475ea3c` and opened PR #16 against
  default branch `main` (`90f6399`). The remote has no dev/develop branch. Existing
  work-unit commits and the feature branch name remain intact; no Jira task applies.
- Whole-PR independent review found two release-blocking recovery edges before
  merge: a recovery job failing before snapshot acquisition had no result and
  permanently reused its predecessor's consumed delivery key; a same-head automatic
  event merged into queued recovery discarded its attempt budget. Merge was held.
- Recovery now retains explicit revision identity, includes result-less terminal
  failures when choosing the next attempt, and preserves the same-head automatic
  budget. Human requests and new heads reset it. Older jobs' full-snapshot target
  remains readable. A shared revision-aware attempt calculation also resets the
  budget on changed base/start while retaining the rate-limit's 15-minute cooldown.
- Real PostgreSQL/controller regressions reproduced the original failures, including
  snapshot errors, expired leases, fresh cooldowns, concurrent/restarted recovery,
  three-attempt exhaustion, legacy jobs and manual/automatic/new-revision boundaries.
  A separate red check caught the controller's missing 15-minute cooldown after a
  revision change; the final test exercises actual Controller handling of a 429.
  Final checks: 120 unit +50 PostgreSQL integration tests, zero failures. Private
  logs and frozen review scope are under `.local/publish/20261022/`.
- Independent `release_review` final verdict: spec/standards/quality pass, no
  remaining blockers. Reviewed source/test diff SHA-256:
  `57b8f6ad5a340f1d772e3f269248f75bd5bee41b528e8ca3562d3b815ee27224`.

## 2026-10-22 — Consistent two-line Mattermost notification copy

- User selected the exact `이름님의 ... 이모지` sentences and a second bold link
  containing the full `MR !number - title` or branch name. Question counts and
  partial-scope warnings stay on GitLab only; MM question completion is concise.
- Branch `codex/mattermost-consistent-copy` starts from `6baf6f6`; existing no-Jira
  ruling applies. Concurrent bot-identity edits appeared in the shared checkout,
  so only this task's formatter/tests were moved into the isolated worktree at
  `.local/consistent-copy/worktree`; the original branch and identity edits remain.
- Lifecycle, question and human-comment notices now share the two-line format.
  New branches are identified from the actual zero before SHA, including creation
  with nonzero commit counts; ordinary pushes show their commit count. Destinations,
  author given names, escaping, deduplication and GitLab report detail are preserved.
- RED: four focused formatting checks failed against the old renderer. GREEN:
  120 unit + 50 isolated PostgreSQL/HTTP integration tests. The partial-publication
  check verifies the GitLab comment still contains four-question progress and its
  partial-analysis limitation while MM omits both. Full task diff author-reviewed.

### 2026-10-22 — hey bot identity migration

- User authorized a new GitLab bot named `hey`, keeping question/answer history, then disconnecting the old credential after verification. Feature branch: `codex/hey-bot-migration`, started from main `6baf6f6`, then rebased onto deployed MM copy commit `1d72579`; existing no-Jira ruling applies.
- Separate active writable ownership from historical bot-comment recognition. Retired aliases deny bot commands/MM notifications; authenticated operator imports persist exact target/surface/remote IDs so ghost attribution cannot break old question threads. New summaries reuse existing question IDs and grades; old notes stay untouched.
- RED: focused migration test lacked the bot identity helper. GREEN: focused tests cover bounded aliases, denied old-bot commands, strict active ownership and suppressed MM marker leakage. PostgreSQL tests cover registry persistence, MR/surface isolation, forged human markers, old-thread keyed grading, previous grade preservation, summary creation and publication idempotency.
- Full integration suite: 52/52 passed. Full unit suite and deployment evidence recorded below after final checks. Author reviewed the actual diff and trust boundary; independent reviewer unavailable in this session (no delegation requested).
- Automatic approval review rejected an initial whole-database baseline; narrowed the SQL capture to this project's platform/instance/repository before running it. No unrelated repository data was captured by that operation.

- Final source `7609e14` preserves deployed MM formatter `1d72579`. Final tests: 122 unit +52 PostgreSQL integration, zero failures; author reviewed the rebased diff against the actual deployed parent. Initial Docker activation overlapped another controller rollout; verified the restored healthy service, incorporated its MM source, recaptured runtime, and completed a controller-only rollout. Runner, PostgreSQL, n8n and tunnel container IDs remained unchanged.
- Created `hey` project token 46599 / bot user 33826 with the same Developer role, `api` + `read_repository`, expiry 2027-10-20. Imported 38 old-bot remote comment IDs before switching the active credential and botLogin; retired login remains metadata. Source/image activation `7609e14` is healthy.
- Same-revision MR !15 cache publication completed as job `bc70f910-c330-4cb9-9713-db0db16f6976`: four existing question IDs, new hey summary note `2908852`, no regeneration. Human `/hey showanswer Q1` in the old summary's thread (note `2908867`) received hey's keyed B answer and option explanations in note `2908869`; job completed and recorded no grades.
- Only after those checks, revoked old token 46478 through the GitLab UI. Old `/user` request now returns 401; new token returns user name `hey`. Post-retirement comparison preserves all 22 original project targets, 80 original jobs, the existing stored question batch, and all 38 old comment bodies. Question/answer IDs were not rewritten. The private pre-retirement rollback helper refuses use after revocation; recovery must keep the new credential.
- Sanitized proof: `docs/verification/hey-bot-migration-2026-10-22.json`. Browser screenshots show hey's actual reply and only hey active while codereviewbot is revoked. No source branch push or merge requested/performed.

### 2026-10-22 — Restore hey bot avatar

- User reported the missing image after the bot replacement. Branch `codex/hey-bot-avatar` starts at `817c46d`; existing no-Jira ruling applies. This is a profile-only restoration with no application/runtime or credential change.
- Read old bot user 33767's approved avatar URL and new hey user 33826's default image. Retrieved the existing image through the signed-in browser; direct/API-token asset requests were rejected with 401, so no authentication bypass was used. Uploaded that JPEG only to the new bot's authenticated `PUT /user/avatar` endpoint: 200, then current-user API readback matched the new avatar URL with identity unchanged.
- MR !15 browser reload shows the new avatar on hey's existing comments; both matching rendered images loaded successfully. No question, answer, comment body, bot name, username, credential or deployment was changed. Direct API/browser verification is appropriate for this reversible profile setting; no source tests added.
- Evidence: `docs/verification/hey-bot-avatar-2026-10-22.json`; screenshot `.local/bot-avatar/hey-avatar-restored.png`.

### 2026-10-23 — MM outage after 18:07:34 KST

- User reported no MM notifications after 2026-10-22 18:07. Branch `codex/mm-disk-recovery` starts at `b2f1a06`; existing no-Jira ruling applies. Runtime source remains `7609e14`; this is operational recovery with no application code or credential change.
- RED: Docker data disk 40GB at 100%, zero available; PostgreSQL unhealthy/exited (OOM flag set), repeated recovery checkpoint PANIC `No space left on device`; controller restart loop with PostgreSQL `57P03`; GitLab actual Note/MR/Push requests received 502. Scoped DB read after startup confirmed all 68 previous notices were sent, last at 2026-10-22 18:07:34.501853+09, and none were queued during the outage.
- Stopped the failing controller, reclaimed disposable unused builder cache (825.9MB, then 8.287GB after unreferencing superseded images), removed only unused `hey-*` images unreferenced by any container, and retained current/previous recovery images. No containers or data/authentication volumes were removed. Started the same PostgreSQL/controller containers; PostgreSQL recovered without WAL reset or data initialization. Other project runtime images and volumes were preserved; shared build caches are reconstructible.
- GREEN: about 6GiB free (85% used), PostgreSQL/controller healthy, runner healthy, n8n/tunnel running. Existing n8n tick/recover resumed: current open MR !26 generated/published four questions as a partial report and completed. Its question notification was sent at 10:11:20 KST. Replayed one actual failed Push Hook (log 14650340, originally 10:04:12 KST): GitLab HTTP202 and MM sent at 10:11:39 KST. Both messages visibly present in MM. Old outage events were not bulk replayed.
- Original project data/auth volumes and bot identity `hey`/33826 preserved. Health still reports six historical failed jobs/targets (including two MR !25 jobs whose lease writes failed during the outage); these are not falsely reported as cleared. No source regression suite rerun because source is unchanged; the acceptance checks exercised actual DB recovery, public authenticated admission, model/publish path, MM queue dispatch and channel display. Local health passed, public invalid webhook returned401, real GitLab replay returned202.
- Evidence: `docs/verification/mm-disk-recovery-2026-10-23.json`, private cleanup plan/logs under `.local/mm-outage-20261023/`, browser screenshot `.local/mm-outage-20261023/mm-recovered.png`. Author reviewed the documentation/evidence diff; no new product or access contract introduced.

### 2026-10-23 — Five-week low-storage operation

- User authorized minimizing retained storage for five weeks of continuous operation. Branch `codex/low-storage-operation` starts at `03ee5df`; existing no-Jira ruling applies. Preserve all question/answer/grade/dedup records, active work and credentials; scope excludes other projects' data and runtime settings.
- Measured baseline: jobs 63MB, Git cache 29MB, reviewbot DB ~9MB, n8n DB 51MB; VM ~6GiB free. Product source DB is small; retain it. Bound logs to local compressed 5MB x2 per service and n8n error-only execution data to 48 hours /500 records, with no success/progress/manual data retention.
- RED: six-hour filesystem retention check failed against the old seven-day implementation. GREEN: expiry deletion, active/pending protection, young sources and symlink safety passed. PostgreSQL integration proves cleanup holds claim's advisory lock and preserves jobs/targets. Image selection protects all container references, explicit rollback image IDs and foreign tags; build preflight uses actual VM/host free space, and cleanup never removes volumes/global cache. Test-container teardown now removes its own anonymous volumes.
- Initial full source checks: 124 unit +53 PostgreSQL integration tests passed. Final integration wrapper cleanup check and production acceptance follow below. Author review includes source/Compose/scripts/tests and selected metadata; no independent delegation requested.

### 2026-10-23 — Two core CS questions and optional follow-up learning (S15P31E102-84)

- User requested two visible core CS questions tied to the actual change, with more questions available on request, plus several display examples. Branch `feat(be)/84-핵심_CS_질문_2개와_추가질문_안내로_가독성_개선` starts at `c3a1367`; no pre-existing dirty paths.
- Initial output now requires exactly two questions without a basic/advanced quota. The prompt prioritizes two distinct CS principles, short polite single-sentence questions and the actual change's code evidence. Priority order survives parsing. Existing persisted reports and answer IDs remain readable.
- Report format v6 shows questions and choices first, separated by rules, then short answer/reveal/morequestion hints. `/hey morequestion` keeps its existing on-demand five-question batch; no additional questions are generated automatically. Two-question reports count toward answer progress and optional merge gates, including 0/2, 1/2 and completion.
- RED: the new two-question contract, real generation entry point and visible two-question/gate checks all failed against the previous implementation. GREEN: 131 unit/boundary tests passed; 54 tests passed against disposable PostgreSQL. Demo generation and `git diff --check` passed. Historical oversized-report compaction still retains four complete visible questions instead of silently narrowing the legacy merge gate to two.
- Actual GMS (`gpt-6.1-sol`) initial generation inspected snapshot copies of the real GMS adapter and produced two source-validated CS questions. First sample covered memory bounds and a shared network deadline. A shortened prompt's first live attempt returned API 502; one retry passed, covering local tool-argument trust boundaries and a shared network deadline. Raw local evidence: `.local/gms-core-cs-example.json` and `.local/gms-core-cs-example.md` (ignored; no API credential included).
- `docs/examples/core-cs-question-options.md` contains three source-grounded, editorially shortened display examples: question-first (implemented), CS-keyword-first and collapsible choices (proposals). Full task diff and untracked files were author-reviewed against base `c3a1367`; frozen scope metadata: `/tmp/codereviewbot-cs-review.json`. No delegated review requested. Operating deployment, remote push and actual MR publication were not performed.

### 2026-10-23 — CS explanations and question-first follow-ups (S15P31E102-85)

- User confirmed layout 1 and requested CS knowledge with answers plus a concrete `/hey morequestion` preview. Branch `feat(be)/85-CS_원리와_코드_적용을_담은_해설과_추가질문_형식_통일` starts at `0a03c54`; initial worktree was clean.
- Initial/follow-up generation now asks for the CS concept's name, definition and principle followed by its application to the actual code. Stored `key.explanation` remains the owner, so bare-option grading and answer reveal reuse that knowledge without extra inference. Reasoned grading and `@hey` code answers also request CS principles linked to code. The displayed explanation heading is `CS 지식과 코드 적용`; historical keys remain unchanged.
- Follow-up comments show five questions and choices before concise answer/reveal/more hints, matching confirmed layout 1. Numbering, batch limits, fixed answer keys and answer progress behavior stay compatible.
- RED: checks for the CS explanation section and question-first follow-up layout failed against the previous build. GREEN: 134 unit/boundary tests and 54 disposable-PostgreSQL integration tests passed, as did demo generation and diff whitespace checks. The new tests exercise bare-option grading, reveal with no model call, reasoned grading prompts, initial and follow-up generation prompts, and general code-question answers.
- Actual GMS execution through `handleLearning` on snapshot copies of the GMS adapter generated five source-validated questions, excluding the two prior questions. Topics: bounded input, exception isolation, cumulative transmission cost, serial I/O latency and failure-specific retries. Inspected stored explanations include CS definitions and code applications. Local raw evidence: `.local/gms-more-cs-example.json`; no credentials included. Exact rendered questions plus the stored-key answer preview are in `docs/examples/morequestion-with-cs.md`; platform writes were stubbed, so no external PR/MR comment was posted.
- Author review covers the complete task diff and new example against `0a03c54`; scope metadata: `/tmp/codereviewbot-cs-answer-review.json`. No independent delegation requested. No deployment or remote push performed. Final commit is recorded on the linked Jira task.

### 2026-10-23 — Readable question formatting and commit titles (S15P31E102-86)

- User requested hidden technical tags, H4/H5 question headings, a blank line after questions and explanation headings, the plain label `해설`, and a separate linked bullet for every commit title in both initial and additional learning. Branch `feat(be)/86-질문과_해설_서식_및_커밋제목_목록_개선` starts at `5bf83b2`, with a clean initial worktree.
- Format v7 uses H4 questions, H5 explanation sections and blank lines before contents. Native Markdown choice lists and separate paragraphs replace HTML spacing entities and hard-break escapes. Live HTML comment markers remain hidden reconciliation/thread/gate metadata; user-facing example documents and demo output omit those markers.
- Snapshot metadata optionally carries commit SHA/title pairs read from immutable Git history for the reviewed full/incremental range, oldest first. All titles become linked bullets rather than short hash labels. Old records remain readable; same-SHA cache reuse backfills missing titles without inference, and answer/reveal retain titles from the stored snapshot. An unavailable title is identified rather than invented.
- RED: focused formatting checks failed against the prior build for H4 spacing, explanation headings and commit title lists. GREEN: 137 unit/boundary tests, 54 disposable-PostgreSQL integration tests, demo generation and diff checks passed. Real Git fixtures cover full history, incremental history, and unchanged-head backfill; integration covers cache enrichment on GitHub/GitLab. Stored-key answers/reveal retain commit metadata without extra inference.
- Browser validation rendered the real Markdown using Marked and installed Chrome in an isolated headless profile. All three panels passed: initial/additional/answer H4 question counts 2/5/1, three title links each, a plain explanation heading, and no visible internal markers, HTML spacing entities or Markdown escape syntax. Screenshots `.local/learning-initial-preview.png`, `.local/learning-more-preview.png`, `.local/learning-answer-preview.png` were inspected. The self-contained interactive preview is `docs/examples/learning-preview.html`; clean initial/additional Markdown examples and confirmed-layout references are updated.
- Author review includes the complete task diff and new artifacts against `5bf83b2`; frozen inventory `/tmp/codereviewbot-format-review.json`. No independent delegation requested. No production deployment, remote push or real PR/MR comment write performed. The final work-unit commit is recorded on the Jira issue.

### 2026-10-23 — Restore greeting and remove follow-up title (S15P31E102-90)

- User requested restoring `hey! 이건 알고 머지하는거지? 😏` and removing the additional batch title so it starts directly with the first question. Branch `feat(be)/90-기존_질문_인사말_복원과_추가질문_제목_제거` starts at `2352bb7`; initial worktree was clean.
- Restored the H4 greeting for initial comments and removed the follow-up batch's redundant heading. H4 questions, H5 explanation sections, blank lines and commit-title bullets remain. Updated help to clarify that bare `showanswer` reveals the initial questions only; explicit 심화 labels select additional questions.
- RED: a new visible-output check failed against the old greeting and batch heading. GREEN: 139 unit/boundary tests, 54 disposable-PostgreSQL integration tests, demo generation and diff checks passed. A characterization test proves bare showanswer produces identical two-question output before/after an extra batch; explicitly naming Q1/Q2 and 심화1–5 reveals all seven without inference or answer credit.
- Regenerated clean Markdown and HTML previews; Chrome checks passed for the greeting, no additional H3 title, question counts 2/5/1, commit lists and invisible metadata. Local screenshots were refreshed. Author review and frozen scope inventory: `/tmp/codereviewbot-greeting-review.json` against `2352bb7`.
- During this work the user asked for an opinion on requesting explanations through child comments. Code inspection confirms current routing receives GitHub review parent IDs or GitLab discussion IDs, while bare reveal currently ignores thread context. Recommended future behavior: one separate thread per initial/additional batch, with bare showanswer revealing that thread's questions; individual question threads reveal one question. Mixing batches in one discussion makes scope ambiguous. This thread-scoped reveal design is a recommendation, not implemented in this work unit.
- No deployment, remote push or real PR/MR comment write. Final commit is recorded on the Jira issue.

### 2026-10-23 — Basic initial questions and clearer explanations (S15P31E102-94)

- User requested basic-only initial questions, no difficulty tags, the correct option as a sentence instead of picked/correct letter comparisons, and separate indented option explanations of one to three sentences. Branch `feat(be)/94-최초_기본문항과_문장형_정답_및_보기별_해설_개선` starts at `3140b8d`; initial worktree was clean. Jira assignee is 우동균.
- Initial generation now requires exactly two `basic` questions and leaves advanced analysis for explicitly requested follow-ups. All renderers omit difficulty tags, including historical advanced questions. Grading and reveal show the stored correct option's text; option explanations use a new, indented Markdown quote beneath each choice. The grading verdict remains visible; the picked/correct letter row and per-option verdict tags are removed.
- Initial/follow-up keys and reasoned grading prompts connect CS principles to concrete code conditions in one to three sentences. The new-output schemas enforce the sentence limit. Stored historical keys and answer/grade records are not rewritten; key-based grading and reveal keep using their fixed answers.
- RED: three focused checks failed against the prior implementation for basic-only generation, feedback layout and sentence limits. GREEN: 142 unit/boundary tests and 54 disposable-PostgreSQL integration tests passed, along with demo generation and diff whitespace checks. Provider schema tests require `level=basic`; historical rendering, fixed-key grading, source anchors and comment budgets remain covered.
- Actual GMS calls generated two basic initial questions and five source-validated follow-ups excluding those initial questions. Inspected explanations connect the CS concept with code behavior; each explanation stays within one to three sentences. Raw local evidence is in `.local/gms-core-cs-example.json` and `.local/gms-more-cs-example.json`; no credential is included. All platform writes in this verification were stubbed.
- Refreshed the clean Markdown examples and self-contained HTML preview. An earlier Chrome check of the new layout passed, including four separate indented option explanations and no visible difficulty/comparison tags. Final refreshed files were checked as source. The in-app browser rejected access to the local `file:` URL, so its currently open tab could not be refreshed or re-observed; no alternate browser route was attempted after that rejection.
- Author reviewed the complete task diff and new tests against `3140b8d`; frozen inventory: `/tmp/codereviewbot-basic-feedback-review.json`. No independent delegation requested. No production deployment, remote push or real PR/MR comment write. Final commit is recorded on the Jira issue.

### 2026-10-23 — GMS production cutover and learning release (S15P31E102-96)

- User explicitly authorized switching production from Claude to GMS, deploying all accumulated question/explanation changes and verifying actual calls. Branch `ops/96-운영_GMS_전환과_질문_해설_재배포` starts at clean `5dbd1d2`; Jira assignee is 우동균. Product source deployed: `5dbd1d2fc3ad6d3d64a349c08a9592076d162b03`.
- Replaced controller and runner with source-only derived images using their exact existing dependency layers; dependencies matched the committed package and each new image added about 107KB. Network-disabled builds avoided package installation and a large build on the 5.1GiB-free Docker disk. Preserved exact controller environment; changed runner provider/key/model/URL to GMS `gpt-6.1-sol` and the approved Responses endpoint. Keys and frozen environments are only in ignored, mode-0600 local recovery files.
- Validated both activation and rollback plans before cutover, and tested candidate image startup plus initial/reveal rendering without network/DB access. Live services are healthy, both compiled module sets match the tested local source (30 modules), and normal image aliases point to the new artifacts. PostgreSQL, n8n and tunnel container IDs, mounts, networks, resource limits and bounded logging remain unchanged. No schema migration or credential revocation was needed.
- Actual deployed controller→runner RPC generated two basic initial questions (38.064s), five follow-ups (73.098s), and reasoned grading (15.930s). Stored-key reveal added no model call and still scoped bare reveal to the two initial questions. Verified greeting, no difficulty/comparison tags, four separately indented option explanations and one-to-three-sentence generated explanations. Platform writes were stubbed: no test PR/MR comment was posted.
- During these calls, 60 process/network observations recorded 59 established TLS samples to the resolved GMS endpoint and only `docker-init`/`node` processes; no Claude process appeared. Runner startup explicitly reports `provider=gms`; frozen environment and exact deployed code verify the GMS selection branch with no Claude fallback. An initial observation attempt used an unsupported Docker process-list format; stopped only its owned probe process, allowed the pending request to finish, fixed the observer and completed the successful full verification.
- Original 32 targets and 123 jobs (including existing question/answer data) are byte-equivalent after cutover. Health is unchanged from baseline: 10 historical failures, zero queued jobs and no active job; historical failures were not cleared or relabeled. Controller/n8n health returned200, unauthenticated public webhook401, authenticated n8n wake202 and controller tick202. n8n's existing error-only retention means success completion rows are not persisted; checked new execution allocation/deletion eligibility instead of treating its retained `running` placeholders as current execution status. Corrected the smoke observer's old assumption of a synchronous tick200 to the application's actual asynchronous202 contract.
- Reused the unchanged product source's passing 142-unit/54-PostgreSQL integration evidence; new image runtime and production RPC checks passed. Fresh native dependency audit: zero vulnerabilities. Author reviewed code/configuration trust boundaries, full release scope and recovery plans; independent review was unavailable and is not claimed. No Git branch push/merge was performed.
- Sanitized deployment evidence: `docs/verification/gms-production-2026-10-23.json`. Private deployment/probe evidence and exact recovery command are in `.local/gms-production-20261023/`; rollback: `node .local/gms-production-20261023/deploy.mjs --rollback` (prior images and exact prior environments, no DB rollback). Roll back on failed health, new persistent GMS auth/output failures or unexpected history/configuration drift; the operator is this release's recovery owner. New generation uses the new questions; prior saved questions and keys are retained.

### 2026-10-23 — Merge-only automatic learning (S15P31E102-97)

- User moved automatic questions from pushes to completed merges and selected `hey! 이건 알고 머지한거지? 😏`. Feature branch `feat(be)/97-머지_완료_시점으로_자동_질문_생성_전환`, clean base `4cd3f2f`; assignee 우동균.
- GitHub closed+merged and GitLab merge events admit fresh full-scope questions. Ordinary close cancels work; open/reopen/push/edit admit none. Merge jobs explicitly permit closed snapshots and publication, disable the pre-merge answer gate and retain that permission during retries. GitHub snapshots anchor to the merge commit's first parent so later base-branch movement cannot erase the reviewed change.
- Recovery no longer discovers automatic work from open MR revisions. It retries only persisted merge/manual failures with the existing finite retry budget; historical merged requests are not backfilled. Existing question keys, GMS selection and manual learning commands remain compatible.
- RED: focused public event checks failed against push-driven behavior, and a merged snapshot test failed against a moving base. GREEN: 144 unit tests and 56 disposable PostgreSQL/HTTP integration tests passed. Signed HTTP proves pushes admit zero jobs, a completed merge generates two questions and publishes after closure, duplicate delivery is safe, and accepted merge failures recover while closed. Native network tests initially needed the permitted elevated environment (sandbox port EPERM).
- Author reviewed the full diff including recovery/state/publishing callers; no independent review claimed. Production activation evidence is recorded on the Jira task after cutover; rollback uses frozen prior images/environments. No test merge, source push or external test comment is authorized/performed in this unit.

- Final scope check also covers a previously answered/open revision followed by a changed final head: merge generation always prepares the full PR/MR diff. Runtime cutover initially drained an active job before replacing services; GMS remains selected. Final source and deployment evidence are recorded on Jira.

### 2026-10-23 — Change-effect and principle-application prompts

- User approved the complete replacement prompts shown in this chat. Implementation: `bc147a1` on `codex/change-understanding-prompts`, from clean base `d809f56bba5233b8386967e157ca0692441e5fbb`. A read-only Jira search found no matching task; the existing no-Jira `codex/` feature-branch exception applies. No Jira records were created or changed.
- Initial Q1 asks about the change's core effect or guarantee; Q2 applies a relevant principle. The same concept may support distinct learning goals, with appropriate data-contract/traceability topics for documentation and data changes. Follow-ups deepen conditions, limits, alternatives and verification rather than recalling names, values or execution order. Both paths discourage repeated learning goals and unsupported author intent.
- Replaced both prompt bodies exactly with the approved text and retained JSON input payloads, source anchoring, fixed answer keys, two basic initial questions, five advanced follow-ups and 120-second budgets. Source comparison confirms no generation, grading, persistence or publication control flow changed. Updated README and the contract to describe the goals as generation instructions, not a deterministic quality validator.
- RED: three updated prompt-contract checks failed against the previous prompts (38/41 focused checks passed). GREEN: 41/41 focused checks, 144/144 full unit/boundary checks and 56/56 isolated PostgreSQL/HTTP integration checks passed. Demo generation, exact prompt-body comparison/runtime interpolation and `git diff --check` passed. Logs: `/tmp/hey-prompts-red.log`, `/tmp/hey-prompts-green.log`, `/tmp/hey-prompts-unit.log`, `/tmp/hey-prompts-integration.log`, `/tmp/hey-prompts-demo.log`.
- Author reviewed all seven implementation/test/documentation paths against the base; no independent review claimed. Live GMS semantic/latency sampling was not run: automatic approval review rejected sending repository code using local GMS credentials because explicit authorization for that destination was not established. Local fixtures prove prompt delivery and compatibility, not actual model question quality. No deployment, push, external test comment or production-data write was performed. Live sampling remains pending explicit authorization; the broader quality benchmark and insufficient-question fallback remain outside this prompt-only change.

### 2026-10-23 — Reject internal-rule and exception-branch trivia

- After explicit user authorization to send code to the existing GMS endpoint, the first live sample generated two initial questions in 41.517 seconds and five follow-ups in 71.896 seconds. Source/format checks passed; author semantic review found the difficulty-rule test and tool-argument/call-ID branch comparison still too narrow. Evidence: `.local/change-understanding-1792739693175/`.
- User requested a prompt correction and another live sample. Implementation `89bbd89` continues the same feature on `codex/change-understanding-prompts`, clean base `3175aa4`. Both prompts now reject branch-result recall disguised as reasons or responsibility boundaries. Follow-ups explicitly exclude product-private rules, require a condition → principle → guarantee/risk relationship after replacing identifiers with role names, and require conceptually different design judgments in choices. This is a generation instruction, not a new semantic validator or output schema.
- RED: two focused prompt checks failed against the old text (35/37 passed). GREEN: 37 focused checks, 144 unit/boundary checks, 56 isolated PostgreSQL/HTTP integration checks and diff whitespace validation passed. Logs: `/tmp/hey-question-depth-red.log`, `/tmp/hey-question-depth-green.log`, `/tmp/hey-question-depth-unit.log`, `/tmp/hey-question-depth-integration.log`.
- Reused exactly the first sample's two initial questions, same historical `c3a1367` source scope and existing GMS model/settings; generated only five new follow-ups using the corrected prompt. First completed attempt: 90.003 seconds. Prompt-source hashes and the actual sent prompt are retained in `.local/question-depth-1792740201072/`; the hashes match the committed implementation. Count, schema, source anchors and unchanged initial context passed. Author reviewed every choice and explanation: all five now assess validation guarantees, resource-limit timing, cancellation scope, cumulative transmission cost or safe structured-error propagation; neither narrow question pattern recurred in this sample.
- Exact generated questions: `.local/question-depth-1792740201072/questions.md`; answer explanations: `followup-answers.md`; per-question assessment and limits: `quality.json`/`quality.md` in the same directory. One sample per prompt version is not a statistical quality/latency comparison; no independent semantic review is claimed. No deployment, push, external test comment or production-data write occurred.

### 2026-10-23 — Production prompt deployment and live application proof

- User explicitly authorized production deployment and verification. Deployed `92dccf7d74567397f91cc77c1c9ccf12d03ceff1` from the same feature branch, including prompt implementations `bc147a1` and `89bbd89`. Baseline production was `d809f56`; only `review.js` and `learning-command.js` differ among 30 runtime modules. Existing 144-unit/56-isolated-integration passing evidence remains applicable; fresh native dependency audit found zero vulnerabilities.
- Independent read-only release review passed. It identified that internal health omits persisted running/publishing counts; the rollout helper now checks queued/running/ready/publishing directly and drains the controller gracefully before replacing the runner. All counts were zero before cutover. Candidate and prior-image module/import checks plus actual runner startup/health passed in network-disabled isolated containers. Activation and rollback Compose plans were validated; no disruptive live rollback drill is claimed.
- Source-only images add about 111KB each over exact existing dependency layers. Replaced controller and runner only, preserving their complete runtime environments, mounts, networks, resource/security/log settings and startup commands. PostgreSQL/n8n/tunnel container identities are unchanged. Both services are healthy, all 30 JavaScript module hashes match the verified candidate in both containers, and standard image aliases now point to the candidate while prior images remain available.
- Actual deployed controller modules → HttpModel RPC → deployed GMS runner generated two basic questions in 51.390 seconds and five advanced questions in 102.448 seconds. Assertions on the actual sent prompts confirm Q1 effect/Q2 application, branch-trivia rejection, the follow-up depth gate, internal-rule rejection and condition → principle → guarantee/risk criteria. Stored-key reveal showed only the initial two questions with zero extra model calls. Final independent evidence/choice/key review found no material error or recurrence of the narrow question patterns in this sample.
- Read-only hashes confirm all 34 target/report records, 136 job/result/command-result records and 176 delivery records match before and after. Historical failed jobs remain 10, with zero queued work and no active controller job; startup logs show GMS and no new errors. Probe source workspaces were removed; no PR/MR test comments or production question records were created. New generation uses the deployed prompts; existing questions and keys are preserved.
- Sanitized evidence: `docs/verification/prompts-production-2026-10-23.json`. Protected rollout/configuration/image and live probe artifacts: `.local/prompts-production-20261023/`; generated question preview: `questions.md` in that directory. Recovery owner is this deployment operator; rollback command: `node .local/prompts-production-20261023/deploy.mjs --rollback` restores prior images, exact prior environments and image aliases without a DB rollback. Trigger on failed health, runtime/configuration drift or new persistent generation failures; target recovery is three minutes. Single-case sampling proves application, not broad quality/latency stability. No Git push or merge was performed.
## Thread-scoped showanswer — 2026-10-23

- `/hey showanswer` accepts no selectors and reveals only the stored questions shown in the trusted question comment of its reply thread. Initial and follow-up batches are separate; a standalone command, stale revision, forged marker or mixed legacy thread receives guidance. Single-question inline threads reveal that one question.
- Follow-up batches open fresh GitLab discussions or GitHub review threads; rename-only GitHub changes use file-level threads. Existing answer-number syntax and stored answer keys remain. No schema migration. Older pending cached reveals request resubmission instead of replaying the former initial-only scope.
- README (Korean/English), help, examples and connection instructions follow the same no-selector contract. GitHub-related work uses no Jira ticket, as requested.
- The release preserves the deployed change-effect/principle-application prompt improvements (`bc147a1`, `89bbd89`) and the rewritten README from `origin/main`.
- Verification: 154 unit tests, 57 disposable-PostgreSQL integration tests, demo generation, README links/anchors, no-selector examples and diff checks passed. New integration drives signed GitLab webhooks, durable batch publication, response-loss reconciliation, restart and distinct initial/follow-up reveals without extra model calls or grades.
- Independent read-only release review passed. Findings about summary-marker collisions and rename-only GitHub publication were fixed and covered by regression checks; the legacy cached-reveal compatibility guard was reviewed separately.
