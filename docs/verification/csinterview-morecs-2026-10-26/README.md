# /hey csinterview · /hey morecs 실제 모델 검증 (2026-10-26)

## 결론

새 `/hey csinterview`는 모든 기준을 충족했다. 핵심·깊이 4.62, 비지엽성 5.00, 학습 가치 5.00이고, 정의 고르기와 정답 모호 문항은 0이다. csinterview와 morecs 최종 묶음 56문항을 합치면 핵심·깊이 4.11, 비지엽성 4.88, 학습 가치 4.98로 평균 목표(4 이상)를 충족하며, 정답 모호 문항도 0이다. 다만 morecs-1의 한 문항(s4 꼬리1)이 이름·정의 고르기로 판정되어 목표 0을 1건 넘었다. 이 문항은 질문의 목표 문장이 정답을 알려 준다. 개선 반복은 3회를 모두 썼다. 위치 계약 문구 수정 1건은 품질 반복과 별도로 기록한다.

## 방법

- 모델: GMS `gpt-6.1-sol`. 로컬 애플리케이션 → `ssh edo1` → `hey-edo1-runner-1`(키는 edo1에만 있음) → `gms.ssafy.io` 경로로 호출했다. 사용자가 승인한 범위는 4개 커밋의 선택 소스와 패치뿐이다. 임시 PostgreSQL을 썼고 외부 댓글이나 운영 데이터는 쓰지 않았다(`runs.json`).
- 표본: 이 저장소의 실제 변경 4개(영역이 서로 다름).
  - s1 `c3a1367`: GMS Responses API 어댑터(네트워크 I/O, 시간 제한, 크기 제한, 신뢰 경계)
  - s2 `2dcf0d9`: 고아 단계 복구와 임대(임대, 조건부 갱신, SQL NULL)
  - s3 `fee3cb6`: 실패한 질문 생성의 재시도 한도(재시도, 중복 제거 키, 최소 한 번 처리)
  - s4 `252d5c8`: 정답 공개 범위를 질문 스레드로 제한(신뢰할 수 없는 입력, 인가 경계)
- 흐름: 표본마다 이전 프롬프트(`25312d1`, 5문항)를 before로 한 번 호출했다. 이어 서명된 웹훅 → 워크플로 단계 API → PostgreSQL → 게시 캡처 경로로 `/hey csinterview`와 `/hey morecs` 3회를 실제 명령 흐름에서 실행했고, 마지막 묶음에는 섞어 답한 키 채점과 스레드 `showanswer`를 실행했다.
- 채점: 생성 전에 고정한 [평가 기준](../csinterview-morecs-rubric-2026-10-26.json)을 썼다. 채점은 이 세션의 판단을 보지 않은 독립 검토 에이전트가 했다. 정답키를 보기 전에 스스로 답을 골라 키와 비교했고(76/76, 56/56 일치), 문항마다 점수를 매겼다(`scores-round3.json`, `scores-final.json`). 작성자는 플래그 문항을 원문으로 확인했다.

커밋 표기: 검증은 다른 세션이 이 체크아웃을 `feat(be)/138-GMS_호출_횟수_절감` 브랜치로 바꾼 상태에서 진행되었다. 따라서 `runs.json`의 `codeUnderTest`에는 그 브랜치의 커밋(`dcd697b`, `9ff18c8`, `0920508`)이 실제로 검증한 트리로 남아 있다. 이 문서의 SHA는 같은 변경을 `codex/csinterview`에 cherry-pick한 커밋이다(`dcd697b`→`1d63ba9`, `9ff18c8`→`8dac8c4`, `0920508`→`5ca4c32`). 차이는 그 브랜치에 있던 GMS 사용량 로깅(동작 변화 없음)뿐이다.

## 평가표 (독립 채점, 1~5)

| 묶음 | 문항 | 핵심·깊이 | 비지엽 | 지식+적용 | 정답 유일 | 오답 품질 | 학습 가치 | 근거 | 앵커 적합 | 표류 없음 | 정의 고르기 | 모호 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| before (이전 프롬프트) | 20 | 3.55 | 4.50 | 2.70 | 4.95 | 3.00 | 3.15 | 4.20 | – | – | 2 | 0 |
| 3회차 after+morecs (`1d63ba9`) | 56 | 3.73 | 4.57 | 3.75 | 4.84 | 3.79 | 4.93 | 3.11 | 4.00 | 3.79 | 0 | 0 |
| **최종 after** | 8 | **4.62** | **5.00** | 4.12 | 5.00 | 4.62 | **5.00** | 4.75 | – | – | 0 | 0 |
| 최종 morecs-1 | 16 | 4.50 | 4.81 | 3.88 | 5.00 | 3.88 | 5.00 | 4.25 | 4.17 | 5.00 | 1 | 0 |
| 최종 morecs-2 | 16 | 3.94 | 4.81 | 3.81 | 4.94 | 4.00 | 5.00 | 4.12 | 4.13 | 4.44 | 0 | 0 |
| 최종 morecs-3 | 16 | 3.62 | 4.94 | 3.50 | 5.00 | 3.75 | 4.94 | 3.38 | 4.06 | 4.06 | 0 | 0 |
| **최종 after+morecs** | 56 | **4.11** | **4.88** | 3.79 | 4.98 | 3.98 | **4.98** | 4.04 | 4.12 | 4.50 | **1** | **0** |

최종 프롬프트는 s1·s3이 `8dac8c4`, s2·s4가 `5ca4c32`이다. `5ca4c32`은 근거 위치 규칙 문장만 더했다. morecs의 새 면접 질문 정당성(문항)은 4.40이고, 묶음 구성 판단(3+1/4+0)은 라운드별로 4.50 → 4.00 → 3.50이다.

## 이전·이후 비교

- 이전 프롬프트는 매번 5문항을 채웠다. 지식+적용 2.70, 오답 품질 3.00이 보여 주듯 허수아비 보기와 전제가 정답을 알려 주는 문항이 많았다. 해설은 결론이 바뀌는 조건을 거의 말하지 않았다(학습 가치 3.15). 정의 고르기도 2건 있었다(s3 일시·영구 오류 구분, s4 안전한 기본값).
- 새 csinterview는 2문항에서 기본기 하나씩을 한 층 아래로 묻는다. 예: 문자열 정규화와 심볼릭 링크를 해석한 실제 경로의 차이, 공통 마감 시각과 요청별·유휴 타임아웃의 차이, 유일 키는 등록을 한 번으로 막지만 실행은 최소 한 번이라는 점, 결과 저장 시 소유권을 조건부로 검사하는 이유. 오답 해설은 혼동한 개념의 이름을 밝히고 핵심을 굵게 표시한다.
- morecs는 3회차에서 라운드가 진행될수록 근거가 3.62 → 2.56 → 2.31로 떨어졌다. 복제, 네트워크 분할, 메시지 인증 같은 변경에 없는 구성 요소를 쌓았기 때문이다. 최종에서는 4.25 → 4.12 → 3.38로 낙폭이 줄었고, 표류 없음 점수도 5.00 → 4.44 → 4.06으로 유지됐다.

## 개선 반복 기록

| # | Round | Change | Why (observed in real outputs) | Commit |
|---|---|---|---|---|
| 0 | 1 | none (first real run, S1 only) | — | 744ca1b/f5fa8b3 |
| 1 | 2 | morecs model budget 120 s → 240 s | S1 morecs-1 took 109 s; morecs-2 timed out at 120 s on all three attempts with a 4-question anchor batch, so the chain stopped | dd6dc37 |
| 2 | 3 | prompt: anchor must be the question whose concept the follow-up deepens; exclude one-formula questions and answers resting on an assumed OS/library facility; a new interview question must beat the remaining follow-ups | round 2: S1 꼬리2/꼬리3 named 면접2 but tested size caps and UTF-8 decoding; S3 면접3 (linear scan) and S4 면접4 (hash map O(M+N)) were solvable by one formula; S4 꼬리10 drifted into hashing arithmetic; S1 꼬리1 relied on an assumed OS facility that blocks root escape | 1d63ba9 |
| 3 | 5 | prompt: follow-up assumptions may change only one condition (failure timing, concurrency, scale, order) of a mechanism the change uses; no new subsystems (replication, partitions, separate caches, MACs, version stores); prefer a new core interview question when remaining follow-ups need such subsystems; no repeated judgment under another anchor; no formal-variant distractors | independent scoring of round 3: after+morecs coreDepth 3.73 (<4), grounding 3.62 → 2.56 → 2.31 and noDrift 4.81 → 3.44 → 3.12 across morecs rounds; s2 꼬리6/꼬리10 and s4 꼬리4 rested on replication, partition and MAC subsystems; dedup retention, lock ordering and retry storms repeated across anchors; 4+0 chosen after drift | 8dac8c4 |

Round 2 completed all 4 samples × (before + after + 3 morecs) except S4 before (old prompt timed out at 120 s). GMS 503/unavailable responses occurred on 4 attempts and were absorbed by the application's own retries. morecs durations: 114–200 s.

추가: 위치 계약 수정 (`5ca4c32`, 품질 반복 아님). 프롬프트는 "읽을 수 있는 유효한 줄"이라고만 했지만, 검증기는 diff hunk 안의 줄만 받는다. 5회차에서 이 차이로 morecs 작업 2건이 3회 시도를 모두 실패했다(s2 `workflow.ts:90/94`, s4 `controller.ts:113`). 문구를 고친 뒤 6회차 s2·s4는 위치 거절 없이 첫 시도에 완료했다.

## 최종 문항 (앵커 포함)

원문 전체(질문, 보기, 해설, 보기별 해설)는 `round5-questions.md`(s1·s3)와 `round6-questions.md`(s2·s4)에 있다. 아래 개념 요약은 채점자가 쓴 것이다. ⚑는 플래그 문항이다.

| 표본 | 묶음 | 번호 | 앵커 | 개념 (채점자 요약) | 정답 | 핵심·깊이 | 비지엽 | 지식+적용 | 학습 | 근거 | 앵커 적합 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| s1 | after | 면접1 | – | symlink-resolved containment; read-only is not confidentiality | B | 5 | 5 | 4 | 5 | 4 | – |
| s1 | after | 면접2 | – | end-to-end deadline vs T/N split vs idle timeout | D | 5 | 5 | 5 | 5 | 5 | – |
| s1 | morecs-1 | 꼬리1 | 면접1 | TOCTOU: validate the opened object, not the path | C | 5 | 4 | 4 | 5 | 4 | 5 |
| s1 | morecs-1 | 꼬리2 | 면접2 | cooperative cancellation of sync parse | A | 4 | 4 | 4 | 5 | 4 | 5 |
| s1 | morecs-1 | 꼬리3 | 면접2 | partial failure: local cancel vs remote overlap | D | 5 | 5 | 4 | 5 | 4 | 4 |
| s1 | morecs-1 | 면접3 | – | incremental UTF-8 decoding | B | 5 | 5 | 4 | 5 | 5 | – |
| s1 | morecs-2 | 꼬리4 | 꼬리1 | consistent snapshot under in-place modification | C | 3 | 5 | 4 | 5 | 3 | 4 |
| s1 | morecs-2 | 꼬리5 | 꼬리3 | bounded retries + backoff after timeout | B | 4 | 5 | 3 | 5 | 4 | 4 |
| s1 | morecs-2 | 꼬리6 | 면접3 | message framing: decoding vs JSON parsing units | A | 4 | 5 | 4 | 5 | 5 | 5 |
| s1 | morecs-2 | 면접4 | – | quadratic copying vs collect-then-concat | D | 4 | 5 | 4 | 5 | 5 | – |
| s1 | morecs-3 | 꼬리7 | 꼬리4 | isolation scope across multiple tool calls | D | 3 | 5 | 3 | 5 | 3 | 4 |
| s1 | morecs-3 | 꼬리8 | 꼬리5 | independent jitter | A | 4 | 5 | 3 | 5 | 4 | 5 |
| s1 | morecs-3 | 꼬리9 | 면접4 | amortized vs worst-case cost of doubling buffer | B | 4 | 5 | 5 | 5 | 4 | 5 |
| s1 | morecs-3 | 꼬리10 | 면접4 | peak live memory vs input byte cap | C | 4 | 5 | 4 | 5 | 5 | 4 |
| s2 | after | 면접1 | – | lease from executor + atomic fencing on write | C | 5 | 5 | 4 | 5 | 5 | – |
| s2 | after | 면접2 | – | checkpoint validity: durable reference vs live artifact | B | 4 | 5 | 4 | 5 | 5 | – |
| s2 | morecs-1 | 꼬리1 | 면접1 | heartbeat proves liveness of updater, not progress | D | 5 | 5 | 5 | 5 | 4 | 5 |
| s2 | morecs-1 | 꼬리2 | 면접2 | atomic state+checkpoint reset invariant | C | 4 | 5 | 3 | 5 | 5 | 4 |
| s2 | morecs-1 | 꼬리3 | 면접2 | crash consistency: data before reference | B | 4 | 5 | 4 | 5 | 3 | 4 |
| s2 | morecs-1 | 면접3 | – | idempotent publish by logical comment identity | A | 5 | 5 | 4 | 5 | 4 | – |
| s2 | morecs-2 | 꼬리4 | 꼬리1 | failure detector: timely recovery vs no false expiry | A | 4 | 4 | 4 | 5 | 4 | 4 |
| s2 | morecs-2 | 꼬리5 | 꼬리2 | compare-and-swap conditional retry | C | 5 | 5 | 4 | 5 | 5 | 4 |
| s2 | morecs-2 | 꼬리6 | 꼬리3 | TOCTOU in workspace cleanup | D | 4 | 5 | 3 | 5 | 4 | 3 |
| s2 | morecs-2 | 꼬리7 | 면접3 | check-then-act: critical section must cover create | B | 4 | 5 | 4 | 5 | 3 | 5 |
| s2 | morecs-3 | 꼬리8 | 꼬리5 | ABA with execution identifier | B | 4 | 5 | 3 | 5 | 3 | 5 |
| s2 | morecs-3 | 꼬리9 | 꼬리6 | lock ordering | A | 3 | 5 | 2 | 4 | 3 | 3 |
| s2 | morecs-3 | 꼬리10 | 꼬리6 | transaction boundary: file deletes are not rolled back | C | 4 | 5 | 4 | 5 | 4 | 4 |
| s2 | morecs-3 | 꼬리11 | 꼬리7 | lock granularity keyed by contended resource | D | 3 | 5 | 3 | 5 | 2 | 5 |
| s3 | after | 면접1 | – | dedup key scope: prior failure + attempt | B | 5 | 5 | 5 | 5 | 5 | – |
| s3 | after | 면접2 | – | persistent lineage retry budget | D | 4 | 5 | 4 | 5 | 5 | – |
| s3 | morecs-1 | 꼬리1 | 면접1 | failure atomicity of key + job | A | 5 | 5 | 4 | 5 | 4 | 5 |
| s3 | morecs-1 | 꼬리2 | 면접1 | phantom insert: lock the target key, not rows | C | 5 | 4 | 5 | 5 | 5 | 4 |
| s3 | morecs-1 | 꼬리3 | 면접2 | starvation under strict priority | B | 4 | 5 | 4 | 5 | 4 | 4 |
| s3 | morecs-1 | 면접3 | – | partial failure: timeout retry may double-execute | D | 5 | 5 | 4 | 5 | 4 | – |
| s3 | morecs-2 | 꼬리4 | 꼬리1 | uncertain commit outcome: retry with same key | B | 5 | 5 | 5 | 5 | 5 | 5 |
| s3 | morecs-2 | 꼬리5 | 꼬리2 | snapshot isolation: lock does not refresh snapshot | D | 4 | 3 | 4 | 5 | 3 | 5 |
| s3 | morecs-2 | 꼬리6 | 꼬리3 | queue stability vs fairness under overload | C | 3 | 5 | 4 | 5 | 3 | 4 |
| s3 | morecs-2 | 꼬리7 | 면접3 | conditional write fencing | A | 5 | 5 | 3 | 5 | 5 | 3 |
| s3 | morecs-3 | 꼬리8 | 꼬리5 | lock ordering | A | 3 | 5 | 3 | 5 | 3 | 2 |
| s3 | morecs-3 | 꼬리9 | 꼬리6 | bursty arrivals vs average rate | B | 3 | 4 | 4 | 5 | 2 | 5 |
| s3 | morecs-3 | 꼬리10 | 꼬리6 | admission control with bounded storage | D | 3 | 5 | 3 | 5 | 2 | 4 |
| s3 | morecs-3 | 꼬리11 | 꼬리7 | ABA on reused owner name | C | 4 | 5 | 4 | 5 | 5 | 5 |
| s4 | after | 면접1 | – | provenance vs copied markers | B | 5 | 5 | 4 | 5 | 5 | – |
| s4 | after | 면접2 | – | TOCTOU between version check and comment create | D | 4 | 5 | 3 | 5 | 4 | – |
| s4 | morecs-1 | 꼬리1 ⚑ | 면접1 | fail-safe default on ambiguous target | C | 3 | 5 | 2 | 5 | 5 | 3 |
| s4 | morecs-1 | 꼬리2 | 면접1 | complete mediation for stored results after policy change | D | 4 | 5 | 3 | 5 | 5 | 3 |
| s4 | morecs-1 | 꼬리3 | 면접2 | optimistic concurrency: safety without liveness | A | 4 | 5 | 4 | 5 | 4 | 4 |
| s4 | morecs-1 | 면접3 | – | lost response: check before re-posting | B | 5 | 5 | 4 | 5 | 4 | – |
| s4 | morecs-2 | 꼬리4 | 꼬리1 | entity identity vs value equality | A | 3 | 5 | 3 | 5 | 5 | 3 |
| s4 | morecs-2 | 꼬리5 | 꼬리3 | admission control: queue does not remove overload | C | 3 | 5 | 4 | 5 | 3 | 4 |
| s4 | morecs-2 | 꼬리6 | 면접3 | check-then-act needs atomic create | B | 4 | 5 | 4 | 5 | 4 | 5 |
| s4 | morecs-2 | 꼬리7 | 면접3 | idempotency key = original command identity | D | 4 | 5 | 4 | 5 | 5 | 4 |
| s4 | morecs-3 | 꼬리8 | 꼬리4 | streaming uniqueness with O(1) state | C | 3 | 5 | 4 | 5 | 4 | 4 |
| s4 | morecs-3 | 꼬리9 | 꼬리4 | fail-closed on partial query failure | A | 4 | 5 | 3 | 5 | 4 | 3 |
| s4 | morecs-3 | 꼬리10 | 꼬리5 | starvation: FIFO across kinds | D | 4 | 5 | 4 | 5 | 2 | 3 |
| s4 | morecs-3 | 꼬리11 | 꼬리6 | lease expiry does not cancel in-flight request | B | 5 | 5 | 4 | 5 | 4 | 4 |

## 이전 프롬프트 문항 (before)

원문: `round2-questions.md`(s1–s3), `round4-questions.md`(s4).

| 표본 | 번호 | 개념 (채점자 요약) | 정답 | 핵심·깊이 | 비지엽 | 지식+적용 | 오답 | 학습 | 플래그 |
|---|---|---|---|---|---|---|---|---|---|
| s1 | 이전 면접1 | resource bounding by received bytes | B | 4 | 5 | 3 | 4 | 3 |  |
| s1 | 이전 면접2 | deadline vs per-call timeout (AbortSignal) | D | 4 | 4 | 3 | 4 | 3 |  |
| s1 | 이전 면접3 | runtime validation vs type assertion | A | 3 | 5 | 2 | 3 | 3 |  |
| s1 | 이전 면접4 | least privilege for tool executor | C | 3 | 4 | 2 | 3 | 3 |  |
| s1 | 이전 면접5 | correlation identifier | B | 3 | 5 | 2 | 2 | 3 |  |
| s2 | 이전 면접1 | heartbeat must come from the executor | B | 4 | 5 | 3 | 3 | 3 |  |
| s2 | 이전 면접2 | TOCTOU: ownership in UPDATE predicate | D | 5 | 5 | 4 | 4 | 4 |  |
| s2 | 이전 면접3 | checkpoint validity depends on artifacts | A | 3 | 4 | 2 | 2 | 3 |  |
| s2 | 이전 면접4 | SQL three-valued logic and IS NULL | C | 4 | 4 | 4 | 4 | 4 |  |
| s2 | 이전 면접5 | PostgreSQL READ COMMITTED UPDATE re-evaluation | B | 4 | 2 | 4 | 4 | 4 |  |
| s3 | 이전 면접1 | unique constraint + atomic insert for idempotency | B | 5 | 5 | 4 | 4 | 3 |  |
| s3 | 이전 면접2 | persisted retry budget across job lineage | D | 4 | 5 | 3 | 3 | 3 |  |
| s3 | 이전 면접3 | non-negative jitter | A | 3 | 5 | 3 | 3 | 3 |  |
| s3 | 이전 면접4 | transient vs permanent errors | C | 3 | 5 | 1 | 1 | 3 | bare-definition |
| s3 | 이전 면접5 | checkpoint-based resume | B | 3 | 5 | 2 | 2 | 3 |  |
| s4 | 이전 면접1 | provenance vs format validation | C | 4 | 5 | 3 | 3 | 3 |  |
| s4 | 이전 면접2 | composite key with namespace | A | 3 | 5 | 2 | 3 | 3 |  |
| s4 | 이전 면접3 | fail-safe default on ambiguous scope | D | 2 | 4 | 1 | 2 | 3 | bare-definition |
| s4 | 이전 면접4 | semantic compatibility of stored results | B | 4 | 4 | 3 | 3 | 3 |  |
| s4 | 이전 면접5 | ordered tuple as cache key | C | 3 | 4 | 3 | 3 | 3 |  |

## 실행 기록과 실패

- 전체 GMS 호출 78회 중 67회 성공했다. 실패 11회는 시간 초과 6회와 일시 장애(503 등) 5회이며, 일시 장애는 모두 애플리케이션 재시도로 회복했다.
- 1회차: morecs 120초 예산에서 4문항 앵커 묶음 호출이 3회 모두 시간 초과되어 체인이 멈췄다. 이후 morecs 예산을 240초로 올렸다(`dd6dc37`). 그 뒤 morecs 소요 시간은 95–208초였다.
- 6회차 s2의 csinterview 첫 시도가 120초 예산에서 시간 초과됐고 재시도에서 65초에 끝났다. csinterview 소요 시간은 65–108초로, 120초 예산에 가깝다.
- 근거 위치 거절은 3회차 1건, 5회차 7건(그중 작업 2건 실패)이었다. `5ca4c32` 이후 0건이다.
- 모든 체인에서 섞어 답한 보기 문자 채점(모델 호출 0회)과 해당 스레드 `showanswer`(모델 호출 0회, 채점 기록 없음)가 완료됐다.

## 검증하지 못한 것

- 표본은 이 저장소의 변경 4개이고 표본마다 실행은 한 번이다. 다른 언어·도메인의 저장소나 반복 실행에 따른 변동은 측정하지 않았다.
- 채점은 독립 에이전트 1명과 작성자 확인이며, 사람 면접관이나 다수 평가자의 합의가 아니다.
- 반복 한도 때문에 최종 프롬프트로 남은 약점을 다시 고치지 않았다. 정의 고르기 1건(s4 꼬리1, 목표 문장이 정답을 노출), morecs-3의 근거 3.38, 잠금 순서·과부하 꼬리 질문의 약한 오답, 표본 간 반복 주제(부분 실패, 잠금 순서, 우선순위 기아)가 남아 있다.
- 최종 프롬프트는 s1·s3과 s2·s4에서 커밋이 다르다(차이는 위치 규칙 문장뿐). 같은 커밋으로 네 표본을 모두 다시 돌리지는 않았다.
- Codex와 Claude 공급자의 실제 모델 출력은 검증하지 않았다(스키마와 어댑터는 로컬 가짜 바이너리로 테스트).
- 실제 GitHub/GitLab 댓글 게시와 운영 배포는 하지 않았다.

## 파일

- `runs.json`: 호출별 단계, 상태, 시간, 실패 코드, 명령 결과, 정리 여부
- `scores-round3.json`, `scores-final.json`: 문항별 독립 채점과 요약
- `round1-questions.md` … `round6-questions.md`: 회차별 실제 출력 원문
- 평가 기준: `../csinterview-morecs-rubric-2026-10-26.json`
