FROM node:26.12.1-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
RUN npm install --global pnpm@11.25.0 --ignore-scripts --no-audit --no-fund

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch --store-dir=/pnpm/store --frozen-lockfile

FROM dependencies AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --store-dir=/pnpm/store --offline --frozen-lockfile
RUN pnpm build

FROM dependencies AS production-dependencies
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/domain/package.json ./packages/domain/package.json
RUN rm -rf /app/node_modules
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm --filter @acme/api... install --prod --offline --frozen-lockfile --store-dir=/pnpm/store

FROM node:26.12.1-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV STATIC_DIR=/app/apps/web/dist
WORKDIR /app/apps/api
COPY --from=production-dependencies /app/node_modules /app/node_modules
COPY --from=production-dependencies /app/apps/api/package.json ./package.json
COPY --from=production-dependencies /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/packages/domain/package.json /app/packages/domain/package.json
COPY --from=build /app/packages/domain/src /app/packages/domain/src
COPY --from=build /app/apps/web/dist /app/apps/web/dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/server.js"]
