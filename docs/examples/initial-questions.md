# 최초 질문 예시

실제 GMS가 생성한 문항을 새 서식으로 표시한 예시입니다.

#### hey! 이건 알고 머지하는거지? 😏

#### Q1. Gms.run이 응답 청크의 누적 크기를 Buffer.concat과 JSON 파싱 전에 검사하는 것은 메모리 자원 관리에 어떤 효과가 있나요?

- **A.** 크기 제한을 넘은 응답도 끝까지 모은 뒤 파싱 결과만 폐기한다.
- **B.** 크기 제한을 넘으면 중단하여 큰 응답을 합치고 파싱하는 추가 작업을 막는다.
- **C.** 각 청크의 크기를 개별 검사하므로 작은 청크로 구성된 응답은 계속 누적한다.
- **D.** 크기 제한을 넘은 청크를 버리고 앞부분을 정상 응답으로 파싱한다.

---

#### Q2. Gms.run의 여러 fetch가 같은 AbortSignal을 공유할 때, 도구 실행 뒤 다음 API 요청의 시간 초과 예산은 어떻게 적용되나요?

- **A.** 다음 요청을 보낼 때마다 timeoutMs 전체가 새로 주어진다.
- **B.** 도구 실행 중에는 시간 예산의 소모가 일시 정지된다.
- **C.** 시간 초과 신호는 첫 요청에 적용되고 다음 요청에는 적용되지 않는다.
- **D.** 다음 요청도 신호 생성 시 시작된 공통 시간 예산을 사용한다.

---

답변 달기: `/hey answer Q1 B Q2 C`

정답·해설 보기: `/hey showanswer`

더 풀어보기: `/hey morequestion`

답변 0/2

##### 기준 커밋

- [feat: call GMS Responses API directly \(S15P31E102-83\)](https://github.com/thisis-joe/codereviewbot/commit/c3a1367fff593afc14b18f0a23c26a952020606c)
- [feat: focus initial learning on two core CS questions \(S15P31E102-84\)](https://github.com/thisis-joe/codereviewbot/commit/0a03c54d29d2df8ad34acd7daa67f0bd0025d673)
- [feat: explain CS principles and align follow-up question layout \(S15P31E102-85\)](https://github.com/thisis-joe/codereviewbot/commit/5bf83b22c72bc0a9c148ac7c89914f0cd6ed88ac)

명령어 안내: `/hey help`
