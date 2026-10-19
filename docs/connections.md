# 외부 연결 가이드 — 나중에 진행

실제 연결·인증은 아직 수행하지 않는다. 아래 절차는 운영자가 연결할 때 사용한다.
토큰과 개인 키는 `.env` 또는 `.local/secrets`에만 넣고 커밋하지 않는다.

## 1. Codex 전용 로그인

실행기 전용 `codex-auth` 볼륨을 사용한다. 호스트의 전체 Codex 디렉터리를 마운트하지 않는다.

```sh
docker compose exec runner codex login --device-auth
docker compose exec runner codex login status
```

브라우저에서 기기 코드를 승인한다. device auth가 비활성화된 계정이면 ChatGPT 보안 설정 또는 조직 정책을 먼저 확인한다.
이 로그인은 ChatGPT/Codex 사용량을 사용하며, 로컬 CLI 실행도 검토 코드를 OpenAI에 전송한다.
인증 만료·사용량 제한은 실패로 기록한다. 유료 API로 자동 전환하지 않는다.

## 2. GitHub

권장 방식은 전용 GitHub App이다.

- Repository permissions: Contents read, Pull requests write, Issues read, Checks read, Commit statuses read, Metadata read.
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

설정 변경 후 `docker compose up -d --force-recreate controller`로 환경을 다시 읽는다.
테스트 PR/MR에서 결함 생성 → 댓글 위치·양식 확인 → 수정 → 지적 상태 갱신을 양쪽 플랫폼에서 확인한다.
같은 이벤트를 재전송하고 연속 푸시·force push·권한 없는 댓글·일시정지·재개도 검증한다.
Codex 모델의 실제 탐지 품질은 이 실연동 검증과 평가 데이터로 측정한다.
