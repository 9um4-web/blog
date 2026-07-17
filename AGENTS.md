<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# 프로젝트 개요 (탐색 전에 먼저 읽을 것)

개인 블로그. 스펙 원문: `blog-platform-spec.md` (저장=파싱 동기 트랜잭션, 나무위키식 접기/목차, TagClosure 태그 트리, fractional order 시리즈, SpecialPage 슬롯).

## 아키텍처

- `lib/domain/` — 순수 도메인 로직 (Next 비의존, **전부 vitest 대상**). markdown.ts(heading_tree·발췌), render.ts(unified 파이프라인: gfm→math→directive→커스텀 디렉티브→rehype→katex→URL새니타이즈→섹션래핑→shiki→stringify), slug.ts(동적 예약어), tag-closure.ts, ordering.ts, image.ts
- `lib/db/` — Drizzle 스키마·마이그레이션·조회(queries.ts). 이미지가 bytea로 DB에 저장됨
- `lib/actions/` — Server Actions. **모든 변경 액션 첫 줄에 requireAdmin() 필수**
- `lib/auth/` — jose 서명 쿠키 세션 + 인메모리 로그인 레이트리밋(IP: cf-connecting-ip 우선)
- `proxy.ts` — Next 16에서 middleware의 새 이름. /admin 낙관적 차단
- `components/post/` — 뷰어(접기/목차/mermaid lazy), `components/admin/` — 관리 UI
- 루트 레이아웃 `dynamic = "force-dynamic"` (DB 기반이라 빌드 시 프리렌더 안 함)

## 마크다운 확장 문법 (render.ts에서 처리)

`::youtube[영상ID]` · `:::note|info|tip|warning|danger[제목]` 콜아웃 · `$…$`/`$$…$$` KaTeX ·
`:::center`/`:::right` 정렬 · `:::indent{n=1~8}` · `:::fold{h=2~6|none}` 섹션 소속 오버라이드
(fold: 지정 레벨 이하의 조상 섹션 직속으로 끌어올림. 이후 제목에는 구조적으로 소속 불가.
h=none 또는 해당 조상 없음 → data-nofold로 접기 면제)

## 명령어

- 테스트/검증: `npm test` · `npx tsc --noEmit` · `npm run lint`
- 개발 DB: `docker compose -f docker-compose.dev.yml up -d` → `npm run db:migrate`
- 스키마 변경: schema.ts 수정 → `npm run db:generate` → `npm run db:migrate`
- 개발 서버는 `.claude/launch.json`의 blog-dev (preview_start 사용)

## 이 환경(Windows PC)의 함정

- docker CLI: 매 셸에서 `$env:PATH += ";C:\Program Files\Docker\Docker\resources\bin"` 필요. Docker Desktop이 꺼져 있으면 ECONNREFUSED — 켜고 dev DB 재기동
- `.env`의 `$` 값(bcrypt 해시 등)은 `\$`로 이스케이프 (Next dotenv-expand). compose가 읽는 서버 `.env`는 `$$`
- 커밋: SSH 서명 — Bash 도구에선 ssh-agent 연결 안 됨, **PowerShell 도구로 git 커밋** 실행
- 브라우저 pane의 screenshot이 타임아웃되는 경우 있음 → DOM/JS 검증으로 대체

## 배포 (운영: Ubuntu 서버, rootless Docker)

서버에서 `cd ~/blog && git pull && docker compose up -d --build` (migrate 서비스가 마이그레이션 자동 적용). Cloudflare Tunnel(Main Web)로 blog.9um4.com 노출, /admin·/login은 Cloudflare Access 보호.
<!-- END:nextjs-agent-rules -->
