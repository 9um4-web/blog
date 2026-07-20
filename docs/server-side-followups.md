# 서버/Cloudflare 쪽 후속 작업 (이 저장소 밖 — 수동 적용 필요)

`deploy.yml`은 이 세션에서 바로 수정했지만, 아래 항목들은 실서버(`~/blog-deploy/`)와
Cloudflare 대시보드에 있는 리소스라 여기서 파일을 직접 고칠 수 없습니다. 복사해서
그대로 적용하시면 됩니다.

---

## 1. server.js — 커스텀 헤더 인증이 실제로는 미구현 상태 (발견된 실제 이슈)

실제 `server.js`를 확인한 결과, `X-Hub-Signature-256`(HMAC) 검증만 되고 있고
`WEBHOOK_AUTH_TOKEN`/`CUSTOM_AUTH_HEADER_NAME`은 선언만 있을 뿐 어디서도 쓰이지
않습니다. `deploy.yml`이 커스텀 헤더를 보내도 서버가 무시하고 있었다는 뜻 —
"이중 인증"이 아니라 HMAC 서명 하나짜리 단일 인증이었습니다. 아래 patch로 실제
검증 로직을 추가합니다.

### GitHub 저장소 설정
1. Settings → Secrets and variables → Actions
2. 기존 `WEBHOOK_SECRET` 값을 `WEBHOOK_HMAC_SECRET`이라는 이름으로 다시 등록(값 동일해도 무방)
3. `openssl rand -hex 32`로 새 값을 만들어 `WEBHOOK_AUTH_TOKEN`으로 등록 — **HMAC 키와 달라야 의미가 있습니다.**
4. `CUSTOM_AUTH_HEADER_NAME`이 이미 등록돼 있다면 그대로 재사용(헤더 *이름*이라 값 변경 불필요)

### server.js 패치

상단 환경변수 선언부:

```js
const WEBHOOK_HMAC_SECRET = process.env.WEBHOOK_HMAC_SECRET; // 기존 WEBHOOK_SECRET에서 이름만 변경
const WEBHOOK_AUTH_TOKEN = process.env.WEBHOOK_AUTH_TOKEN;
const CUSTOM_AUTH_HEADER_NAME = (process.env.CUSTOM_AUTH_HEADER_NAME || "").toLowerCase();
```

`/deploy-webhook` 핸들러 앞부분:

```js
app.post('/deploy-webhook', (req, res) => {
  if (!req.rawBody) return res.status(400).send('Bad request');

  // 1) HMAC 서명 검증
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return res.status(401).send('No signature');

  const hmac = crypto.createHmac('sha256', WEBHOOK_HMAC_SECRET);
  const digest = 'sha256=' + hmac.update(req.rawBody).digest('hex');

  const sigBuf = Buffer.from(signature);
  const digestBuf = Buffer.from(digest);
  // 길이가 다르면 timingSafeEqual이 예외를 던지므로 먼저 걸러준다
  if (sigBuf.length !== digestBuf.length || !crypto.timingSafeEqual(sigBuf, digestBuf)) {
    return res.status(401).send('Invalid signature');
  }

  // 2) 커스텀 헤더 검증 — 지금까지 실제로는 검사가 안 되고 있었음
  const authToken = req.headers[CUSTOM_AUTH_HEADER_NAME];
  if (!authToken) return res.status(401).send('No auth token');

  const tokenBuf = Buffer.from(authToken);
  const expectedBuf = Buffer.from(WEBHOOK_AUTH_TOKEN);
  if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
    return res.status(401).send('Invalid auth token');
  }

  // 이하 기존 코드(req.body.ref 검사 등) 그대로 유지
```

서버 `.env`:

```bash
WEBHOOK_HMAC_SECRET=<기존 WEBHOOK_SECRET 값>
WEBHOOK_AUTH_TOKEN=<openssl rand -hex 32로 새로 발급, HMAC_SECRET과 달라야 함>
CUSTOM_AUTH_HEADER_NAME=<GitHub Secrets와 동일한 헤더 이름>
```

`crypto.timingSafeEqual`을 쓰는 이유: 문자열을 `===`로 비교하면 앞에서부터 한 글자씩
비교가 끝나는 시점 차이로 값을 추정하는 타이밍 공격이 이론상 가능합니다. 버퍼 길이가
다르면 `timingSafeEqual`이 예외를 던지므로, 위 코드처럼 길이 비교를 먼저 해서
401(정상적인 인증 실패)과 500(구현 결함으로 인한 예외)이 섞이지 않게 했습니다.

### 에러 로그 마스킹 (예방 차원 — 실제 deploy.sh 확인 결과 현재는 위험 낮음)

`exec` 실패 시 `deploy.sh`의 stdout/stderr 전체를 Discord로 업로드합니다. 실제
`deploy.sh`(`git fetch/reset` → `docker compose pull` → `docker compose up -d` →
`docker image prune -f`)를 확인해보니 `docker compose config`처럼 환경변수를
평문으로 풀어서 출력하는 명령이 없어, 지금 시점엔 로그에 시크릿이 섞여 나갈 실제
경로가 없습니다. 다만 이후 디버깅용으로 `docker compose config`나 `env` 같은 명령이
스크립트에 추가되는 순간 조용히 위험해지는 종류의 문제라, 아래 마스킹 함수는 지금
당장 필수는 아니고 **예방적으로 걸어두면 좋은** 정도로 낮춰서 권합니다.

```js
function redactSecrets(text) {
  const secrets = [
    WEBHOOK_HMAC_SECRET, WEBHOOK_AUTH_TOKEN,
    process.env.POSTGRES_PASSWORD, process.env.SESSION_SECRET, process.env.ADMIN_PASSWORD_HASH,
  ].filter(Boolean);
  return secrets.reduce((acc, s) => acc.split(s).join('[REDACTED]'), text);
}
```

`exec` 콜백에서 `errorLog`를 만든 직후 `const errorLog = redactSecrets(rawErrorLog);`로
감싸면 됩니다.

### 배포 락 — 타임아웃 추가로 최소 침습 수정

실제 약점은 "프로세스 재시작 시 락 초기화"보다 `deploy.sh`가 멈춰버리면
`isDeploying`이 영원히 `true`로 남는 쪽입니다(`exec` 콜백이 안 불리므로). 별도
클래스 없이 타임아웃만 추가해도 충분합니다.

```js
let isDeploying = false;
let deployStartedAt = 0;
const DEPLOY_TIMEOUT_MS = 10 * 60 * 1000;

function isDeployLocked() {
  if (!isDeploying) return false;
  if (Date.now() - deployStartedAt > DEPLOY_TIMEOUT_MS) {
    console.warn("Stale deploy lock detected — force releasing.");
    isDeploying = false;
    return false;
  }
  return true;
}
```

기존의 `if (isDeploying)`를 `if (isDeployLocked())`로 바꾸고, `isDeploying = true;`
다음 줄에 `deployStartedAt = Date.now();`를 추가하면 됩니다.

*(배포 락 관련 수정은 위 "배포 락 — 타임아웃 추가로 최소 침습 수정" 절 참고. 처음엔
별도 파일락/클래스로 제안했으나, 실제 코드가 단일 프로세스 내 동기 처리라 락 자체의
동시성 버그는 없고 — "deploy.sh가 멈추면 락이 안 풀린다"는 문제만 있어 타임아웃 추가로
충분합니다. 나중에 다중 서버로 확장하게 되면 그때 파일/Redis 락으로 옮기는 걸 고려하세요.)*

---

## 2. Cloudflare — Bot Fight Mode 전체 해제 대신 스코프 규칙

Bot Fight Mode를 계정 전체에서 끄면 `/deploy-webhook` 하나를 위해 사이트 전체의 봇
방어가 사라집니다. 대신 WAF Custom Rule로 이 경로만 예외 처리하세요(무료 플랜에서도
Custom Rule 자체는 사용 가능합니다).

1. Cloudflare 대시보드 → 도메인 선택 → **Security → WAF → Custom rules**
2. **Create rule**
   - Rule name: `Allow CI deploy webhook`
   - Field: `URI Path` — Operator: `equals` — Value: `/deploy-webhook`
   - (선택, 더 좁히려면) `AND` 조건 추가: Field `Request Headers` → 커스텀 인증
     헤더 이름이 존재하는지 확인하는 조건을 추가하면 경로만 아는 것으로는 우회 못 함
   - Action: **Skip** → `Bot Fight Mode` 체크박스만 선택 (다른 보안 기능은 그대로 유지)
3. Save — 이 경로 외 나머지 트래픽은 Bot Fight Mode가 계속 적용됩니다.

더 좁히고 싶다면 GitHub Actions의 아웃바운드 IP는 매번 바뀌므로 IP 화이트리스트보다는
위 경로+헤더 조합이 현실적인 선입니다. Cloudflare Tunnel을 이미 쓰고 있다면, 아예 이
웹훅 엔드포인트를 Tunnel 경유로 노출해 Cloudflare 엣지의 봇 검사 자체를 안 타게 하는
방법도 검토해볼 만합니다(다만 GitHub Actions 러너에서 Tunnel 클라이언트로 접근하려면
별도 설정이 필요해 난이도가 더 높습니다 — 당장은 위 WAF 규칙으로 충분합니다).
