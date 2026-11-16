FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable

WORKDIR /workspace

FROM base AS build

ARG SERVICE_PACKAGE

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY patches ./patches
COPY services ./services
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter "${SERVICE_PACKAGE}..." build
RUN pnpm --filter "${SERVICE_PACKAGE}" --prod deploy --legacy /out

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /out/ ./

CMD ["node", "dist/index.js"]
