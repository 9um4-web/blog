# ---------- deps ----------
FROM node:24-alpine AS deps
WORKDIR /app
# @gogum4/editor-* 패키지(관리자 시각 편집기)는 GitHub Packages에서 받는다. 토큰은 이미지에 남지 않게 BuildKit 비밀(id=npmrc)로만 준다:
#   docker build --secret id=npmrc,src=$HOME/.npmrc ...  (파일에 //npm.pkg.github.com/:_authToken=… 줄이 있어야 한다)
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci

# ---------- build ----------
# 이 스테이지는 마이그레이션 실행용 이미지로도 사용된다 (docker-compose.yml의 migrate 서비스)
FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- run ----------
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
