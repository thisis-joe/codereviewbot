# /hey morequestion 출력 예시

GMS 전환 코드에서 실제 GMS API로 생성한 추가 질문 5개입니다. 초기 질문 2개를 전달해 이미 나온 질문을 제외했습니다. 1안과 같이 질문·보기 다음에 명령을 안내합니다. 아래는 로컬 렌더러 출력이며 실제 PR/MR에 게시하지 않았습니다.

<!-- codereviewbot:reply:issue-more-example -->
### 심화 질문 5개

<!-- codereviewbot:question:Q-90616c61ad4e -->
#### 심화1. Gms\.run에서 최종 텍스트의 512000바이트 제한과 별도로 응답 스트림에 2MiB 제한을 두는 것은 어떤 자원 보호 효과가 있나요?
&nbsp;&nbsp;&nbsp;&nbsp;**A.** JSON 파싱을 마친 뒤 생성된 객체의 메모리 크기를 제한합니다\.\
&nbsp;&nbsp;&nbsp;&nbsp;**B.** 최종 텍스트 외의 응답 데이터도 파싱 전에 수신량으로 제한합니다\.\
&nbsp;&nbsp;&nbsp;&nbsp;**C.** 여러 왕복에서 받은 응답의 합계를 2MiB로 제한합니다\.\
&nbsp;&nbsp;&nbsp;&nbsp;**D.** 응답 본문이 커지면 청크를 디스크로 옮겨 메모리를 확보합니다\.

---

<!-- codereviewbot:question:Q-bf509062b383 -->
#### 심화2. Gms\.run에서 arguments의 잘못된 JSON과 call\_id 누락을 각각 주입하면, 예외 처리 경계에 따라 실패 복구 흐름이 어떻게 달라지나요?
&nbsp;&nbsp;&nbsp;&nbsp;**A.** 두 오류 모두 해당 도구의 오류 출력으로 변환되어 대화가 계속됩니다\.\
&nbsp;&nbsp;&nbsp;&nbsp;**B.** 두 오류 모두 즉시 실행 전체의 invalid\_output 실패로 전파됩니다\.\
&nbsp;&nbsp;&nbsp;&nbsp;**C.** arguments 오류는 실행을 종료하고 call\_id 누락은 도구 오류 출력으로 변환됩니다\.\
&nbsp;&nbsp;&nbsp;&nbsp;**D.** arguments 오류는 도구 오류 출력으로 변환되고 call\_id 누락은 실행을 종료합니다\.

---

<!-- codereviewbot:question:Q-47c927dfc28c -->
#### 심화3. Gms\.run에서 각 도구 왕복이 같은 양의 이력을 추가한다면, 크기 한도 내 n회 요청의 누적 input 전송량은 어떤 증가 양상을 보이나요?
&nbsp;&nbsp;&nbsp;&nbsp;**A.** 전체 이력을 매번 다시 보내므로 n의 제곱에 비례하는 항이 생깁니다\.\
&nbsp;&nbsp;&nbsp;&nbsp;**B.** 새로 추가된 이력만 보내므로 n에 비례해 증가합니다\.\
&nbsp;&nbsp;&nbsp;&nbsp;**C.** 이전 응답은 서버에만 남으므로 초기 프롬프트 크기로 일정합니다\.\
&nbsp;&nbsp;&nbsp;&nbsp;**D.** 매 왕복마다 이력을 두 배로 복제하므로 지수적으로 증가합니다\.

---

<!-- codereviewbot:question:Q-40d86afd3ce9 -->
#### 심화4. Gms\.run에서 서로 독립적인 도구 호출 여러 개를 처리할 때, 현재 for문의 await 배치가 병렬 실행과 비교해 만드는 지연 특성은 무엇인가요?
&nbsp;&nbsp;&nbsp;&nbsp;**A.** 각 도구 작업이 겹쳐 실행되어 가장 느린 작업이 대기 시간을 결정합니다\.\
&nbsp;&nbsp;&nbsp;&nbsp;**B.** 첫 도구가 끝나면 나머지 결과를 기다리지 않고 다음 API 요청을 보냅니다\.\
&nbsp;&nbsp;&nbsp;&nbsp;**C.** 각 도구 완료 후 다음 도구를 시작하므로 작업 대기 시간이 누적됩니다\.\
&nbsp;&nbsp;&nbsp;&nbsp;**D.** 호출 수가 16개 이하이면 런타임이 도구 작업을 자동으로 병렬화합니다\.

---

<!-- codereviewbot:question:Q-ff776a381ff0 -->
#### 심화5. Gms\.run의 HTTP 오류 분류가 scheduleFailure로 전달될 때, 429와 401에 적용되는 자동 복구 정책의 차이는 무엇인가요?
&nbsp;&nbsp;&nbsp;&nbsp;**A.** 두 상태 모두 같은 지연을 둔 자동 재시도 대상으로 분류됩니다\.\
&nbsp;&nbsp;&nbsp;&nbsp;**B.** 429는 지연 재시도 대상으로, 401은 자동 재시도 제외 대상으로 분류됩니다\.\
&nbsp;&nbsp;&nbsp;&nbsp;**C.** 429는 자동 재시도에서 제외되고 401은 지연 재시도 대상으로 분류됩니다\.\
&nbsp;&nbsp;&nbsp;&nbsp;**D.** 두 상태 모두 Gms\.run 내부에서 즉시 같은 HTTP 요청을 재시도합니다\.

---

답변 달기: `/hey answer 심화1 B 심화2 C`\
정답·해설 보기: `/hey showanswer 심화1 심화2 심화3 심화4 심화5`\
더 풀어보기: `/hey morequestion`

기준 커밋 [c3a1367](https://github.com/thisis-joe/codereviewbot/commit/c3a1367)\
명령어 안내: `/hey help`

---

<details>
<summary>심화1에 답했을 때의 CS 해설 예시</summary>

답변 명령: `/hey answer 심화1 B`

<!-- codereviewbot:reply:answer-example -->
<!-- codereviewbot:question:Q-90616c61ad4e -->
### 심화1 · ✅ 정답

**심화1. Gms\.run에서 최종 텍스트의 512000바이트 제한과 별도로 응답 스트림에 2MiB 제한을 두는 것은 어떤 자원 보호 효과가 있나요?**

내 답: **B** · 정답: **B**

**CS 지식과 코드 적용**
입력 크기 제한은 외부 데이터를 파싱하거나 보관하기 전에 처리량을 제한하는 자원 보호 기법입니다\. 최종 결과 크기만 검사하면 그 결과를 추출하기 위해 먼저 읽는 전체 응답은 보호하지 못합니다\. 이 코드는 청크 누적 크기가 2MiB를 넘으면 JSON 파싱 전에 실패시키므로 도구 호출 등 최종 텍스트 이외의 응답 데이터에도 제한이 적용됩니다\.

**보기별 해설**

**A.** JSON 파싱을 마친 뒤 생성된 객체의 메모리 크기를 제한합니다\. — 검사 대상은 파싱된 객체가 아니라 수신 청크의 바이트 합계이며, 검사는 JSON\.parse보다 먼저 수행됩니다\.

**B.** 최종 텍스트 외의 응답 데이터도 파싱 전에 수신량으로 제한합니다\. (내 답·정답) — 전체 응답 본문의 청크 크기를 검사하므로 최종 output\_text뿐 아니라 같은 본문에 포함된 다른 데이터도 제한됩니다\.

**C.** 여러 왕복에서 받은 응답의 합계를 2MiB로 제한합니다\. — chunks와 size는 왕복 루프 안에서 초기화되므로 2MiB 제한은 각 응답에 적용됩니다\.

**D.** 응답 본문이 커지면 청크를 디스크로 옮겨 메모리를 확보합니다\. — 청크는 배열에 보관되며, 제한을 초과하면 ModelFailure를 던집니다\. 디스크로 옮기는 경로는 없습니다\.

**코드 근거**
- [src/gms\.ts:42](https://github.com/thisis-joe/codereviewbot/blob/c3a1367/src/gms.ts#L42): 질문이 가리키는 변경 위치

기준 커밋: c3a1367\
명령어 안내: `/hey help`

</details>
