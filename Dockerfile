# La Sala server + built web app in one image.
# Node 24 is required: the server uses the built-in node:sqlite.
FROM node:24-slim

WORKDIR /app

# Install all workspace dependencies first so this layer is cached
# until a package.json or the lockfile changes.
COPY package.json package-lock.json ./
COPY packages/domain/package.json packages/domain/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/web/package.json packages/web/package.json
RUN npm ci

COPY . .
RUN npm run build -w packages/web

# The SQLite file lives on a volume mounted at /data, owned by the non-root user.
RUN mkdir -p /data && chown node:node /data
VOLUME /data

# ADMIN_PIN is deliberately NOT set here: provide it at runtime (compose env_file).
# `npm start -w @la-sala/server` runs inside packages/server, so WEB_DIST is ../web/dist.
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/la-sala.sqlite \
    WEB_DIST=../web/dist

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

# tsx (a dev dependency) runs the TypeScript source, so dev dependencies stay installed.
CMD ["npm", "start", "-w", "@la-sala/server"]
