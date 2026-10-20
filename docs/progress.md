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
