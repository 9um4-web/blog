# 배포 트리거를 SSH-over-Cloudflare-Tunnel로 전환

## 왜 바꿨나

공개 HTTPS 웹훅(`https://webhook-blog.9um4.com/deploy-webhook`)으로 GitHub Actions가
`curl`을 보내면 Cloudflare 무료 플랜의 **Bot Fight Mode**에 `managed_challenge`로
차단당했다. WAF Custom Rule의 Skip 액션으로 우회를 시도했지만, Bot Fight Mode는
Ruleset Engine 밖에서 동작하는 별도 파이프라인이라 **Custom Rule로 스킵 자체가
불가능**하다(Super Bot Fight Mode부터 Skip 지원, 이건 Pro 이상 플랜).

Bot Fight Mode는 HTTP 트래픽만 검사한다. Cloudflare Tunnel은 HTTP뿐 아니라 임의의
TCP(SSH 포함)도 터널링할 수 있으므로, 웹훅을 SSH로 바꾸면 이 문제 자체가 사라진다.
서버에 포트를 새로 열 필요도 없다 — Tunnel은 계속 아웃바운드 연결만 쓴다.

기존에 만들어둔 웹훅 수신기(Express, HMAC+커스텀헤더 이중 인증, 레이트리밋,
배포 락)는 **그대로 유지**한다. GitHub Actions는 이제 공개 인터넷이 아니라
SSH로 서버에 들어가서, `127.0.0.1`로만 그 웹훅을 호출한다 — SSH가 1차 인증,
기존 HMAC/헤더 검증이 2차 인증으로 남아 이중 방어가 된다.

## 1. Cloudflare Tunnel에 SSH ingress 추가

`cloudflared` 설정 파일(보통 `~/.cloudflared/config.yml`)에 SSH 라우트를 추가한다.

```yaml
tunnel: <TUNNEL-ID>
credentials-file: /home/vitelotte/.cloudflared/<TUNNEL-ID>.json

ingress:
  - hostname: ssh.9um4.com
    service: ssh://localhost:22
  - hostname: blog.9um4.com
    service: http://localhost:3000
  - hostname: webhook-blog.9um4.com
    service: http://localhost:4000   # 기존 웹훅 포트
  - service: http_status:404
```

기존에 있던 `blog.9um4.com`/`webhook-blog.9um4.com` ingress 규칙은 그대로 두고
`ssh.9um4.com` 항목만 추가하면 된다. 순서 중요 — `service: http_status:404`(catch-all)는
항상 맨 마지막이어야 한다.

```bash
sudo systemctl restart cloudflared   # 또는 cloudflared가 systemd 서비스가 아니면 해당 프로세스 재시작
cloudflared tunnel route dns <TUNNEL-NAME-OR-ID> ssh.9um4.com
```

## 2. Cloudflare Zero Trust — Service Token 발급

GitHub Actions는 사람이 아니라서 브라우저 로그인 기반 Access 인증을 못 탄다.
Service Token으로 비대화형 인증을 건다.

1. [Zero Trust 대시보드](https://one.dash.cloudflare.com/) → **Access → Service Auth → Service Tokens**
2. **Create Service Token** → 이름 예: `github-actions-deploy`
3. 생성되는 **Client ID / Client Secret**을 그 자리에서 복사해두기 (재조회 불가)

## 3. Access Application 생성 (`ssh.9um4.com` 보호)

1. **Access → Applications → Add an application → Self-hosted**
2. Application domain: `ssh.9um4.com`
3. Policy 추가: Action `Service Auth`, Include 조건에 방금 만든 Service Token(`github-actions-deploy`) 선택
4. 저장

이제 이 호스트네임은 해당 Service Token을 제시하는 요청만 통과시킨다.

## 4. 서버 — 전용 SSH 키 + forced command로 권한 제한

GitHub Actions 전용 키페어를 새로 만든다(기존에 쓰던 개인 SSH 키와 절대 공유하지 않는다).

```bash
ssh-keygen -t ed25519 -f ./github-actions-deploy -N "" -C "github-actions-deploy"
```

`github-actions-deploy.pub`의 내용을 서버 `~/.ssh/authorized_keys`에 추가하되,
**앞에 forced command와 제한 옵션을 붙인다** — 이 키가 유출돼도 공격자가
`trigger-deploy.sh` 말고는 아무것도 못 실행하게 하기 위해서다.

```
command="/home/vitelotte/blog-deploy/trigger-deploy.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA...여기에 .pub 내용... github-actions-deploy
```

`github-actions-deploy`(개인키)는 GitHub Secrets `DEPLOY_SSH_PRIVATE_KEY`로 등록하고,
로컬에서 지운다.

`trigger-deploy.sh`는 이미 `02_blog-deploy` 저장소 루트에 있다 — 서버에서
`~/blog-deploy`에 이 저장소를 클론/pull했다면 그대로 존재한다. 실행 권한만 확인.

```bash
chmod +x ~/blog-deploy/trigger-deploy.sh
```

## 5. GitHub 저장소 Secrets

| Secret | 값 |
|---|---|
| `DEPLOY_SSH_PRIVATE_KEY` | 3번에서 만든 개인키(`github-actions-deploy`) 전체 내용 |
| `CF_ACCESS_SERVICE_TOKEN_ID` | 2번에서 발급한 Client ID |
| `CF_ACCESS_SERVICE_TOKEN_SECRET` | 2번에서 발급한 Client Secret |
| `DEPLOY_SSH_HOSTNAME` | `ssh.9um4.com` |
| `DEPLOY_SSH_USER` | `vitelotte` |

기존에 등록했던 `WEBHOOK_HMAC_SECRET`/`WEBHOOK_AUTH_TOKEN`/`CUSTOM_AUTH_HEADER_NAME`은
**이제 GitHub 쪽엔 필요 없다** — `trigger-deploy.sh`가 서버의 `.env`에서만 그 값들을
읽는다. 지우진 않아도 되지만(다른 용도로 쓸 일 없으면 정리해도 무방), deploy.yml은
더 이상 참조하지 않는다.

## 6. CI에 반영하기 전에 수동으로 먼저 검증

로컬(또는 아무 머신)에 `cloudflared` 설치 후:

```bash
cloudflared access ssh --hostname ssh.9um4.com \
  --service-token-id <CF_ACCESS_SERVICE_TOKEN_ID> \
  --service-token-secret <CF_ACCESS_SERVICE_TOKEN_SECRET> &

ssh -i ./github-actions-deploy -o ProxyCommand="cloudflared access ssh --hostname %h --service-token-id <ID> --service-token-secret <SECRET>" \
  vitelotte@ssh.9um4.com
```

접속되자마자 `trigger-deploy.sh`가 강제 실행되고 `webhook responded: 202`(또는 200)가
찍히면 성공이다. `Permission denied`가 나면 `authorized_keys` 항목의 공개키가
정확히 복사됐는지, 줄바꿈 없이 한 줄인지부터 확인한다.

이 수동 테스트가 통과한 뒤에 `main`에 push해서 실제 파이프라인으로 확인한다.
