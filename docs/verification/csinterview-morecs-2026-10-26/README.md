# /hey csinterview · /hey morecs 실제 모델 검증 (2026-10-26)

## 결론

마지막 8회차(`6e34bfa`)에서 모든 목표를 충족했다. csinterview와 morecs 54문항 기준 핵심·깊이 4.20, 비지엽성 4.78, 학습 가치 5.00이고, 정의 고르기 0, 정답 모호 0이다. 새 `/hey csinterview`만 보면 4.75, 5.00, 5.00이다. 독립 검토자는 54문항 모두에서 정답키와 같은 답을 골랐다.

정의 고르기는 5·6회차 1건, 7회차 2건이었다. 둘 다 질문의 목표·전제 문장이 정답 보기를 그대로 말한 문항이다. 프롬프트 지시만으로는 사라지지 않아, 8회차에서는 문항마다 출제 검사 필드를 필수로 넣고 컨트롤러가 이를 강제했다. 8회차 생성에서 이 검사로 버린 문항은 0건이므로, 개선은 모델이 생성 중 검사를 수행하며 문항을 고친 결과로 보인다. 다만 회차당 실행이 한 번이라 실행 간 변동과 완전히 구분하지는 못했다.

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
| 5·6회차 after | 8 | **4.62** | **5.00** | 4.12 | 5.00 | 4.62 | **5.00** | 4.75 | – | – | 0 | 0 |
| 5·6회차 morecs-1 | 16 | 4.50 | 4.81 | 3.88 | 5.00 | 3.88 | 5.00 | 4.25 | 4.17 | 5.00 | 1 | 0 |
| 5·6회차 morecs-2 | 16 | 3.94 | 4.81 | 3.81 | 4.94 | 4.00 | 5.00 | 4.12 | 4.13 | 4.44 | 0 | 0 |
| 5·6회차 morecs-3 | 16 | 3.62 | 4.94 | 3.50 | 5.00 | 3.75 | 4.94 | 3.38 | 4.06 | 4.06 | 0 | 0 |
| 5·6회차 after+morecs | 56 | 4.11 | 4.88 | 3.79 | 4.98 | 3.98 | 4.98 | 4.04 | 4.12 | 4.50 | 1 | 0 |
| 7회차 after | 8 | 4.88 | 5.00 | 4.50 | 5.00 | 5.00 | 5.00 | 4.62 | – | – | 0 | 0 |
| 7회차 morecs-1 | 16 | 4.25 | 4.81 | 3.94 | 5.00 | 4.12 | 5.00 | 4.44 | 3.92 | 4.94 | 2 | 0 |
| 7회차 morecs-2 | 16 | 4.00 | 4.88 | 4.00 | 5.00 | 4.06 | 5.00 | 4.12 | 4.20 | 4.69 | 0 | 0 |
| 7회차 morecs-3 | 16 | 3.81 | 4.81 | 4.12 | 5.00 | 4.06 | 5.00 | 3.62 | 4.31 | 4.06 | 0 | 0 |
| 7회차 after+morecs | 56 | 4.14 | 4.86 | 4.09 | 5.00 | 4.21 | 5.00 | 4.14 | 4.15 | 4.56 | 2 | 0 |
| **8회차 after** | 8 | **4.75** | **5.00** | 4.00 | 5.00 | 4.88 | **5.00** | 4.88 | – | – | 0 | 0 |
| 8회차 morecs-1 | 16 | 4.44 | 4.81 | 4.12 | 5.00 | 4.25 | 5.00 | 4.25 | 4.23 | 5.00 | 0 | 0 |
| 8회차 morecs-2 | 15 | 4.13 | 4.80 | 3.87 | 5.00 | 4.13 | 5.00 | 4.33 | 3.79 | 4.67 | 0 | 0 |
| 8회차 morecs-3 | 15 | 3.73 | 4.60 | 3.80 | 5.00 | 3.80 | 5.00 | 3.53 | 4.20 | 4.00 | 0 | 0 |
| **8회차 after+morecs** | 54 | **4.20** | **4.78** | 3.94 | 5.00 | 4.19 | **5.00** | 4.17 | 4.07 | 4.57 | **0** | **0** |

최종 프롬프트는 s1·s3이 `8dac8c4`, s2·s4가 `5ca4c32`이다. `5ca4c32`은 근거 위치 규칙 문장만 더했다. morecs의 새 면접 질문 정당성(문항)은 4.40이고, 묶음 구성 판단(3+1/4+0)은 라운드별로 4.50 → 4.00 → 3.50이다.

## 이전·이후 비교

### 표본별 이전·이후 (독립 채점 평균)

네 표본 모두 같은 소스로 이전 프롬프트(before)와 마지막 프롬프트(8회차 after csinterview + morecs 3회 연쇄)를 실제 모델로 실행했다. S4의 before는 2·3회차 호출이 시간 초과와 503으로 실패해 4회차에 받았다. 표본마다 마지막 프롬프트의 핵심·깊이, 비지엽성, 학습 가치가 모두 4 이상이다.

| 표본 | 묶음 (회차) | 문항 | 핵심·깊이 | 비지엽 | 지식+적용 | 오답 품질 | 학습 가치 | 근거 | 정의 고르기 | 모호 |
|---|---|---|---|---|---|---|---|---|---|---|
| s1 | before (2회차, 이전 프롬프트) | 5 | 3.40 | 4.60 | 2.40 | 3.20 | 3.00 | 3.60 | 0 | 0 |
| s1 | after csinterview (8회차) | 2 | 5.00 | 5.00 | 4.50 | 5.00 | 5.00 | 4.50 | 0 | 0 |
| s1 | morecs 1~3 (8회차) | 11 | 4.18 | 4.82 | 3.82 | 4.09 | 5.00 | 4.18 | 0 | 0 |
| s2 | before (2회차, 이전 프롬프트) | 5 | 4.00 | 4.00 | 3.40 | 3.40 | 3.60 | 4.60 | 0 | 0 |
| s2 | after csinterview (8회차) | 2 | 5.00 | 5.00 | 4.00 | 5.00 | 5.00 | 5.00 | 0 | 0 |
| s2 | morecs 1~3 (8회차) | 12 | 4.00 | 4.67 | 3.92 | 3.92 | 5.00 | 3.58 | 0 | 0 |
| s3 | before (2회차, 이전 프롬프트) | 5 | 3.60 | 5.00 | 2.60 | 2.60 | 3.00 | 4.00 | 1 | 0 |
| s3 | after csinterview (8회차) | 2 | 4.50 | 5.00 | 4.00 | 5.00 | 5.00 | 5.00 | 0 | 0 |
| s3 | morecs 1~3 (8회차) | 12 | 4.08 | 4.50 | 4.08 | 4.17 | 5.00 | 4.00 | 0 | 0 |
| s4 | before (4회차, 이전 프롬프트) | 5 | 3.20 | 4.40 | 2.40 | 2.80 | 3.00 | 4.60 | 1 | 0 |
| s4 | after csinterview (8회차) | 2 | 4.50 | 5.00 | 3.50 | 4.50 | 5.00 | 5.00 | 0 | 0 |
| s4 | morecs 1~3 (8회차) | 11 | 4.18 | 5.00 | 3.91 | 4.09 | 5.00 | 4.45 | 0 | 0 |


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
| 4 | 7 | 질문의 목표·조건 문장이 정답 보기를 되풀이하지 않게 하고, 오답 셋도 그 목표를 지킨다고 주장하는 방법이 되게 함(자기 검토 항목 추가) | 5·6회차 독립 채점: s4 꼬리1의 목표 문장 '대상 밖 해설을 공개하지 않음'이 정답 C였음. 사용자가 이 회차와 GMS 호출 추가를 따로 승인함 | 16cabe3 |
| 5 | 8 | 구조적 검사: 문항마다 check{definitionOnlyPick, definitionOnlyReason, stemQuote, giveaway} 필수. 컨트롤러가 pick=정답, 본문에 없는 인용, giveaway=true인 문항을 버리고 사유를 붙임(채우지 않음). 문자열 유사도 검사는 실제 188문항으로 보정한 결과 플래그 5건을 구분하지 못해 넣지 않음 | 7회차 정의 고르기 2건(s3 꼬리2, s4 꼬리2). 프롬프트 문구로는 줄지 않음. 사용자가 구조적 수정과 추가 GMS 호출을 따로 승인함 | 6e34bfa |

Round 2 completed all 4 samples × (before + after + 3 morecs) except S4 before (old prompt timed out at 120 s). GMS 503/unavailable responses occurred on 4 attempts and were absorbed by the application's own retries. morecs durations: 114–200 s.

품질 반복 집계: 목표의 3회 한도 안에서 프롬프트 품질 반복은 `1d63ba9`, `8dac8c4`, `16cabe3` 3회였다. 남은 정의 고르기를 없애기 위한 구조적 수정 `6e34bfa`(5행)와 그 검증 회차는 사용자가 한도를 넘는 추가 작업과 GMS 호출로 따로 승인했다. 120초→240초 예산(`dd6dc37`)과 아래 위치 계약 수정은 실행·계약 결함 수정이며 품질 반복에 넣지 않았다.

추가: 위치 계약 수정 (`5ca4c32`, 품질 반복 아님). 프롬프트는 "읽을 수 있는 유효한 줄"이라고만 했지만, 검증기는 diff hunk 안의 줄만 받는다. 5회차에서 이 차이로 morecs 작업 2건이 3회 시도를 모두 실패했다(s2 `workflow.ts:90/94`, s4 `controller.ts:113`). 문구를 고친 뒤 6회차 s2·s4는 위치 거절 없이 첫 시도에 완료했다.

## 8회차 문항 (마지막, 앵커 포함)

원문 전체: `round8-questions.md`. s1 morecs-3과 s4 morecs-2는 사유와 함께 3문항만 냈다. 플래그 문항은 없다.

| 표본 | 묶음 | 번호 | 앵커 | 개념 (채점자 요약) | 정답 | 핵심·깊이 | 비지엽 | 지식+적용 | 학습 | 근거 | 앵커 적합 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| s1 | after | 면접1 | – | realpath + separator-bounded prefix | B | 5 | 5 | 5 | 5 | 4 | – |
| s1 | after | 면접2 | – | stateful UTF-8 decoding across chunks | C | 5 | 5 | 4 | 5 | 5 | – |
| s1 | morecs-1 | 꼬리1 | 면접1 | TOCTOU: shared lock spanning check to read | B | 5 | 4 | 4 | 5 | 3 | 5 |
| s1 | morecs-1 | 꼬리2 | 면접2 | lossy conversion: strict decoding before U+FFFD | D | 4 | 4 | 5 | 5 | 4 | 5 |
| s1 | morecs-1 | 꼬리3 | 면접2 | incremental decoder still accumulates output | A | 4 | 5 | 4 | 5 | 5 | 4 |
| s1 | morecs-1 | 면접3 | – | partial failure: timeout retry may double-run | C | 5 | 5 | 4 | 5 | 4 | – |
| s1 | morecs-2 | 꼬리4 | 꼬리3 | quadratic re-serialization of growing history | A | 4 | 5 | 4 | 5 | 5 | 3 |
| s1 | morecs-2 | 꼬리5 | 꼬리3 | pre-parse byte cap vs post-hoc size checks | D | 4 | 5 | 3 | 5 | 5 | 4 |
| s1 | morecs-2 | 꼬리6 | 면접3 | fixed deadline minus now incl. tool time | C | 4 | 5 | 3 | 5 | 5 | 3 |
| s1 | morecs-2 | 면접4 | – | runtime validation of tool arguments | B | 4 | 5 | 4 | 5 | 5 | – |
| s1 | morecs-3 | 꼬리7 | 꼬리5 | admission control: slots x M <= P | A | 4 | 5 | 3 | 5 | 3 | 4 |
| s1 | morecs-3 | 꼬리8 | 꼬리6 | slot held until uncancellable tool finishes | D | 4 | 5 | 4 | 5 | 4 | 4 |
| s1 | morecs-3 | 꼬리9 | 면접4 | read budget at the consumption point | C | 4 | 5 | 4 | 5 | 3 | 4 |
| s2 | after | 면접1 | – | lease from executor + conditional save | B | 5 | 5 | 4 | 5 | 5 | – |
| s2 | after | 면접2 | – | atomic + conditional retry UPDATE | D | 5 | 5 | 4 | 5 | 5 | – |
| s2 | morecs-1 | 꼬리1 | 면접1 | shorter lease: faster recovery vs false takeover | C | 4 | 5 | 4 | 5 | 4 | 4 |
| s2 | morecs-1 | 꼬리2 | 면접1 | execution deadline vs heartbeat liveness | B | 5 | 5 | 4 | 5 | 4 | 4 |
| s2 | morecs-1 | 꼬리3 | 면접2 | ABA: generation id in conditional UPDATE | D | 4 | 5 | 4 | 5 | 5 | 5 |
| s2 | morecs-1 | 꼬리4 | 면접2 | crash consistency: file before reference | A | 4 | 5 | 4 | 5 | 4 | 4 |
| s2 | morecs-2 | 꼬리5 | 꼬리1 | DB fencing does not cover external edits | B | 5 | 5 | 4 | 5 | 4 | 3 |
| s2 | morecs-2 | 꼬리6 | 꼬리2 | cooperative scheduling delays both timers | C | 4 | 4 | 4 | 5 | 3 | 4 |
| s2 | morecs-2 | 꼬리7 | 꼬리4 | safe reclamation: lock publish and delete together | D | 4 | 5 | 4 | 5 | 4 | 5 |
| s2 | morecs-2 | 꼬리8 | 꼬리4 | copy-on-write vs in-place atomic replace | A | 4 | 5 | 4 | 5 | 4 | 5 |
| s2 | morecs-3 | 꼬리9 | 꼬리6 | timeout is not cancellation of side effects | B | 4 | 5 | 4 | 5 | 3 | 4 |
| s2 | morecs-3 | 꼬리10 | 꼬리7 | lock span from key lookup to file copy | D | 3 | 5 | 3 | 5 | 2 | 5 |
| s2 | morecs-3 | 꼬리11 | 꼬리7 | connection pool exhaustion; admit before acquiring | C | 4 | 4 | 4 | 5 | 4 | 3 |
| s2 | morecs-3 | 꼬리12 | 꼬리8 | rename durability vs visibility (directory fsync) | A | 3 | 3 | 4 | 5 | 2 | 5 |
| s3 | after | 면접1 | – | unique key + job insert in one transaction | C | 5 | 5 | 4 | 5 | 5 | – |
| s3 | after | 면접2 | – | persistent shared call budget across lineage | B | 4 | 5 | 4 | 5 | 5 | – |
| s3 | morecs-1 | 꼬리1 | 면접1 | registration once is not execution once | B | 5 | 5 | 4 | 5 | 4 | 4 |
| s3 | morecs-1 | 꼬리2 | 면접1 | target lock must span check through insert commit | D | 5 | 5 | 4 | 5 | 4 | 4 |
| s3 | morecs-1 | 꼬리3 | 면접2 | generation cap bounds depth, not width | C | 5 | 5 | 5 | 5 | 5 | 5 |
| s3 | morecs-1 | 면접3 | – | composite index: equality fields then sort keys | A | 4 | 4 | 4 | 5 | 5 | – |
| s3 | morecs-2 | 꼬리4 | 꼬리2 | consistent snapshot across two queries | D | 4 | 4 | 4 | 5 | 4 | 3 |
| s3 | morecs-2 | 꼬리5 | 꼬리2 | ownership check on result save | A | 5 | 5 | 4 | 5 | 5 | 2 |
| s3 | morecs-2 | 꼬리6 | 꼬리3 | jitter is probabilistic, not a rate bound | C | 4 | 5 | 4 | 5 | 4 | 3 |
| s3 | morecs-2 | 꼬리7 | 면접3 | covering index read/write trade-off | B | 3 | 4 | 4 | 5 | 3 | 5 |
| s3 | morecs-3 | 꼬리8 | 꼬리4 | MVCC old-version retention cost | A | 3 | 3 | 4 | 5 | 2 | 5 |
| s3 | morecs-3 | 꼬리9 | 꼬리5 | ABA: owner token per lease acquisition | C | 4 | 5 | 4 | 5 | 5 | 5 |
| s3 | morecs-3 | 꼬리10 | 꼬리6 | polling quantizes jittered times | B | 3 | 4 | 4 | 5 | 4 | 5 |
| s3 | morecs-3 | 꼬리11 | 꼬리6 | queue stability must count retries | D | 4 | 5 | 4 | 5 | 3 | 3 |
| s4 | after | 면접1 | – | provenance + thread relation | B | 5 | 5 | 4 | 5 | 5 | – |
| s4 | after | 면접2 | – | invalidate cached result on rule change | C | 4 | 5 | 3 | 5 | 5 | – |
| s4 | morecs-1 | 꼬리1 | 면접1 | validate all references before publishing | B | 4 | 5 | 4 | 5 | 4 | 3 |
| s4 | morecs-1 | 꼬리2 | 면접2 | re-check narrows but does not close TOCTOU | C | 4 | 5 | 4 | 5 | 5 | 3 |
| s4 | morecs-1 | 꼬리3 | 면접2 | atomic body+version pair | A | 4 | 5 | 4 | 5 | 4 | 5 |
| s4 | morecs-1 | 면접3 | – | uncertain publish: hold until confirmed | D | 5 | 5 | 4 | 5 | 4 | – |
| s4 | morecs-2 | 꼬리4 | 꼬리3 | compare-and-swap first write with success check | D | 5 | 5 | 4 | 5 | 5 | 5 |
| s4 | morecs-2 | 꼬리5 | 면접3 | idempotency key = original command id | B | 4 | 5 | 4 | 5 | 5 | 4 |
| s4 | morecs-2 | 꼬리6 | 면접3 | finite retries cannot guarantee liveness | A | 4 | 5 | 4 | 5 | 4 | 4 |
| s4 | morecs-3 | 꼬리7 | 꼬리4 | DB transaction does not cover external POST | C | 4 | 5 | 4 | 5 | 4 | 3 |
| s4 | morecs-3 | 꼬리8 | 꼬리4 | ambiguous outcome of conditional write; reread | B | 5 | 5 | 4 | 5 | 5 | 5 |
| s4 | morecs-3 | 꼬리9 | 꼬리5 | composite key in scoped ID namespace | A | 3 | 5 | 3 | 5 | 5 | 4 |
| s4 | morecs-3 | 꼬리10 | 꼬리6 | head-of-line blocking: release slot during backoff | D | 4 | 5 | 4 | 5 | 4 | 4 |

## 7회차 문항 (앵커 포함)

원문 전체: `round7-questions.md`. ⚑는 플래그 문항이다(s3 꼬리2, s4 꼬리2: 목표·전제 문장이 정답을 말함).

| 표본 | 묶음 | 번호 | 앵커 | 개념 (채점자 요약) | 정답 | 핵심·깊이 | 비지엽 | 지식+적용 | 학습 | 근거 | 앵커 적합 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| s1 | after | 면접1 | – | realpath + component-wise containment | B | 5 | 5 | 5 | 5 | 4 | – |
| s1 | after | 면접2 | – | shared deadline incl. body reads vs idle timeout | C | 5 | 5 | 5 | 5 | 5 | – |
| s1 | morecs-1 | 꼬리1 | 면접1 | TOCTOU: bind checked object to used object | B | 5 | 5 | 4 | 5 | 4 | 5 |
| s1 | morecs-1 | 꼬리2 | 면접2 | sync parse is not cancelled by network deadline | D | 4 | 4 | 4 | 5 | 4 | 5 |
| s1 | morecs-1 | 꼬리3 | 면접2 | partial failure: timeout may duplicate remote work | A | 5 | 5 | 4 | 5 | 4 | 4 |
| s1 | morecs-1 | 면접3 | – | incremental UTF-8 decoding + byte (not char) cap | C | 5 | 5 | 5 | 5 | 5 | – |
| s1 | morecs-2 | 꼬리4 | 꼬리1 | consistent read needs writers in same sync | B | 3 | 5 | 4 | 5 | 3 | 4 |
| s1 | morecs-2 | 꼬리5 | 꼬리2 | timeout response vs task lifetime (busy slot) | A | 4 | 5 | 4 | 5 | 3 | 4 |
| s1 | morecs-2 | 꼬리6 | 꼬리3 | shorter timeout raises remote concurrency | B | 4 | 5 | 4 | 5 | 4 | 5 |
| s1 | morecs-2 | 꼬리7 | 면접3 | peak memory vs byte cap | D | 4 | 5 | 4 | 5 | 5 | 4 |
| s1 | morecs-3 | 꼬리8 | 꼬리4 | mutual exclusion vs failure atomicity | C | 3 | 5 | 4 | 5 | 2 | 5 |
| s1 | morecs-3 | 꼬리9 | 꼬리5 | check-then-act across await (busy reservation) | A | 5 | 5 | 5 | 5 | 4 | 4 |
| s1 | morecs-3 | 꼬리10 | 꼬리7 | quadratic re-copying vs collect-then-concat | B | 4 | 5 | 4 | 5 | 5 | 4 |
| s1 | morecs-3 | 면접4 | – | runtime schema validation of inner JSON | D | 4 | 5 | 4 | 5 | 5 | – |
| s2 | after | 면접1 | – | DB fencing does not cover external effects | C | 5 | 5 | 5 | 5 | 5 | – |
| s2 | after | 면접2 | – | one transaction vs split autocommits | B | 4 | 5 | 4 | 5 | 5 | – |
| s2 | morecs-1 | 꼬리1 | 면접1 | lease length trade-off without pause bound | B | 4 | 5 | 4 | 5 | 4 | 4 |
| s2 | morecs-1 | 꼬리2 | 면접2 | conditional UPDATE vs READ COMMITTED/lock/mutex | A | 5 | 4 | 5 | 5 | 5 | 4 |
| s2 | morecs-1 | 꼬리3 | 면접2 | atomic publication: file then reference | C | 4 | 5 | 4 | 5 | 3 | 4 |
| s2 | morecs-1 | 면접3 | – | uncertain commit; 0 rows is not proof | D | 5 | 5 | 5 | 5 | 5 | – |
| s2 | morecs-2 | 꼬리4 | 꼬리1 | heartbeat proves updater liveness, not progress | C | 5 | 5 | 4 | 5 | 4 | 4 |
| s2 | morecs-2 | 꼬리5 | 꼬리2 | lock lifetime in long transactions | B | 4 | 4 | 4 | 5 | 3 | 4 |
| s2 | morecs-2 | 꼬리6 | 꼬리3 | safe reclamation: readers hold lock through use | D | 3 | 5 | 4 | 5 | 3 | 5 |
| s2 | morecs-2 | 꼬리7 | 면접3 | ABA: status condition cannot tell failure generations | A | 4 | 5 | 4 | 5 | 5 | 5 |
| s2 | morecs-3 | 꼬리8 | 꼬리4 | cooperative scheduling of CPU work vs lease timer | B | 4 | 4 | 4 | 5 | 3 | 4 |
| s2 | morecs-3 | 꼬리9 | 꼬리4 | timeout vs cancellation: slot release | D | 4 | 5 | 4 | 5 | 3 | 3 |
| s2 | morecs-3 | 꼬리10 | 꼬리5 | lock ordering for multi-row retry | A | 3 | 5 | 3 | 5 | 2 | 4 |
| s2 | morecs-3 | 꼬리11 | 꼬리6 | reader-writer starvation | C | 3 | 5 | 4 | 5 | 2 | 5 |
| s3 | after | 면접1 | – | unique constraint + single transaction | B | 5 | 5 | 4 | 5 | 5 | – |
| s3 | after | 면접2 | – | bounded budget does not prevent remote overlap | D | 5 | 5 | 4 | 5 | 4 | – |
| s3 | morecs-1 | 꼬리1 | 면접1 | phantom insert: lock the target row | C | 5 | 4 | 5 | 5 | 5 | 4 |
| s3 | morecs-1 | 꼬리2 ⚑ | 면접1 | idempotency key scope per planned execution | D | 3 | 5 | 2 | 5 | 5 | 4 |
| s3 | morecs-1 | 꼬리3 | 면접2 | persistent lineage retry budget | A | 4 | 5 | 4 | 5 | 5 | 3 |
| s3 | morecs-1 | 꼬리4 | 면접2 | queue stability: retries vs capacity | B | 4 | 5 | 4 | 5 | 3 | 3 |
| s3 | morecs-2 | 꼬리5 | 꼬리2 | dedup retention vs unbounded redelivery | D | 4 | 4 | 4 | 5 | 4 | 5 |
| s3 | morecs-2 | 꼬리6 | 꼬리3 | monotonic merge; omitted field is not reset | C | 5 | 5 | 4 | 5 | 5 | 5 |
| s3 | morecs-2 | 꼬리7 | 꼬리4 | bounded priority to cap starvation | B | 4 | 5 | 4 | 5 | 4 | 4 |
| s3 | morecs-2 | 면접3 | – | clock skew: compare against same clock | A | 5 | 5 | 5 | 5 | 5 | – |
| s3 | morecs-3 | 꼬리8 | 꼬리6 | lost update; compare-and-swap retry | B | 4 | 5 | 4 | 5 | 3 | 5 |
| s3 | morecs-3 | 꼬리9 | 꼬리7 | non-preemptive: count bound is not time bound | A | 3 | 5 | 4 | 5 | 3 | 5 |
| s3 | morecs-3 | 꼬리10 | 면접3 | monotonic clock across restarts | C | 4 | 4 | 5 | 5 | 4 | 5 |
| s3 | morecs-3 | 면접4 | – | composite index for filtered latest row | D | 4 | 5 | 4 | 5 | 5 | – |
| s4 | after | 면접1 | – | provenance + thread relation via platform metadata | D | 5 | 5 | 4 | 5 | 5 | – |
| s4 | after | 면접2 | – | server-side atomic idempotency key | B | 5 | 5 | 5 | 5 | 4 | – |
| s4 | morecs-1 | 꼬리1 | 면접1 | complete mediation on resume path | C | 4 | 5 | 3 | 5 | 5 | 3 |
| s4 | morecs-1 | 꼬리2 ⚑ | 면접1 | authenticity does not resolve target ambiguity | D | 3 | 5 | 2 | 5 | 5 | 4 |
| s4 | morecs-1 | 꼬리3 | 면접2 | transaction does not cover external API | A | 4 | 5 | 4 | 5 | 4 | 4 |
| s4 | morecs-1 | 면접3 | – | re-check narrows but does not close TOCTOU | B | 4 | 5 | 4 | 5 | 5 | – |
| s4 | morecs-2 | 꼬리4 | 꼬리1 | atomicity of body + verification marker | C | 4 | 5 | 4 | 5 | 4 | 4 |
| s4 | morecs-2 | 꼬리5 | 꼬리2 | composite key with scoped uniqueness | A | 3 | 5 | 3 | 5 | 5 | 3 |
| s4 | morecs-2 | 꼬리6 | 꼬리3 | at-most-once: record-before-effect loses work | D | 4 | 5 | 4 | 5 | 4 | 4 |
| s4 | morecs-2 | 꼬리7 | 면접3 | validation must cover all inputs (base too) | B | 4 | 5 | 4 | 5 | 5 | 3 |
| s4 | morecs-3 | 꼬리8 | 꼬리4 | conditional write 'only if empty' | B | 5 | 5 | 4 | 5 | 5 | 4 |
| s4 | morecs-3 | 꼬리9 | 꼬리5 | list order is not version order | A | 3 | 4 | 4 | 5 | 3 | 4 |
| s4 | morecs-3 | 꼬리10 | 꼬리7 | optimistic concurrency: safety without liveness | C | 4 | 5 | 4 | 5 | 4 | 4 |
| s4 | morecs-3 | 면접4 | – | hash ID collision vs Map collision handling | D | 4 | 5 | 5 | 5 | 5 | – |

## 5·6회차 문항 (앵커 포함)

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

- 전체 GMS 호출 112회 중 99회 성공했다. 실패 13회는 시간 초과 6회와 일시 장애(503 등) 7회이며, 일시 장애는 모두 애플리케이션 재시도로 회복했다. 7회차(18회)와 8회차(16회)는 위치 거절 없이 네 체인을 모두 완료했다. 8회차 출제 검사로 버린 문항은 0건이다.
- 1회차: morecs 120초 예산에서 4문항 앵커 묶음 호출이 3회 모두 시간 초과되어 체인이 멈췄다. 이후 morecs 예산을 240초로 올렸다(`dd6dc37`). 그 뒤 morecs 소요 시간은 95–208초였다.
- 6회차 s2의 csinterview 첫 시도가 120초 예산에서 시간 초과됐고 재시도에서 65초에 끝났다. csinterview 소요 시간은 65–108초로, 120초 예산에 가깝다.
- 근거 위치 거절은 3회차 1건, 5회차 7건(그중 작업 2건 실패)이었다. `5ca4c32` 이후 0건이다.
- 모든 체인에서 섞어 답한 보기 문자 채점(모델 호출 0회)과 해당 스레드 `showanswer`(모델 호출 0회, 채점 기록 없음)가 완료됐다.

## 검증하지 못한 것

- 8회차 목표 충족은 회차당 한 번 실행한 결과다. 출제 검사로 버린 문항이 0건이므로, 개선이 필수 검사 필드의 효과인지 실행 간 변동인지 완전히 구분하지 못했다. 반복 실행으로 정의 고르기 0이 유지되는지는 측정하지 않았다.
- 목표·전제 문장이 정답을 암시하는 약한 사례가 남아 있다(채점자 기준 지식+적용 3: s1 꼬리5·꼬리6, s4 면접2 등).
- morecs-3의 근거(3.53)와 표류 없음(4.00)이 가장 낮다. DB 엔진 내부, 저장 장치 내구성 같은 두 단계 떨어진 확장과 표본 간 반복 주제가 남아 있다. s4 morecs-2의 부족 사유는 이후 회차의 문항과 모순된다.
- 표본은 이 저장소의 변경 4개이고, 다른 언어·도메인의 저장소는 측정하지 않았다.
- 채점은 독립 에이전트 1명과 작성자 확인이며, 사람 면접관이나 다수 평가자의 합의가 아니다.
- Codex와 Claude 공급자의 실제 모델 출력은 검증하지 않았다(스키마와 어댑터는 로컬 가짜 바이너리로 테스트). 출제 검사 필드가 추가되어 출력 토큰과 시간이 늘 수 있으나, 8회차 소요 시간은 기존 예산 안이었다.
- 실제 GitHub/GitLab 댓글 게시와 운영 배포는 하지 않았다.

## 파일

- `runs.json`: 호출별 단계, 상태, 시간, 실패 코드, 명령 결과, 정리 여부
- `scores-round3.json`, `scores-final.json`(5·6회차), `scores-round7.json`, `scores-round8.json`: 문항별 독립 채점과 요약
- `round1-questions.md` … `round8-questions.md`: 회차별 실제 출력 원문
- 평가 기준: `../csinterview-morecs-rubric-2026-10-26.json`
