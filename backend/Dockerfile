# syntax=docker/dockerfile:1
# Express API image. Build context is the repository root, because the npm workspace
# lockfile lives there:  docker build -f backend/Dockerfile .

FROM node:22-alpine AS build
# Prisma's engines need OpenSSL on Alpine.
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
# The schema is needed by the backend postinstall (prisma generate).
COPY backend/prisma.config.ts backend/
COPY backend/prisma backend/prisma
RUN npm ci -w backend -w @embrace/shared
# The API imports its input schemas from the compiled @embrace/shared package, so build it first.
COPY packages/shared packages/shared
RUN npm run -w @embrace/shared build
COPY backend backend
# prisma generate, then tsc for src/ (dist/) and prisma/seed.ts (dist/prisma/seed.js)
RUN npm run -w backend build

FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY backend/prisma.config.ts backend/
COPY backend/prisma backend/prisma
# Production dependencies only. The Prisma CLI stays: @prisma/client declares it as a peer,
# so npm keeps it with --omit=dev, and `migrate deploy` needs it at start-up. Generating the
# client here also fails the build early if the CLI is ever missing.
RUN npm ci -w backend --omit=dev \
  && npx -w backend prisma generate \
  && npm cache clean --force
# node_modules/@embrace/shared links to packages/shared, which needs only its compiled dist.
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/backend/dist backend/dist
WORKDIR /app/backend
USER node
EXPOSE 5000
# Migrate, seed, serve. The seed is idempotent: it upserts the roles and creates the first admin
# only when SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are set and that account does not exist yet.
ENTRYPOINT ["sh", "-c", "npx prisma migrate deploy && node dist/prisma/seed.js && node dist/server.js"]
