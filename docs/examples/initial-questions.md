# 최초 질문 예시

실제 GMS가 생성한 문항을 새 서식으로 표시한 예시입니다.

#### hey! 이건 알고 머지하는거지? 😏

#### Q1. [심화] Gms.run이 API에 도구 스키마를 보내고도 호출 인자를 로컬에서 검증해 RepositoryReader로 실행하는 것은 어떤 신뢰 경계를 위한 것인가요?

- **A.** API에 전달한 스키마가 로컬 파일 접근 권한을 대신 집행하게 한다.
- **B.** 저장소에 적힌 지시문에 따라 실행 가능한 도구를 확장한다.
- **C.** 외부 모델의 요청을 허용된 도구·인자와 스냅샷 접근 범위로 제한한다.
- **D.** JSON으로 해석되는 인자는 경로 검증 없이 파일 읽기에 사용한다.

---

#### Q2. [심화] Gms.run이 여러 도구 왕복에 하나의 AbortSignal.timeout을 공유할 때, 라운드마다 신호를 새로 만드는 방식과 HTTP 시간 예산이 어떻게 달라지나요?

- **A.** 후속 HTTP 요청도 최초 신호 생성 시점부터 흐른 시간 예산을 공유한다.
- **B.** 각 HTTP 요청을 시작할 때 timeoutMs만큼의 시간 예산이 새로 주어진다.
- **C.** RepositoryReader 실행 중에는 신호의 시간 예산이 일시 정지된다.
- **D.** 시간 예산이 끝난 HTTP 요청은 새 신호로 자동 재시도된다.

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
