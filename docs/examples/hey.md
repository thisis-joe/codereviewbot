# `@hey` 답변 예시

실제 GMS(`gpt-6.1-sol`)가 `c3a1367`(GMS Responses API 직접 호출) 변경에 대해 답한 출력입니다. 조회 질문에는 CS 설명 없이 답과 코드 근거만, 설계 질문에는 이유를, 전제가 틀린 질문에는 먼저 전제를 바로잡습니다. 검증 기록: [docs/verification/change-questions-2026-10-27](../verification/change-questions-2026-10-27/README.md)

## 조회

`@hey GMS 어댑터에서 모델이 요청한 파일 읽기는 어떤 코드가 처리하나요?`

\`src/gms\.ts\`의 \`Gms\.run\(\)\`이 모델 응답의 \`function\_call\`을 받아 처리하며, \`read\_file\`은 변경 후 소스의 \`reader\.read\(\)\`, \`read\_base\_file\`은 변경 전 소스의 \`base\.read\(\)\`로 연결합니다\. 실제 파일 읽기는 \`src/source\-reader\.ts\`의 \`RepositoryReader\.read\(\)\`가 경로·파일 조건을 검증한 뒤 수행하고, 민감정보를 가린 내용을 요청한 줄 범위로 반환합니다\. 어댑터는 그 결과를 \`function\_call\_output\`으로 다음 모델 요청에 전달하며, 도구 처리 중 오류가 나면 \`Source request refused or unavailable\` 오류 결과를 전달합니다\.

##### 코드 근거

- [src/gms\.ts:17](https://github.com/thisis-joe/codereviewbot/blob/c3a1367fff593afc14b18f0a23c26a952020606c/src/gms.ts#L17): 소스 스냅샷과 형제 디렉터리인 base에 각각 RepositoryReader를 생성합니다\.
- [src/gms\.ts:46](https://github.com/thisis-joe/codereviewbot/blob/c3a1367fff593afc14b18f0a23c26a952020606c/src/gms.ts#L46): 모델 응답에서 function\_call 항목을 추출합니다\.
- [src/gms\.ts:61](https://github.com/thisis-joe/codereviewbot/blob/c3a1367fff593afc14b18f0a23c26a952020606c/src/gms.ts#L61): 읽기 인수를 검증하고 read\_file과 read\_base\_file을 각각 reader와 base의 read\(\)로 전달합니다\.
- [src/source\-reader\.ts:20](https://github.com/thisis-joe/codereviewbot/blob/c3a1367fff593afc14b18f0a23c26a952020606c/src/source-reader.ts#L20): 경로와 줄 범위를 검증하며, 이어지는 코드에서 일반 파일 여부·크기·실제 경로의 루트 포함 여부를 확인합니다\.
- [src/source\-reader\.ts:23](https://github.com/thisis-joe/codereviewbot/blob/c3a1367fff593afc14b18f0a23c26a952020606c/src/source-reader.ts#L23): readFile로 실제 내용을 읽고 redact를 적용하며, 다음 줄에서 요청한 줄 범위를 반환합니다\.
- [src/gms\.ts:65](https://github.com/thisis-joe/codereviewbot/blob/c3a1367fff593afc14b18f0a23c26a952020606c/src/gms.ts#L65): 도구 처리 오류를 일반화된 오류 결과로 바꾸고, 다음 줄에서 결과를 function\_call\_output으로 대화 입력에 추가합니다\.

명령어 안내: `/hey help`

---

## 설계 이유

`@hey GMS 어댑터가 Responses API에 JSON 스키마를 보내면서도 최종 결과를 로컬 스키마로 다시 검증하는 이유는 뭔가요?`

API에 보내는 JSON 스키마는 출력 형식을 유도하는 역할이고, 로컬 검증은 반환값이 애플리케이션의 실제 계약을 만족하는지 확인하는 최종 관문입니다\. GMS 요청은 \`strict: false\`이며 JSON 스키마 변환에도 \`unrepresentable: 'any'\`를 사용하므로, 원래 Zod 스키마의 검증 조건까지 API가 보장한다고 볼 수 없습니다\.

##### 이유

예를 들어 로컬 스키마에는 선택지 A–D의 순서·중복 여부나 기본 문제 개수처럼 \`refine\`으로 검사하는 조건이 있습니다\. 최종 텍스트를 \`JSON\.parse\`한 뒤 원래 단계별 스키마의 \`parse\`까지 통과해야 반환하므로, JSON 문법이 맞더라도 이런 조건을 어긴 결과는 정상 결과로 넘어가지 않습니다\. 이 방식은 기존 Codex 경로의 로컬 검증을 GMS 직접 호출에서도 유지하며, 검증 비용과 부적합 응답을 실패로 처리하는 대가로 출력 계약을 지킵니다\. JSON 파싱·Zod 검증 오류는 어댑터가 잡아 \`ModelFailure\`로 변환하며, 타임아웃 상태가 아니라면 \`invalid\_output\`으로 분류합니다\.

##### 코드 근거

- [src/gms\.ts:21](https://github.com/thisis-joe/codereviewbot/blob/c3a1367fff593afc14b18f0a23c26a952020606c/src/gms.ts#L21): 단계별 Zod 스키마를 JSON 스키마로 변환하면서 표현 불가능한 요소에 \`unrepresentable: 'any'\`를 적용합니다\.
- [src/gms\.ts:32](https://github.com/thisis-joe/codereviewbot/blob/c3a1367fff593afc14b18f0a23c26a952020606c/src/gms.ts#L32): Responses API에 JSON 스키마를 보내지만 \`strict: false\`로 요청합니다\.
- [src/contracts\.ts:39](https://github.com/thisis-joe/codereviewbot/blob/c3a1367fff593afc14b18f0a23c26a952020606c/src/contracts.ts#L39): 선택지의 A–D 순서와 정규화한 텍스트의 중복 여부를 로컬 \`refine\`으로 검증합니다\.
- [src/contracts\.ts:46](https://github.com/thisis-joe/codereviewbot/blob/c3a1367fff593afc14b18f0a23c26a952020606c/src/contracts.ts#L46): 초기 질문 중 기본 문제 수가 정해진 개수인지 \`refine\`으로 검증합니다\.
- [src/gms\.ts:51](https://github.com/thisis-joe/codereviewbot/blob/c3a1367fff593afc14b18f0a23c26a952020606c/src/gms.ts#L51): 최종 텍스트를 JSON으로 파싱한 후 원래 단계별 스키마로 검증한 값만 반환합니다\.
- [src/gms\.ts:73](https://github.com/thisis-joe/codereviewbot/blob/c3a1367fff593afc14b18f0a23c26a952020606c/src/gms.ts#L73): 파싱·검증 오류를 내부에서 ModelFailure로 변환하고, 타임아웃이 아니면 invalid\_output으로 분류합니다\.
- [src/codex\.ts:47](https://github.com/thisis-joe/codereviewbot/blob/67a2681144795005d2409338adc31bc7b5979bf4/src/codex.ts#L47): 변경 전 Codex 경로도 출력 JSON을 원래 스키마로 로컬 검증한 뒤 반환했습니다\.

##### 확인하지 못한 것

실제 GMS 게이트웨이가 전달된 JSON 스키마를 어느 수준까지 강제하는지는 이 코드만으로 확인할 수 없습니다\.

명령어 안내: `/hey help`

---

## 전제가 틀린 질문

`@hey GMS 응답이 너무 크면 앞부분만 잘라서 파싱하던데, 잘린 JSON은 어떻게 복구하나요?`

**전제와 다른 점**: 앞부분만 잘라서 파싱하는 동작은 없습니다\. 응답 크기가 제한을 넘으면 파싱하지 않고 실패 처리하므로, 잘린 JSON을 복구하는 로직도 없습니다\.

응답 본문을 청크 단위로 읽다가 누적 크기가 2 MiB를 초과하면 즉시 \`ModelFailure\`를 발생시키며, 오류 코드는 \`invalid\_output\`입니다\. 제한 이내에서 끝까지 읽은 응답만 합쳐 JSON으로 파싱합니다\.

##### 이유

이번에 추가된 GMS 구현은 파싱하거나 대화 이력에 넣기 전에 응답 크기를 제한합니다\. 따라서 큰 응답의 일부를 억지로 해석하는 대신 해당 호출을 실패시키며, 최종 답변 텍스트도 512,000바이트를 넘으면 자르지 않고 거부합니다\. 크기가 제한 이내여도 JSON 문법이 잘못됐다면 파싱 중 발생한 \`SyntaxError\`를 \`invalid\_output\`으로 변환합니다\.

##### 코드 근거

- [src/gms\.ts:42](https://github.com/thisis-joe/codereviewbot/blob/c3a1367fff593afc14b18f0a23c26a952020606c/src/gms.ts#L42): 누적 청크 크기가 2 MiB를 초과하면 즉시 invalid\_output을 던지며, 앞부분을 파싱하는 분기가 없습니다\.
- [src/gms\.ts:43](https://github.com/thisis-joe/codereviewbot/blob/c3a1367fff593afc14b18f0a23c26a952020606c/src/gms.ts#L43): 응답 읽기 루프를 완료한 뒤에만 청크를 합쳐 JSON 파싱과 스키마 검증을 수행합니다\.
- [src/gms\.ts:50](https://github.com/thisis-joe/codereviewbot/blob/c3a1367fff593afc14b18f0a23c26a952020606c/src/gms.ts#L50): 최종 답변 텍스트도 512,000바이트 초과 시 잘라내지 않고 invalid\_output으로 거부합니다\.
- [src/gms\.ts:73](https://github.com/thisis-joe/codereviewbot/blob/c3a1367fff593afc14b18f0a23c26a952020606c/src/gms.ts#L73): JSON 파싱의 SyntaxError와 스키마 검증 오류를 invalid\_output으로 변환합니다\.

명령어 안내: `/hey help`
