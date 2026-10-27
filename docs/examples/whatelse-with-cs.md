# 추가 질문과 해설 예시

실제 GMS가 생성한 문항을 새 서식으로 표시한 예시입니다. 아래 커밋 목록은 이 예시에 사용한 세 기능 커밋입니다.

#### 심화1. Gms.run의 도구 호출에서 arguments의 JSON 손상과 call_id 누락을 각각 주입하면, 실패 격리 범위의 차이를 어떻게 검증해야 하나요?

- **A.** 두 경우 모두 오류 도구 결과를 추가하고 다음 API 요청을 진행한다.
- **B.** arguments의 JSON 손상은 오류 도구 결과로 바뀌지만 call_id 누락은 실행 전체를 invalid_output으로 종료한다.
- **C.** arguments의 JSON 손상은 실행 전체를 종료하지만 call_id 누락은 오류 도구 결과로 바뀐다.
- **D.** 두 경우 모두 unavailable로 분류되어 현재 도구 호출을 즉시 재시도한다.

---

#### 심화2. Gms.run에서 유효한 도구 호출 16개와 17개를 반환하는 테스트는 실행 순서와 배치 상한에 관해 어떤 동작을 검증해야 하나요?

- **A.** 16개는 병렬 실행하고 17개는 앞의 16개만 실행한다.
- **B.** 16개는 순차 실행하고 17개는 두 배치로 나누어 실행한다.
- **C.** 16개는 병렬 실행하고 17개는 도구 실행 전에 전체를 거부한다.
- **D.** 16개는 순차 실행하고 17개는 도구 실행 전에 전체를 거부한다.

---

#### 심화3. Gms.run이 API에 strict: false인 출력 스키마를 전달할 때, 최종 JSON이 phaseSchemas\[phase\]를 위반하는 테스트는 무엇을 확인해야 하나요?

- **A.** 로컬 스키마 검증이 반환을 막고 invalid_output으로 분류하는지 확인한다.
- **B.** API 응답의 status가 completed이면 스키마와 무관하게 반환하는지 확인한다.
- **C.** 유효한 JSON이면 로컬 검증 없이 호출자에게 반환하는지 확인한다.
- **D.** 스키마 위반을 오류 도구 결과로 바꾸어 다음 라운드에 전달하는지 확인한다.

---

#### 심화4. Gms.run의 HTTP 오류 분류를 scheduleFailure와 연결할 때, 응답 본문 취소가 성공한 429와 401은 복구 정책에서 어떻게 달라지나요?

- **A.** 429와 401 모두 Gms.run 내부에서 같은 요청을 즉시 재전송한다.
- **B.** 429는 재시도 시각을 만들지 않고 401은 5분 뒤로 예약한다.
- **C.** 429는 15분 뒤 재시도 시각을 부여받고 401은 재시도 시각을 부여받지 않는다.
- **D.** 429와 401 모두 unavailable로 변환되어 5분 뒤로 예약된다.

---

#### 심화5. Gms.run이 completed 응답에서 유효한 최종 output_text와 function_call을 함께 받으면, 종료 판단과 다음 요청의 대화 이력은 어떻게 처리되나요?

- **A.** output_text를 최종 결과로 반환하고 함께 받은 도구 호출은 실행하지 않는다.
- **B.** 도구를 실행하고 두 출력과 도구 결과를 이력에 유지한 채 다음 라운드로 진행한다.
- **C.** 최종 텍스트와 도구 호출의 공존을 프로토콜 위반으로 판단해 즉시 거부한다.
- **D.** 도구를 실행한 뒤 같은 응답의 output_text를 파싱하여 즉시 반환한다.

---

답변 달기: `/hey answer 심화1 B 심화2 C`

정답·해설 보기: 이 질문 스레드에 답글로 `/hey showanswer`

더 풀어보기: `/hey whatelse`

##### 기준 커밋

- [feat: call GMS Responses API directly \(S15P31E102-83\)](https://github.com/thisis-joe/codereviewbot/commit/c3a1367fff593afc14b18f0a23c26a952020606c)
- [feat: focus initial learning on two core CS questions \(S15P31E102-84\)](https://github.com/thisis-joe/codereviewbot/commit/0a03c54d29d2df8ad34acd7daa67f0bd0025d673)
- [feat: explain CS principles and align follow-up question layout \(S15P31E102-85\)](https://github.com/thisis-joe/codereviewbot/commit/5bf83b22c72bc0a9c148ac7c89914f0cd6ed88ac)

명령어 안내: `/hey help`

---

## 답변 후 해설 예시

### 심화1 · ✅ 정답

#### 심화1. Gms.run의 도구 호출에서 arguments의 JSON 손상과 call_id 누락을 각각 주입하면, 실패 격리 범위의 차이를 어떻게 검증해야 하나요?

arguments의 JSON 손상은 오류 도구 결과로 바뀌지만 call_id 누락은 실행 전체를 invalid_output으로 종료한다.

##### 해설

실패 격리는 예외를 잡는 경계 안의 오류만 국소적으로 처리하는 방식입니다. arguments의 JSON 파싱은 내부 try 안에 있지만 호출 구조 검증은 밖에 있으므로, 전자는 오류 결과로 변환되고 후자의 ZodError는 외부 catch에서 invalid_output으로 변환됩니다.

##### 보기별 해설

- **A.** 두 경우 모두 오류 도구 결과를 추가하고 다음 API 요청을 진행한다.

  > call_id 누락은 55행의 구조 검증에서 실패하므로 내부 catch까지 도달하지 않습니다. 따라서 오류 도구 결과를 추가하는 경로로 복구되지 않습니다.

- **B.** arguments의 JSON 손상은 오류 도구 결과로 바뀌지만 call_id 누락은 실행 전체를 invalid_output으로 종료한다.

  > 문자열 arguments에 잘못된 JSON을 넣으면 58행에서 발생한 예외가 65행에서 처리됩니다. 반면 call_id가 누락되면 55행의 ZodError가 외부 catch로 전파됩니다.

- **C.** arguments의 JSON 손상은 실행 전체를 종료하지만 call_id 누락은 오류 도구 결과로 바뀐다.

  > 내부 try의 범위를 반대로 해석한 설명입니다. JSON.parse\(call.arguments\)는 내부에 있고 call_id를 포함한 호출 구조 파싱은 외부에 있습니다.

- **D.** 두 경우 모두 unavailable로 분류되어 현재 도구 호출을 즉시 재시도한다.

  > 호출 구조의 ZodError는 invalid_output으로 분류되며 도구 인자 파싱 오류는 국소적인 오류 결과가 됩니다. 현재 도구 호출을 즉시 재시도하는 코드도 없습니다.

##### 코드 근거

- [src/gms.ts:55](https://github.com/thisis-joe/codereviewbot/blob/5bf83b22c72bc0a9c148ac7c89914f0cd6ed88ac/src/gms.ts#L55): 질문이 가리키는 변경 위치

##### 기준 커밋

- [feat: call GMS Responses API directly \(S15P31E102-83\)](https://github.com/thisis-joe/codereviewbot/commit/c3a1367fff593afc14b18f0a23c26a952020606c)
- [feat: focus initial learning on two core CS questions \(S15P31E102-84\)](https://github.com/thisis-joe/codereviewbot/commit/0a03c54d29d2df8ad34acd7daa67f0bd0025d673)
- [feat: explain CS principles and align follow-up question layout \(S15P31E102-85\)](https://github.com/thisis-joe/codereviewbot/commit/5bf83b22c72bc0a9c148ac7c89914f0cd6ed88ac)

명령어 안내: `/hey help`
