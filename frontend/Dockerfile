# syntax=docker/dockerfile:1
# Next.js image (standalone output). Build context is the repository root, because the npm
# workspace lockfile lives there:  docker build -f frontend/Dockerfile --build-arg API_URL=... .

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci -w frontend -w @embrace/shared
# The shared schemas package is compiled before the app that imports it.
COPY packages/shared packages/shared
RUN npm run -w @embrace/shared build
COPY frontend frontend
# Next.js resolves rewrites() at build time, so the backend origin is baked into the build.
ARG API_URL=http://localhost:5000
ENV API_URL=$API_URL
RUN npm run -w frontend build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
# outputFileTracingRoot is the workspace root, so the standalone tree mirrors the repository.
COPY --from=build --chown=node:node /app/frontend/.next/standalone ./
COPY --from=build --chown=node:node /app/frontend/.next/static frontend/.next/static
COPY --from=build --chown=node:node /app/frontend/public frontend/public
USER node
EXPOSE 3000
CMD ["node", "frontend/server.js"]
