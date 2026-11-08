FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
# Адрес API для прокси /api/* — вшивается в сборку (rewrites)
ARG API_URL=http://backend:8000
ENV API_URL=$API_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 corede && adduser -S -u 1001 -G corede corede
COPY --from=build --chown=corede:corede /app/.next/standalone ./
COPY --from=build --chown=corede:corede /app/.next/static ./.next/static
COPY --from=build --chown=corede:corede /app/public ./public
USER corede
EXPOSE 3000
CMD ["node", "server.js"]
