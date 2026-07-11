# Single image that runs either process:
#   web    -> `node build`                          (default CMD)
#   worker -> `node --import tsx src/worker/index.ts` (command override in compose)
# The SvelteKit (adapter-node) output in build/ is self-contained; the worker
# runs the TypeScript source via tsx, so prod deps include tsx + postgres.

# ---- builder: install everything and build the app ----
FROM node:22-slim AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# Env is read at runtime (not import/build), so the build needs no secrets.
RUN pnpm build

# ---- runner: production deps + build output + worker source ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=builder /app/build ./build
COPY src ./src
COPY db ./db
COPY scripts ./scripts

EXPOSE 3000
# Default process is the web server; the worker service overrides this.
CMD ["node", "build"]
