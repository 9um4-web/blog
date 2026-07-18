<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 프로젝트 개요 (탐색 전에 먼저 읽을 것)

개인 블로그. 스펙 원문: `blog-platform-spec.md` (저장=파싱 동기 트랜잭션, 나무위키식 접기/목차, TagClosure 태그 트리, fractional order 시리즈, SpecialPage 슬롯). **스펙 이후로 태그/시리즈 slug화, post-embeds, 헤더 메뉴 관리 등이 추가돼서 스펙 원문과 실제 구현이 갈린 부분이 있음 — 아래 내용이 최신 실제 상태.**

## 아키텍처

- `lib/domain/` — 순수 도메인 로직 (Next 비의존, **전부 vitest 대상**). markdown.ts(heading_tree·발췌), render.ts(unified 파이프라인: gfm→math→directive→커스텀 디렉티브→rehype→katex→URL새니타이즈→섹션래핑→shiki→stringify), slug.ts(동적 예약어), tag-closure.ts, ordering.ts(fractional key), image.ts
- `lib/nav-items.ts` — 헤더 메뉴 병합/토글/재배치 순수 로직 (아래 "헤더 메뉴" 참고)
- `lib/post-embeds.ts` — 본문 내 포스트/시리즈 임베드 placeholder 파싱·치환 순수 로직 (아래 참고)
- `lib/db/` — Drizzle 스키마·마이그레이션·조회(queries.ts). 이미지가 bytea로 DB에 저장됨
- `lib/actions/` — Server Actions. **모든 변경 액션 첫 줄에 requireAdmin() 필수**
- `lib/auth/` — jose 서명 쿠키 세션 + 인메모리 로그인 레이트리밋(IP: cf-connecting-ip 우선)
- `proxy.ts` — Next 16에서 middleware의 새 이름. /admin 낙관적 차단
- `components/post/` — 공개 뷰어(접기/목차/mermaid lazy) + 포스트·시리즈 카드 공용 부품
- `components/admin/` — 관리 UI
- 루트 레이아웃 `dynamic = "force-dynamic"` (DB 기반이라 빌드 시 프리렌더 안 함)

## 데이터 모델 핵심 (스펙 원문과 달라진 부분)

- **태그**: 네임스페이스 개념 **삭제됨**. `tag` 테이블은 `parentTagId`(자기참조) + `slug`(유니크) + `name`만 있음. 라우트 `/tag/[slug]`, `/tags`. TagClosure는 그대로 유지(순환 검증·하위 조회).
- **시리즈**: `series` 테이블에 `slug`(유니크) 추가. 라우트 `/series/[slug]`, 목록 `/series`(Accordion으로 각 시리즈 펼쳐서 소속 글 미리보기).
- **포스트**: `summary` 컬럼 존재(선택 입력, 없으면 `excerptFromMarkdown`로 본문 발췌 — `lib/domain/markdown.ts`).
- **설정(`setting` key-value 테이블)**: 스칼라 문자열 값. 알려진 키 — `site_name`, `site_email`, `show_summary`("true"/"false"), `social_{github,x,soundcloud,youtube}`(URL), `giscus_{repo,repo_id,category,category_id}`, `site_font`(app/fonts.ts FONT_OPTIONS 값), `site_timezone`(IANA, lib/timezones.ts), `nav_items`(JSON 문자열, 아래 참고). 조회는 `getSiteSettings()`가 한 번에 다 읽어옴.

## 헤더 메뉴 (`lib/nav-items.ts`, `/admin/navigation`)

- 헤더는 **드롭다운이 아니라 평평한 링크 나열**. 기본 제공 페이지(글목록/태그/시리즈/방명록) + 임의의 시리즈를 **하나의 순서 공간**에서 관리자가 켜고 끄고 순서를 정한다.
- 저장 형식: `setting.nav_items` 키에 `StoredNavEntry[]`(`{id, enabled}`) JSON. `id`는 `builtin:posts|tags|series|guestbook` 또는 `series:<id>`.
- `getNavItems()`(queries.ts)가 저장된 목록 + 현재 시리즈 목록을 `mergeNavItems()`로 합쳐 **disabled 포함 전체 목록**을 반환 — 관리 화면(`/admin/navigation`, `NavManager`)은 이걸 그대로 쓰고, 공개 헤더(`app/layout.tsx`)는 `enabled`만 필터링.
- 새로 만든 시리즈는 자동으로 목록 끝에 **off 상태**로 나타남(관리자가 켜야 헤더에 보임). 삭제된 시리즈를 가리키던 저장 항목은 조회 시 조용히 빠짐 — 별도 정리 코드 불필요.
- 순서 변경(`moveNavItemAction`)과 on/off(`setNavItemEnabled`)는 `lib/actions/nav.ts`. 항상 전체 배열을 다시 읽어 수정 후 통째로 저장(짧은 목록이라 fractional order 안 씀, `postSeries.order`/시리즈 내 글 순서와는 다른 방식).

## 포스트 임베드 (`lib/post-embeds.ts`, `::post{slug=...}` / `::series{id=...}`)

- 에디터에서 `::post{slug=my-post}`, `::series{id=3}` 디렉티브를 쓰면 `render.ts`가 `data-embed="post|series"` 속성의 placeholder `<div>`를 만든다(실제 카드 렌더는 여기서 안 함 — DB 조회가 필요해서 2단계로 분리).
- `splitPostEmbedParts(html)` → placeholder 앞뒤로 html/post/series/error 파트 분리 → `extractPostEmbedRequests()`로 필요한 slug/id 수집 → 호출자가 DB에서 실제 포스트/시리즈 조회 → `hydratePostEmbedParts(parts, {postCards, seriesCards})`로 최종 파트 배열 완성.
- 렌더 쪽(`PostView`, 에디터 미리보기 `PostPreview`)은 이 파트 배열을 순회하며 html은 `dangerouslySetInnerHTML`, post-card는 `PostCardContent`, series-card는 `SeriesAccordionCard`(둘 다 `components/post/`)로 그린다 — **공개 뷰어와 에디터 미리보기가 같은 카드 컴포넌트를 공유**하므로 둘 중 하나만 고치고 다른 쪽을 안 고치는 실수 주의.

## 마크다운 확장 문법 (render.ts에서 처리)

`::youtube[영상ID]` · `::post{slug=...}` · `::series{id=...}` · `:::note|info|tip|warning|danger[제목]` 콜아웃 · `$…$`/`$$…$$` KaTeX ·
`:::center`/`:::right` 정렬 · `:::indent{n=1~8}` · `:::fold{h=2~6|none}` 섹션 소속 오버라이드
(fold: 지정 레벨 이하의 조상 섹션 직속으로 끌어올림. 이후 제목에는 구조적으로 소속 불가.
h=none 또는 해당 조상 없음 → data-nofold로 접기 면제)

**컨테이너 디렉티브(`:::`)는 닫는 `:::`가 꼭 있어야 함** — 안 닫으면 문서 끝까지 그 블록에 먹힌다. `::indent{n=0}`처럼 "0으로 리셋" 식으로는 못 끝냄, 반드시 여는 것과 짝인 `:::`로 닫아야 함. 에디터 안내 문구에도 명시돼 있음.

## 알려진 정리 대상 (다음에 손댈 때 참고, 우선순위 낮음)

- `components/admin/tags-manager.tsx`: `isRoot`(84행 근방) · `InlineInput`(파일 하단) 미사용 — lint 경고만 뜨고 동작엔 무해. 삭제해도 됨.
- `app/globals.css`의 `--font-sans` 등 폰트 변수 CSS는 `app/fonts.ts`(FONT_OPTIONS)와 짝을 이룸 — 폰트 옵션 추가/삭제 시 두 파일 다 고쳐야 함.
- 이미지 삭제 시 본문 참조 여부를 검사하지 않음(의도된 설계 — 삭제하면 그 자리는 깨진 이미지로 보일 뿐, UI에 경고 문구로 명시). 나중에 "참조 중인 이미지 삭제 방지"를 원하면 `lib/actions/images.ts`의 `deleteImage`에 본문 스캔 추가 필요.

## 명령어

- 테스트/검증: `npm test` · `npx tsc --noEmit` · `npm run lint`
- 개발 DB: `docker compose -f docker-compose.dev.yml up -d` → `npm run db:migrate`
- 스키마 변경: schema.ts 수정 → `npm run db:generate` → `npm run db:migrate`
- 개발 서버는 `.claude/launch.json`의 blog-dev (preview_start 사용) — **단, 사용자가 이미 자기 터미널에서 `npm run dev`를 띄워놓고 작업 중일 때가 있음**. Next는 프로젝트 디렉토리당 dev 서버 락을 걸어서 다른 포트로도 두 번째 인스턴스를 못 띄운다(`Another next dev server is already running`, PID 명시됨) — **그 PID를 임의로 죽이지 말 것**(사용자 작업 세션일 수 있음). 이미 떠 있으면 그 포트로 그냥 접속해서 확인하고, 만약 그 서버의 DB 상태가 이상하면(예: 포스트가 0개인데 방금 만든 테스트 데이터가 안 보임) 별도 DB에 연결된 것일 수 있으니 사용자에게 확인 요청.

## 이 환경(Windows PC)의 함정

- docker CLI: 매 셸에서 `$env:PATH += ";C:\Program Files\Docker\Docker\resources\bin"` 필요. Docker Desktop이 꺼져 있으면 ECONNREFUSED — 켜고 dev DB 재기동
- `.env`의 `$` 값(bcrypt 해시 등)은 `\$`로 이스케이프 (Next dotenv-expand). compose가 읽는 서버 `.env`는 `$$`
- 커밋: SSH 서명 — Bash 도구에선 ssh-agent 연결 안 됨, **PowerShell 도구로 git 커밋** 실행 (사용자가 직접 커밋하는 경우도 많음 — 매번 자동 커밋하지 말고 요청 시에만)
- 브라우저 pane의 screenshot이 타임아웃되는 경우 있음 → DOM/JS 검증으로 대체
- 마이그레이션을 로컬에서 생성·적용했는데 아직 커밋 전이라 방향을 바꿔야 할 때: `git status`로 해당 마이그레이션 sql/meta가 untracked인지 확인 후, untracked면 파일 삭제 + `git checkout -- lib/db/migrations/meta/_journal.json`으로 깨끗이 되돌리고, dev DB에 이미 적용된 컬럼/테이블은 직접 `ALTER TABLE ... DROP COLUMN`으로 되돌리면 됨(dev DB는 disposable이라 볼륨 재생성도 대안).

## 배포 (운영: Ubuntu 서버, rootless Docker)

서버에서 `cd ~/blog && git pull && docker compose up -d --build` (migrate 서비스가 마이그레이션 자동 적용). Cloudflare Tunnel(Main Web)로 blog.9um4.com 노출, /admin·/login은 Cloudflare Access 보호.
