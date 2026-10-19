FROM node:22.23.2-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:22.23.2-bookworm-slim AS controller
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY migrations ./migrations
RUN mkdir -p /data/jobs /data/cache && chown -R node:node /data
USER node
CMD ["node", "dist/server.js"]

FROM controller AS runner
USER root
ARG CODEX_VERSION=0.163.0
RUN npm install -g @openai/codex@${CODEX_VERSION} --ignore-scripts --no-audit --no-fund && npm cache clean --force && mkdir -p /codex && chown node:node /codex
USER node
CMD ["node", "dist/runner-server.js"]
