# 외부 연결 가이드 — 나중에 진행

실제 연결·인증은 아직 수행하지 않는다. 아래 절차는 운영자가 연결할 때 사용한다.
토큰과 개인 키는 `.env` 또는 `.local/secrets`에만 넣고 커밋하지 않는다.

## 1. 리뷰 엔진 선택과 로그인

`.env`의 `MODEL_PROVIDER`로 엔진을 고른다. `codex`(기본값) 또는 `claude`.
엔진마다 계정 로그인과 API 키 중 하나를 쓴다. API 키는 `*_BASE_URL`로 호환 프록시(예: GMS)를 지정할 수 있다.
값을 바꾼 뒤 `docker compose up -d --force-recreate runner`로 다시 읽는다. 실행기 로그의 `provider`로 적용 여부를 확인한다.

| 엔진 | 계정 로그인 | API 키 | 프록시 주소 |
|---|---|---|---|
| `codex` | `codex login --device-auth` (`codex-auth` 볼륨) | `CODEX_API_KEY` | `CODEX_BASE_URL` (`/v1` 포함, OpenAI 호환) |
| `claude` | `CLAUDE_CODE_OAUTH_TOKEN` 또는 `claude auth login` (`claude-auth` 볼륨) | `ANTHROPIC_API_KEY` (Bearer 방식 프록시는 `ANTHROPIC_AUTH_TOKEN`) | `ANTHROPIC_BASE_URL` (`/v1` 제외, Anthropic 호환) |

어느 방식이든 검토 코드는 해당 모델 제공자(또는 프록시)로 전송된다.
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

### API 게이트웨이로 전환 (예: SSAFY GMS)

계정 로그인에서 기관이 발급한 API 키로 바꿀 때는 `.env`만 고친다. 주소와 모델 이름은 게이트웨이 문서의 값을 그대로 쓴다.

1. 계정 인증을 지운다. `CLAUDE_CODE_OAUTH_TOKEN`을 비우고, 실행기 안에서 로그인했다면 `docker compose exec runner claude auth logout`을 실행한다. 남아 있으면 어느 인증이 쓰였는지 헷갈린다.
2. 게이트웨이가 제공하는 API 형식에 맞춰 설정한다.
   - Anthropic Messages 형식: `MODEL_PROVIDER=claude`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY`. 게이트웨이가 `Authorization: Bearer`를 요구하면 `ANTHROPIC_AUTH_TOKEN`에 넣는다.
   - OpenAI Responses 형식: `MODEL_PROVIDER=codex`, `CODEX_BASE_URL`(`/v1` 포함), `CODEX_API_KEY`.
3. `CLAUDE_MODEL` 또는 `CODEX_MODEL`에 게이트웨이가 허용하는 모델 이름을 넣는다.
4. `docker compose up -d --force-recreate runner` 후 테스트 MR로 확인한다.

Chat Completions 형식만 제공하는 게이트웨이는 두 CLI 모두 직접 호출할 수 없다. 이 경우 별도 어댑터가 필요하다.

### Claude 실행 제한

Claude Code CLI는 `-p` 비대화 모드로 실행한다. 내장 도구(`--tools ""`)와 사용자 설정·슬래시 명령·세션 저장을 끄고,
`--strict-mcp-config`로 스냅샷 읽기·검색 MCP 도구만 연결한다. 목록에 없는 도구는 `--permission-mode dontAsk`로 묻지 않고 거부한다.
결과는 `--json-schema`의 구조화 출력으로만 받고, 실행기에서 같은 스키마로 다시 검증한다.

## 2. GitHub

권장 방식은 전용 GitHub App이다.

- Repository permissions: Contents read, Pull requests write, Issues read, Checks read, Commit statuses read, Metadata read.
  `requireAnswers: true`를 쓰는 저장소가 있으면 Commit statuses를 **write**로 올린다.
- 댓글 명령 사용자 권한 조회에 필요한 접근 권한도 테스트한다. App에서 조회가 불가능하면 해당 명령은 fail-closed로 동작한다.
- Events: Pull request, Issue comment, Pull request review comment, Check run, Check suite, Workflow run.
- Webhook URL: `https://codereviewbot.thisis-joe.com/webhooks/github`
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

- Webhook URL: `https://codereviewbot.thisis-joe.com/webhooks/gitlab`
- Events: Merge request, Comment/Note, Pipeline
- 권장 인증: GitLab이 생성한 signing token을 `GITLAB_WEBHOOK_SECRET`에 저장하고 `webhookAuth: signing` 사용.
- 구버전에서만 `webhookAuth: secret`을 명시하고 같은 secret을 양쪽에 설정한다. 잘못된 서명을 legacy 인증으로 자동 우회하지 않는다.
- `enabled: true`로 변경한다.

## 답변 완료 후 머지 (선택)

`.codereviewbot.yaml`에 `requireAnswers: true`를 넣으면 봇이 head 커밋에 `codereviewbot/questions` 상태를 남긴다.
봇은 상태만 남기며, 실제 차단은 저장소 설정에서 켠다.

- GitHub: App 권한 Commit statuses를 write로 올린다. Branch protection 또는 Ruleset에서 `codereviewbot/questions`를 필수 상태 검사로 지정한다. 비공개 저장소의 branch protection은 유료 플랜이 필요할 수 있다.
- GitLab: 봇 토큰이 Developer 이상이어야 commit status를 쓸 수 있다. Merge request 설정에서 "Pipelines must succeed"를 켠다. 상태는 MR 파이프라인에 붙이며, 파이프라인이 없으면 GitLab이 외부 파이프라인을 만든다. 실연동 검증 전이므로 첫 MR에서 동작을 확인한다.
- 일시정지(`/reviewbot pause`) 중에는 새 커밋에 상태가 생기지 않아 머지가 막힌다. 급한 경우 관리자가 저장소의 보호 규칙 우회 권한을 사용한다.

## 4. Cloudflare Tunnel

봇 전용 터널을 만들고 DNS를 연결한다. 기존 다른 서비스의 터널이나 DNS를 덮어쓰지 않는다.

```sh
cloudflared tunnel login
cloudflared tunnel create codereviewbot
cloudflared tunnel route dns codereviewbot codereviewbot.thisis-joe.com
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
테스트 PR/MR에서 결함 생성 → 댓글 위치·양식 확인 → 수정 → 지적 상태 갱신을 양쪽 플랫폼에서 확인한다.
같은 이벤트를 재전송하고 연속 푸시·force push·권한 없는 댓글·일시정지·재개도 검증한다.
선택한 모델의 실제 탐지 품질은 이 실연동 검증과 평가 데이터로 측정한다.
