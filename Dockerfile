# ---------- deps ----------
FROM node:24-alpine AS deps
WORKDIR /app
# @9um4/editor-* 패키지(관리자 시각 편집기)는 레지스트리에 올라가기 전까지 vendor/의 tarball로 설치한다
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci

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
