# 추가 질문과 해설 예시

실제 GMS가 생성한 문항을 새 서식으로 표시한 예시입니다. 아래 커밋 목록은 이 예시에 사용한 세 기능 커밋입니다.

#### 심화1. Gms.run에서 최종 텍스트의 512000바이트 제한과 별도로 응답 스트림에 2MiB 제한을 두는 것은 어떤 자원 보호 효과가 있나요?

- **A.** JSON 파싱을 마친 뒤 생성된 객체의 메모리 크기를 제한합니다.
- **B.** 최종 텍스트 외의 응답 데이터도 파싱 전에 수신량으로 제한합니다.
- **C.** 여러 왕복에서 받은 응답의 합계를 2MiB로 제한합니다.
- **D.** 응답 본문이 커지면 청크를 디스크로 옮겨 메모리를 확보합니다.

---

#### 심화2. Gms.run에서 arguments의 잘못된 JSON과 call_id 누락을 각각 주입하면, 예외 처리 경계에 따라 실패 복구 흐름이 어떻게 달라지나요?

- **A.** 두 오류 모두 해당 도구의 오류 출력으로 변환되어 대화가 계속됩니다.
- **B.** 두 오류 모두 즉시 실행 전체의 invalid_output 실패로 전파됩니다.
- **C.** arguments 오류는 실행을 종료하고 call_id 누락은 도구 오류 출력으로 변환됩니다.
- **D.** arguments 오류는 도구 오류 출력으로 변환되고 call_id 누락은 실행을 종료합니다.

---

#### 심화3. Gms.run에서 각 도구 왕복이 같은 양의 이력을 추가한다면, 크기 한도 내 n회 요청의 누적 input 전송량은 어떤 증가 양상을 보이나요?

- **A.** 전체 이력을 매번 다시 보내므로 n의 제곱에 비례하는 항이 생깁니다.
- **B.** 새로 추가된 이력만 보내므로 n에 비례해 증가합니다.
- **C.** 이전 응답은 서버에만 남으므로 초기 프롬프트 크기로 일정합니다.
- **D.** 매 왕복마다 이력을 두 배로 복제하므로 지수적으로 증가합니다.

---

#### 심화4. Gms.run에서 서로 독립적인 도구 호출 여러 개를 처리할 때, 현재 for문의 await 배치가 병렬 실행과 비교해 만드는 지연 특성은 무엇인가요?

- **A.** 각 도구 작업이 겹쳐 실행되어 가장 느린 작업이 대기 시간을 결정합니다.
- **B.** 첫 도구가 끝나면 나머지 결과를 기다리지 않고 다음 API 요청을 보냅니다.
- **C.** 각 도구 완료 후 다음 도구를 시작하므로 작업 대기 시간이 누적됩니다.
- **D.** 호출 수가 16개 이하이면 런타임이 도구 작업을 자동으로 병렬화합니다.

---

#### 심화5. Gms.run의 HTTP 오류 분류가 scheduleFailure로 전달될 때, 429와 401에 적용되는 자동 복구 정책의 차이는 무엇인가요?

- **A.** 두 상태 모두 같은 지연을 둔 자동 재시도 대상으로 분류됩니다.
- **B.** 429는 지연 재시도 대상으로, 401은 자동 재시도 제외 대상으로 분류됩니다.
- **C.** 429는 자동 재시도에서 제외되고 401은 지연 재시도 대상으로 분류됩니다.
- **D.** 두 상태 모두 Gms.run 내부에서 즉시 같은 HTTP 요청을 재시도합니다.

---

답변 달기: `/hey answer 심화1 B 심화2 C`

정답·해설 보기: `/hey showanswer 심화1 심화2 심화3 심화4 심화5`

더 풀어보기: `/hey morequestion`

##### 기준 커밋

- [feat: call GMS Responses API directly \(S15P31E102-83\)](https://github.com/thisis-joe/codereviewbot/commit/c3a1367fff593afc14b18f0a23c26a952020606c)
- [feat: focus initial learning on two core CS questions \(S15P31E102-84\)](https://github.com/thisis-joe/codereviewbot/commit/0a03c54d29d2df8ad34acd7daa67f0bd0025d673)
- [feat: explain CS principles and align follow-up question layout \(S15P31E102-85\)](https://github.com/thisis-joe/codereviewbot/commit/5bf83b22c72bc0a9c148ac7c89914f0cd6ed88ac)

명령어 안내: `/hey help`

---

## 답변 후 해설 예시

### 심화1 · ✅ 정답

#### 심화1. Gms.run에서 최종 텍스트의 512000바이트 제한과 별도로 응답 스트림에 2MiB 제한을 두는 것은 어떤 자원 보호 효과가 있나요?

내 답: **B** · 정답: **B**

##### 해설

입력 크기 제한은 외부 데이터를 파싱하거나 보관하기 전에 처리량을 제한하는 자원 보호 기법입니다. 최종 결과 크기만 검사하면 그 결과를 추출하기 위해 먼저 읽는 전체 응답은 보호하지 못합니다. 이 코드는 청크 누적 크기가 2MiB를 넘으면 JSON 파싱 전에 실패시키므로 도구 호출 등 최종 텍스트 이외의 응답 데이터에도 제한이 적용됩니다.

##### 보기별 해설

**A.** JSON 파싱을 마친 뒤 생성된 객체의 메모리 크기를 제한합니다. — 검사 대상은 파싱된 객체가 아니라 수신 청크의 바이트 합계이며, 검사는 JSON.parse보다 먼저 수행됩니다.

**B.** 최종 텍스트 외의 응답 데이터도 파싱 전에 수신량으로 제한합니다. (내 답·정답) — 전체 응답 본문의 청크 크기를 검사하므로 최종 output_text뿐 아니라 같은 본문에 포함된 다른 데이터도 제한됩니다.

**C.** 여러 왕복에서 받은 응답의 합계를 2MiB로 제한합니다. — chunks와 size는 왕복 루프 안에서 초기화되므로 2MiB 제한은 각 응답에 적용됩니다.

**D.** 응답 본문이 커지면 청크를 디스크로 옮겨 메모리를 확보합니다. — 청크는 배열에 보관되며, 제한을 초과하면 ModelFailure를 던집니다. 디스크로 옮기는 경로는 없습니다.

##### 코드 근거

- [src/gms.ts:42](https://github.com/thisis-joe/codereviewbot/blob/5bf83b22c72bc0a9c148ac7c89914f0cd6ed88ac/src/gms.ts#L42): 질문이 가리키는 변경 위치

##### 기준 커밋

- [feat: call GMS Responses API directly \(S15P31E102-83\)](https://github.com/thisis-joe/codereviewbot/commit/c3a1367fff593afc14b18f0a23c26a952020606c)
- [feat: focus initial learning on two core CS questions \(S15P31E102-84\)](https://github.com/thisis-joe/codereviewbot/commit/0a03c54d29d2df8ad34acd7daa67f0bd0025d673)
- [feat: explain CS principles and align follow-up question layout \(S15P31E102-85\)](https://github.com/thisis-joe/codereviewbot/commit/5bf83b22c72bc0a9c148ac7c89914f0cd6ed88ac)

명령어 안내: `/hey help`
