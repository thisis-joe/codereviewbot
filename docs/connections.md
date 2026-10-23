# 외부 연결 가이드 — 나중에 진행

실제 연결·인증은 아직 수행하지 않는다. 아래 절차는 운영자가 연결할 때 사용한다.
토큰과 개인 키는 `.env` 또는 `.local/secrets`에만 넣고 커밋하지 않는다.

## 1. 질문 생성 엔진 선택과 로그인

`.env`의 `MODEL_PROVIDER`로 엔진을 고른다. `gms`(기본값), `codex` 또는 `claude`.
엔진마다 계정 로그인과 API 키 중 하나를 쓴다. API 키는 `*_BASE_URL`로 호환 프록시(예: GMS)를 지정할 수 있다.
값을 바꾼 뒤 `docker compose up -d --force-recreate runner`로 다시 읽는다. 실행기 로그의 `provider`로 적용 여부를 확인한다.

| 엔진 | 계정 로그인 | API 키 | 프록시 주소 |
|---|---|---|---|
| `codex` | `codex login --device-auth` (`codex-auth` 볼륨) | `CODEX_API_KEY` | `CODEX_BASE_URL` (`/v1` 포함, OpenAI 호환) |
| `claude` | `CLAUDE_CODE_OAUTH_TOKEN` 또는 `claude auth login` (`claude-auth` 볼륨) | `ANTHROPIC_API_KEY` (Bearer 방식 프록시는 `ANTHROPIC_AUTH_TOKEN`) | `ANTHROPIC_BASE_URL` (`/v1` 제외, Anthropic 호환) |

어느 방식이든 출제에 필요한 코드는 해당 모델 제공자(또는 프록시)로 전송된다.
인증 만료·사용량 제한은 실패로 기록한다. 다른 엔진이나 유료 API로 자동 전환하지 않는다.

### Codex 계정

실행기 전용 `codex-auth` 볼륨을 사용한다. 호스트의 전체 Codex 디렉터리를 마운트하지 않는다.

```sh
docker compose exec runner codex login --device-auth
docker compose exec runner codex login status
```

브라우저에서 기기 코드를 승인한다. device auth가 비활성화된 계정이면 ChatGPT 보안 설정 또는 조직 정책을 먼저 확인한다.
이 로그인은 ChatGPT/Codex 사용량을 사용한다.

### Claude 계정

Claude 구독 계정이 있는 컴퓨터에서 장기 토큰을 만들고 `.env`의 `CLAUDE_CODE_OAUTH_TOKEN`에 넣는다.

```sh
claude setup-token
```

호스트에 Claude Code가 없으면 실행기 안에서 로그인해도 된다. 인증은 `claude-auth` 볼륨에만 저장된다.

```sh
docker compose exec runner claude auth login
docker compose exec runner claude auth status
```

### GMS Responses API 직접 호출 (기본 엔진)

Claude CLI 없이 GMS의 OpenAI Responses API를 직접 호출한다. `.env`에 다음 값을 설정한다.

```dotenv
MODEL_PROVIDER=gms
GMS_KEY=<기관에서 발급한 키>
GMS_MODEL=gpt-6.1-sol
GMS_RESPONSES_URL=https://gms.ssafy.io/gmsapi/api.openai.com/v1/responses
```

키는 `.env`에만 보관한다. `GMS_KEY`가 없으면 실행기가 시작하지 않는다.
기존 Claude/Codex 인증은 GMS 요청에 사용하지 않는다.
`docker compose up -d --build --force-recreate runner`로 적용하고 실행기 로그의 `provider: gms`를 확인한다.

요청은 Bearer 인증과 `store: false`를 사용한다. 모델은 스냅샷의 파일 목록·읽기·검색·기준 커밋 읽기 도구만 호출할 수 있다.
소스는 기존 비밀정보 제거 및 경로 제한을 거치며, 최종 JSON은 단계별 스키마로 검증한다.
호출 전체의 제한 시간, 최대 64회 요청, 회당 16개 도구 호출, 응답·대화 크기 제한을 적용한다.
인증 실패·사용량 제한·시간 초과는 GMS 실패로 보고하며 다른 엔진으로 자동 전환하지 않는다.

### Claude 실행 제한

Claude Code CLI는 `-p` 비대화 모드로 실행한다. 내장 도구(`--tools ""`)와 사용자 설정·슬래시 명령·세션 저장을 끄고,
`--strict-mcp-config`로 스냅샷 읽기·검색 MCP 도구만 연결한다. 목록에 없는 도구는 `--permission-mode dontAsk`로 묻지 않고 거부한다.
결과는 `--json-schema`의 구조화 출력으로만 받고, 실행기에서 같은 스키마로 다시 검증한다.

## 2. GitHub

권장 방식은 전용 GitHub App이다.

- Repository permissions: Contents read, Pull requests write, Issues read, Metadata read.
  `requireAnswers: true`를 쓰는 저장소에는 답변 완료 상태 조회·쓰기를 위한 Commit statuses **write**도 부여한다. 질문봇은 GitHub Checks나 CI 결과를 수집하지 않는다.
- 댓글 명령 사용자 권한 조회에 필요한 접근 권한도 테스트한다. App에서 조회가 불가능하면 해당 명령은 fail-closed로 동작한다.
- Events: Pull request, Issue comment, Pull request review comment. 기존 Check run·Check suite·Workflow run 구독은 질문 생성에 필요하지 않다.
- Webhook URL: `https://hey.example.com/webhooks/github`
- Webhook secret: `.env`의 `GITHUB_WEBHOOK_SECRET` 값.

App을 필요한 저장소에만 설치한다. `.env`에 `GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID`를 지정하고 개인 키를 설치한다.

```sh
node scripts/install-secret.mjs github-app.pem /absolute/path/to/downloaded-key.pem
```

`config/repositories.yaml`에서 `tokenEnv: ""`, 실제 App 봇 로그인 이름, `enabled: true`를 지정한다.
여러 installation은 저장소 설정의 `installationId`로 구분할 수 있다.

대안으로 전용 봇 PAT를 사용할 수 있다. 이 경우 `tokenEnv: GITHUB_TOKEN`과 정확한 `botLogin`을 설정한다.
**botLogin은 실제 댓글 작성 계정과 일치해야 한다.** 봇 소유 댓글만 갱신하고 중복 대조에 사용한다.

## 3. GitLab

`config/repositories.yaml`에서 인스턴스 URL·프로젝트 경로·봇 사용자 이름을 지정한다.
필요한 프로젝트에만 가입한 전용 봇 토큰을 `.env`의 `GITLAB_TOKEN`에 넣는다. 토큰은 MR discussions/notes, 소스 조회와 API 사용이 가능해야 한다.

- Webhook URL: `https://hey.example.com/webhooks/gitlab`
- Events: Merge request, Comment/Note. Pipeline 이벤트는 질문 생성에 필요하지 않다.
- 권장 인증: GitLab이 생성한 signing token을 `GITLAB_WEBHOOK_SECRET`에 저장하고 `webhookAuth: signing` 사용.
- 구버전에서만 `webhookAuth: secret`을 명시하고 같은 secret을 양쪽에 설정한다. 잘못된 서명을 legacy 인증으로 자동 우회하지 않는다.
- `enabled: true`로 변경한다.

## 답변 완료 후 머지 (선택)

`.hey.yaml`에 `requireAnswers: true`를 넣으면 봇이 head 커밋에 `codereviewbot/questions` 상태를 남긴다.
봇은 상태만 남기며, 실제 차단은 저장소 설정에서 켠다.

- GitHub: App 권한 Commit statuses를 write로 올린다. Branch protection 또는 Ruleset에서 `codereviewbot/questions`를 필수 상태 검사로 지정한다. 비공개 저장소의 branch protection은 유료 플랜이 필요할 수 있다.
- GitLab: 봇 토큰이 Developer 이상이어야 commit status를 쓸 수 있다. Merge request 설정에서 "Pipelines must succeed"를 켠다. 상태는 MR 파이프라인에 붙이며, 파이프라인이 없으면 GitLab이 외부 파이프라인을 만든다. 실연동 검증 전이므로 첫 MR에서 동작을 확인한다.

## 4. Cloudflare Tunnel

봇 전용 터널을 만들고 DNS를 연결한다. 기존 다른 서비스의 터널이나 DNS를 덮어쓰지 않는다.

```sh
cloudflared tunnel login
cloudflared tunnel create hey
cloudflared tunnel route dns hey hey.example.com
```

`ops/cloudflared.example.yml`을 `.local/cloudflared.yml`로 복사하고 터널 UUID를 지정한다.
생성된 해당 터널의 JSON 자격 증명만 설치한다.

```sh
node scripts/install-secret.mjs tunnel.json /absolute/path/to/TUNNEL-UUID.json
docker compose --profile tunnel up -d
```

허용 경로는 `/webhooks/github`, `/webhooks/gitlab`뿐이다. 나머지는 404로 응답한다.
외부에서는 n8n UI, `/internal/*`, `/healthz`, 실행기에 접근할 수 없어야 한다.

## 5. 실연동 검증

코드가 바뀌었다면 먼저 `docker compose build controller runner`로 최신 코드를 이미지에 반영한다.
설정 변경 후 `docker compose up -d --force-recreate controller`로 환경을 다시 읽는다.
질문봇은 자동 코드 리뷰·결함 탐색·CI 보고를 수행하지 않는다. 코드 품질 검토는 작성자가 코드를 작성하면서 수행한다. 실연동에서는 다음 흐름을 양쪽 플랫폼에서 확인한다.

1. 작은 텍스트 변경으로 PR/MR을 열고 `질문 생성 중` 댓글이 핵심 CS 질문 2개로 바뀌는지 확인한다. 각 질문에는 A~D 보기 4개가 있고 정답은 공개되지 않아야 한다. 초기 출제 로그는 `initial_questions` 호출 1회, 호출 제한은 120,000ms다. 큐 대기·코드 준비·게시 시간은 별도다.
2. 요약 댓글에는 변경 요약·발견 사항·검증/CI 표·리뷰 판정이 없어야 한다. 진행 댓글의 예상 시간은 새 질문 생성 이력만 사용하고 이력이 없으면 기본값 2분을 표시해야 한다. 게시 가능한 diff 줄에는 질문 스레드가 생기고 결함 지적은 새로 게시하지 않아야 한다.
3. 질문 스레드에 보기 문자만 답하고, 다른 질문에는 번호·보기·이유로 답해 채점과 보기별 해설·답변 진행률 갱신을 확인한다. 심화 요청 한 번으로 중복 없는 질문 5개가 생성되는지 확인한다.
4. 일반 질문·심화·채점 댓글에는 도움말 진입점 한 줄만 있고, `/hey help` 요청에는 전체 6개 명령의 명령어·뜻·설명·사용 예시 표가 나오는지 확인한다. 아직 질문이 없는 PR/MR에서도 도움말이 모델 호출 없이 동작해야 한다.
5. `/hey tryagain`으로 같은 커밋에서도 질문이 실제로 재생성되는지 확인한다. 확인 답글에는 짧은 안내와 도움말만 있고, 빈 코드 근거·후속 조치 제목은 없어야 한다.
6. 같은 이벤트 재전송, 응답 유실 후 재시도, 연속 푸시·force push·권한 없는 댓글과 선택적 답변 완료 머지 조건을 검증한다.
7. 기존 DB로 업데이트했다면 같은 SHA의 구버전 결과도 질문 전용 `schemaVersion: "2"`로 한 번 전환되는지 확인한다. 옛 게시 대기 결과의 지적은 게시하지 않으며, 기존 질문·답변 이력과 이미 게시된 댓글은 남아 있어야 한다.

실제 모델의 질문 전제·정답·해설 정확도와 학습 가치, 동일 변경에서의 기존/신규 처리 시간을 이 단계에서 측정한다. 로컬 fixture 통과만으로 실제 모델 품질이나 시간 단축을 검증했다고 주장하지 않는다.
