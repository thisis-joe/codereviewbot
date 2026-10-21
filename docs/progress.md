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
