# Blog

DB 기반 저장, 마크다운 + Mermaid, 나무위키식 헤딩 접기/목차, 네임스페이스 태그 트리, fractional order 시리즈를 갖춘 개인 블로그. (기술 스펙: `blog-platform-spec.md` 기반)

## 스택

- Next.js (App Router, Server Actions) + TypeScript
- PostgreSQL 17 + Drizzle ORM
- Tailwind CSS + shadcn/ui
- remark/rehype (AST 기반 마크다운 파싱), mermaid.js (lazy render)
- Vitest (도메인 계층 단위 테스트)

## 구조

```
app/                 라우트 (얇게 유지 — 입력 검증 + 도메인 호출)
lib/domain/          순수 도메인 로직 (Next.js 비의존, 단위 테스트 대상)
lib/db/              Drizzle 스키마·마이그레이션·조회
lib/actions/         Server Actions (트랜잭션 경계)
lib/auth/            세션 (jose 서명 쿠키)
components/          뷰어(접기/목차/Mermaid) + 관리 UI
proxy.ts             /admin 접근 차단 (Next 16: 구 middleware)
```

## 로컬 개발

1. 의존성 설치: `npm i`
2. 개발 DB 기동 (Docker Desktop 필요): `docker compose -f docker-compose.dev.yml up -d`
3. `.env` 작성 (`.env.example` 참조)
4. 마이그레이션 적용: `npm run db:migrate`
5. 개발 서버: `npm run dev` → http://localhost:3000
6. 관리 화면: `/admin` (`.env`의 `ADMIN_PASSWORD_HASH`에 해당하는 비밀번호로 로그인)

테스트: `npm test`

## 운영 배포 (Linux 서버, Docker Compose)

1. 서버에 저장소 복사 후 루트에 `.env` 작성:

   ```
   POSTGRES_PASSWORD=<강한 비밀번호>
   SESSION_SECRET=<openssl rand -hex 32>
   ADMIN_PASSWORD_HASH=<node -e "console.log(require('bcryptjs').hashSync('비밀번호', 10))">
   ```

   > 주의: docker compose는 `.env`의 `$`를 변수 치환으로 해석합니다. bcrypt 해시의
   > `$`는 반드시 `$$`로 이스케이프해서 적으세요 (예: `$2b$10$...` → `$$2b$$10$$...`).

2. 빌드 및 기동:

   ```bash
   docker compose up -d --build
   ```

   - `migrate` 서비스가 앱 시작 전에 마이그레이션을 1회 실행합니다.
   - 앱은 3000 포트로 노출됩니다. 리버스 프록시(nginx 등)에서 TLS를 처리하세요.

3. 업데이트 배포: `git pull && docker compose up -d --build`

## 스키마 변경 시

1. `lib/db/schema.ts` 수정
2. `npm run db:generate` 로 마이그레이션 SQL 생성 (`lib/db/migrations/`)
3. 로컬: `npm run db:migrate` / 운영: 재배포 시 migrate 서비스가 적용
