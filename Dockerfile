FROM node:20-bookworm-slim AS base
WORKDIR /usr/src
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS builder
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install
COPY . .
RUN pnpm build

FROM node:20-bookworm-slim AS runtime
WORKDIR /usr/app
COPY --from=builder /usr/src/dist/output ./output
ENV HOST=0.0.0.0 PORT=4444 NODE_ENV=production
EXPOSE 4444
CMD ["node", "output/server/index.mjs"]
