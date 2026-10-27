Automatic question admission occurs only on completed PR/MR merges. Open, reopen,
ready, edit and push events do not generate questions. Accepted merge work may
publish after closure; periodic recovery retries only accepted merge/manual jobs
and never backfills open or historical merged requests. Merge-triggered questions
do not require answers before merging. Manual learning commands remain available.
The greeting is `hey! 이건 알고 머지한거지? 😏`.

# hey question-bot transition contract

Naming update accepted 2026-10-22: the product, comments, package and image names use
`hey`; `/hey` and `@hey` are canonical. Existing command aliases, comment markers,
answer/status history, deployed storage identity and n8n IDs remain compatible.
Base `.hey.yaml` takes precedence over legacy `.codereviewbot.yaml`. No remote
repository/account/domain rename or production deployment is part of this change.

Accepted: 2026-10-21. Base: `2db847897c9c291ce36999ef72e68d759bc9d6c5`.

Authors review code quality while writing code. The bot generates questions about the
actual PR/MR change, grades answers, explains each option and supports code-grounded
follow-up learning. Automatic defect discovery, severity judgments, suggestions,
review summaries, CI reporting and candidate verification leave the automatic path.

## Observable contract

- Initial generation produces exactly two complementary multiple-choice questions that
  act as a merge gate: Q1 asks the effect a reviewer must grasp before approving (behavior,
  guarantee, risk or affected callers/data/operations), and Q2 asks the principle the
  change's correctness most depends on, applied in this change's situation. The same
  concept may support different learning goals; unrelated CS terminology is not required
  for documentation/configuration/data changes, and the identifier-rename test applies.
  These goals are generation instructions, not a deterministic semantic validator.
  Questions are produced in one
  `initial_questions` model call with a 120,000 ms budget per attempt. Each question
  has four distinct A–D choices, a hidden fixed answer key and a valid changed-source
  anchor. Both initial questions must be basic; advanced learning is opt-in.
  Difficulty tags are never displayed.
  Questions and choices come before concise answer/reveal/optional-whatelse hints.
  `/hey whatelse` generates up to five additional questions only on explicit request,
  using the same question-first layout. They go deeper into this change (trade-offs,
  failure boundaries, impact on callers/data/operations/compatibility, how to confirm
  the guarantee); general CS depth belongs to 면접/꼬리. Fewer than five require a
  nonempty reason, shown under the batch; zero becomes a notice. Prompts for Q and 심화
  state every condition one answer needs instead of a length cap, and the validator's
  hunk-line rule. Change-question keys explain the change in one to three sentences:
  behavior before vs after, why it matters and what goes wrong if misread; wrong-option
  notes name the misreading and what the code does, bolding at most two phrases. Feedback shows the correct choice
  as a sentence; option explanations appear on a new, indented line, without
  picked/correct letter comparisons or per-option verdict tags.
  The initial comment starts with `hey! 이건 알고 머지하는거지? 😏`;
  additional batches start directly with their first question, without a batch title.
  Questions use H4 headings; explanation sections use H5 and blank lines.
  Commit references list every reviewed commit title as a separate linked bullet.
  User-facing example previews omit internal reconciliation markers.
- Schema version 2 results display only a commit, generation state, answer progress,
  code-linked questions and one `/hey help` entry point. Old sections 1–3, review
  verdicts, repeated command examples and automatic finding comments disappear.
- `/hey csinterview` picks the two most core CS concepts the pinned change relies on
  (ranked fundamentality > relevance > cost of not knowing > transferability) and asks
  one four-choice question per concept, one layer below the definition. One
  `csinterview` call (120,000 ms per attempt) returns at most two questions with fixed
  keys and valid changed-source anchors; fewer require a nonempty reason and zero
  becomes a notice. Interview keys allow a five-sentence explanation (2,000 chars);
  option notes stay at three sentences and may bold up to two phrases with `**…**`,
  rendered as escaped `<b>` spans with unmatched or clipped markers dropped.
- `/hey morecs` anchors on the latest `csinterview` or `morecs` batch of the revision
  and returns up to four questions: three follow-ups plus one new interview question
  when an uncovered core concept qualifies, otherwise four follow-ups. Output adds
  `kind` (`followup`/`interview`) and `anchor` (an anchor-batch label or null). The
  controller rejects unknown anchors, more than one new interview question, a
  shortfall without a reason, duplicates of any earlier question on the revision, and
  an uncovered 면접 anchor unless a reason is given. Follow-ups are `꼬리N`; a new
  interview question continues `면접N`. morecs batches store `batchKind: "morecs"`
  and `labels`, and every follow-up shows `↳ <anchor>에서 이어짐` in question, grade
  and answer-sheet comments. Without an interview batch it points to csinterview.
- `csinterview`, `morecs` and `whatelse` keep separate five-batch limits per revision.
  Existing stored batches without `batchKind` remain supplementary; old five-question
  interview batches keep their numbers and may anchor morecs. `answer` accepts mixed
  Q/심화/면접/꼬리 labels; a wrong bare letter leads with the stored note for that
  option. Reasoned grading is kind-aware: Q/심화 feedback names whether behavior, reason
  or impact was misread, with code evidence, credits the correct parts and flags a right
  answer for a wrong reason (partial); 면접/꼬리 feedback names the missed concept. A
  keyed grade always shows the stored explanation and option notes, so it matches
  `showanswer`; the model writes only verdict, feedback (up to four sentences) and evidence, and older
  full-explanation outputs are accepted and overridden. Unkeyed legacy questions still
  get model-written explanations. `showanswer` reveals only
  the originating trusted question thread's stored key, without inference or credit.
  Interview and follow-up questions never become merge-gate requirements.
- `/hey help` displays eight commands: `answer`, `showanswer`, `whatelse`, `csinterview`,
  `morecs`, `tryagain`, `@hey` and `help`. It needs no report, snapshot export or model call,
  respects existing permissions and reconciles owned markers.
- `@hey` answers help the asker understand this PR/MR: a wrong premise is corrected
  first, then the answer, why (in terms of this change), path:line evidence rendered as
  code links (locations outside the pinned snapshot are dropped and counted) and what
  stayed unverified. Lookups carry no CS explanation. The payload includes the diff and
  is bounded like learning inputs; replies step down to fit the comment budget.
- Model phases are `answer`, `initial_questions`, `questions`, `csinterview`, `morecs`
  and `grade`; the retired `review`/`verify` phases are no longer admitted.
- `tryagain` regenerates questions on current code, bypassing the same-SHA cache.
  With no newer revision to compare it falls back to full-PR source.
- Removed commands (`full`, `pause`, `resume`, `explain`, `dismiss`, `learn`,
  `approve`, `reject` and the former `review` spelling) return the help hint and
  trigger no code/model/state effects. Pause state and feedback storage are retired;
  repository policy and guide files remain the source of instructions.
- `showanswer` takes no selectors and reveals only questions in the trusted question
  comment of the originating thread, without inference or grade credit. Follow-up
  batches open separate replyable threads (GitLab discussion / GitHub code thread).
  Unscoped, mixed or stale threads receive guidance rather than unrelated answers.
- Question IDs, same-ref history, supplementary numbering, durable grading replies,
  per-option explanations, inline letter replies and opt-in answer merge gates remain.
  The answer gate concerns questions visible in the current summary, not review quality.
- CI webhooks are ignored; already queued CI jobs drain without code preparation,
  model calls or publication. Gate reconciliation remains part of recovery.
- Version 1 cache entries refresh even at identical refs. Legacy ready/publishing
  jobs enqueue versioned replacement generation before posting anything. Recovery
  uses a new versioned delivery key so permanent old delivery deduplication cannot
  suppress migration. Question, answer and report history is retained. The command cleanup removes only
  the obsolete pause column and feedback table with an idempotent migration.
- New pushes and expired leases fence writes. Lost publication responses reconcile
  existing owned markers. Failed/no-source runs explicitly explain unavailability.
- Timing estimates use only version 2 generation measurements. Logs record preparation,
  generation and publication time plus model call count, without model text or secrets.

## Work units and dependencies

| ID | Feature branch | Scope and acceptance |
|---|---|---|
| H1 | `codex/command-help` | deterministic full help; ordinary comments only help hint; authorization, paused/no-report and lost-response tests |
| Q1 | `codex/question-bot` | additive initial-question schema and both CLI/HTTP runner contracts; 3–10 counts and strict output checks |
| Q2 | `codex/question-bot` | one-pass engine, question-only renderer, publication, cache/recovery and CI cutover; core regression checks |
| Q3 | `codex/question-bot` | PostgreSQL transition/restart/cache/ref/gate and timing regression coverage for GitHub and GitLab |
| Q4 | `codex/question-bot` | documentation, concrete fixture previews and full verification evidence |
| A1 | `codex/command-acknowledgements` | organize pending command notices, native edit/delete helpers and lifecycle tests |
| L1 | `codex/failure-diagnostics` | organize pending structured, redacted failure diagnostics and regressions |
| I1 | `codex/question-bot` | integrate A1/L1 with help/grading, preserve local Cloudflare configuration and verify |

Dependency graph: `Q1 → Q2 → Q3 → Q4`; H1 is independent and integrates before Q2.
Follow-up dependency: `(A1, L1, Q4) → I1`. Execution mode is continuous. `docs/progress.md` is the authoritative work ledger;
this contract contains acceptance, not a second mutable task checklist.

## Ownership and validation

The initial transition preserved the original checkout's pending acknowledgement and
operations changes. Follow-up authorization on 2026-10-21 organizes those changes into
A1/L1 feature commits and integrates them into the question-bot branch. After verified
integration, original pending source changes are cleared from main; the exact original
snapshot remains in the integration worktree's ignored local backup. The Cloudflare
`compose.override.yaml` stays byte-identical in the original checkout, excluded only
through repository-local `info/exclude` and never committed.

Integration uses `/Users/Joseph/.codex/worktrees/question-integration/codereviewbot`.
The former question worktree is left on its separately selected live-validation branch.
No Jira task exists; the established repository ruling permits feature-named `codex/`
branches without invented Jira numbers. Use explicit task-owned staging and separate
work-unit commits; do not merge/push main or alter running deployment services.

Required local checks: `npm test`, `npm run test:integration` against a disposable
PostgreSQL database, isolated real CLI/HTTP boundary fixtures, `git diff --check`,
Compose configuration, fixture demo generation and controller/runner image builds.
Independent review covers committed and current unstaged/untracked task changes.

Structural tests prove one generation call and deterministic source/format checks.
They do not prove that a real model always selects the uniquely correct option or
that total latency improves by a particular percentage. Live paired quality/latency
sampling requires an authenticated model run and remains an explicit deployment
validation item when unavailable locally.

Keep historical data and additive contracts for recovery. On a rollout failure,
stop the controller while retaining answer history; repair and retry without
resetting the database. Deploy controller and runner built from the same revision.
