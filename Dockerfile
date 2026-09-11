# syntax=docker/dockerfile:1

# ── Build ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Manifests first, so the dependency layer stays cached until they change
# rather than on every source edit.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci

COPY . .
RUN npm run build

# ── Runtime ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

# Only the server's production dependencies. The client is a static bundle by
# this point and needs nothing installed, and @buzzroom/shared is compiled
# into the server bundle rather than resolved at runtime.
RUN npm ci --omit=dev -w @buzzroom/server --include-workspace-root \
  && npm cache clean --force

COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/client/dist packages/client/dist

USER node
EXPOSE 3001

# Alpine has no curl; Node 22 has a global fetch, so the check needs nothing
# installed.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD \
  node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "packages/server/dist/index.js"]
