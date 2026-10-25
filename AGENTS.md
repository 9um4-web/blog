<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 프로젝트 개요 (탐색 전에 먼저 읽을 것)

개인 블로그. 스펙 원문: `blog-platform-spec.md` (저장=파싱 동기 트랜잭션, 나무위키식 접기/목차, TagClosure 태그 트리, fractional order 시리즈, SpecialPage 슬롯). **스펙 이후로 태그/시리즈 slug화, post-embeds, 헤더 메뉴 관리 등이 추가돼서 스펙 원문과 실제 구현이 갈린 부분이 있음 — 아래 내용이 최신 실제 상태.**

## 아키텍처

- `lib/domain/` — 순수 도메인 로직 (Next 비의존, **전부 vitest 대상**). markdown.ts(heading_tree·발췌), render.ts(unified 파이프라인: gfm→math→Obsidian 문법(obsidian.ts)→rehype→katex→URL새니타이즈→섹션래핑→shiki→stringify), obsidian.ts(콜아웃·임베드·`![[…]]`·`[[…]]`·`&emsp;` 들여쓰기 remark 플러그인), html-wrappers.ts(`<div align>`·`<div data-fold>`), embeds.ts·bluesky.ts(임베드 hast), legacy-dialect.ts(옛 방언 → 새 문법 변환기, 일회성), slug.ts(동적 예약어), tag-closure.ts, ordering.ts(fractional key), image.ts
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

## 포스트 임베드 (`lib/post-embeds.ts`, `![[슬러그]]` / `![[series/슬러그]]`)

- 본문에 `![[my-post]]`, `![[series/my-series]]`를 쓰면 `render.ts`가 `data-embed="post|series"`(`data-post-slug` / `data-series-slug`) 속성의 placeholder `<div>`를 만든다(실제 카드 렌더는 여기서 안 함 — DB 조회가 필요해서 2단계로 분리).
- `splitPostEmbedParts(html)` → placeholder 앞뒤로 html/post/series/error 파트 분리 → `extractPostEmbedRequests()`로 필요한 slug/id 수집 → 호출자가 DB에서 실제 포스트/시리즈 조회 → `hydratePostEmbedParts(parts, {postCards, seriesCards})`로 최종 파트 배열 완성.
- 렌더 쪽(`PostView`, 에디터 미리보기 `PostPreview`)은 이 파트 배열을 순회하며 html은 `dangerouslySetInnerHTML`, post-card는 `PostCardContent`, series-card는 `SeriesAccordionCard`(둘 다 `components/post/`)로 그린다 — **공개 뷰어와 에디터 미리보기가 같은 카드 컴포넌트를 공유**하므로 둘 중 하나만 고치고 다른 쪽을 안 고치는 실수 주의.

## 마크다운 확장 문법 (render.ts에서 처리)

`![](유튜브·X·Instagram·Pinterest·SoundCloud·Bluesky 주소)`/`![](영상.mp4)` 임베드 · `![[슬러그]]`/`![[series/슬러그]]` 카드 · `[[슬러그|텍스트]]` 글 링크 · `> [!종류] 제목` 콜아웃(종류 자유) · `$…$`/`$$…$$` KaTeX ·
`<div align="center|right">` 정렬 · 문단·제목 앞 `&emsp;`×(단계×2) 들여쓰기 · `<div data-fold="2~6|none">` 섹션 소속 오버라이드
(문법 전체는 `markdown-syntax.md`. 옛 방언 `::youtube`·`:::note` 등은 없어졌다 — 옛 글은 관리자 "문법 변환"(`/admin/migrate-dialect`)으로 한 번 옮기고, 다 옮긴 뒤 그 페이지·`legacy-dialect.ts`는 지워도 된다)
(fold: 지정 레벨 이하의 조상 섹션 직속으로 끌어올림. 이후 제목에는 구조적으로 소속 불가.
h=none 또는 해당 조상 없음 → data-nofold로 접기 면제)

**`<div align>`·`<div data-fold>` 래퍼는 여는 줄과 닫는 `</div>` 줄이 각각 빈 줄로 둘러싸인 최상위 HTML 블록이어야 한다**(CommonMark의 HTML 블록은 빈 줄에서 끝난다). 닫히지 않으면 래퍼를 만들지 않는다. `lib/domain/html-wrappers.ts`의 `applyHtmlWrappers()`가 목차(markdown.ts)와 본문(render.ts) 양쪽에서 같은 규칙으로 래퍼를 읽어, heading_tree의 id와 본문 앵커 id가 어긋나지 않는다(정렬 래퍼 안의 헤딩은 끌어올리고, fold 안의 헤딩은 목차에서 뺀다).

## 시각(WYSIWYG) 편집 모드 (`components/admin/wysiwyg-editor.tsx`)

- 관리자 본문 편집기의 네 번째 모드("시각"). 기본 모드는 그대로 "통합"이고, 시각 모드는 쿠키(`post_editor_mode=wysiwyg`)로 고른 사람만 쓴다. 원본은 항상 마크다운(`contentMd`)이다.
- 에디터는 `@gogum4/editor-{schema,markdown,core,react}` 패키지(별도 저장소 `gogum4/js-editor`)이고 GitHub Packages에서 `^0.3.0`으로 설치한다. **설치에 `read:packages` 권한의 토큰이 필요하다**: 로컬은 `~/.npmrc`의 `//npm.pkg.github.com/:_authToken=…`, Docker 빌드는 BuildKit 비밀 `npmrc`(`docker build --secret id=npmrc,src=$HOME/.npmrc`, Dockerfile의 deps 단계), GitHub Actions는 저장소 비밀 `GH_PACKAGES_TOKEN`(`deploy.yml`의 `npm ci`와 이미지 빌드 두 곳). 레포 루트 `.npmrc`는 레지스트리 주소만 가리킨다. 에디터를 고쳐야 하면 js-editor에서 고치고 게시한 뒤 버전을 올린다.
- 열기만 해서는 본문이 바뀌지 않는다: 문서를 연 직후의 마크다운과 같으면 내보내지 않는다. 고치면 Obsidian 문법으로 정규화되어 나간다(`lib/wysiwyg-markdown.ts`: obsidian 방언 + `profile: { rawEmbeds, keepAnyHref, mdLinksToPages: false }`로 이미지·HTML·열 정렬 표를 원문 보존, 빈 줄 간격·`~x~`→`~~x~~` 등 렌더가 같은 정규화). 임베드(`![](주소)`)·들여쓰기(`&emsp;`, Tab)·글/시리즈 카드(`![[…]]` → 에디터의 `reference` 노드, 종류 `post`/`series`, 해석기는 `wysiwyg-editor.tsx`)는 구조 노드가 되고, 에디터가 구조를 모르는 것(이미지·HTML·열 정렬 표·한 줄 `$$`·`[[글|텍스트]]`·Bluesky)은 회색 상자/칸 또는 글자의 **원문 그대로** 보존된다. `/임베드`에 슬러그·사이트 주소를 붙이면 글/시리즈 카드가 된다.
- 에디터의 이미지·토글 노드는 쓰지 않는다(`transform`으로 뺌). 이미지는 업로드 버튼의 마크다운(`![](/images/…)`)이 원문 상자로 들어가고 그림으로 보인다. 크기 조절(드래그)은 통합·분할 모드에서만 된다.
- 에디터 스타일은 밝은 배경 기준이라 어두운 테마에서도 흰 종이 위에 둔다(`not-prose`). 에디터 번들은 `next/dynamic`으로 시각 모드를 열 때만 불러온다.

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
