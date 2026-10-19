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
- Deferred evidence: live Codex inference quality, real GitHub/GitLab permissions/comment
  rendering, DNS/tunnel and external webhook delivery. No successful live review claimed.
