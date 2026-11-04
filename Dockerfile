# Shree P2P — multi-stage build: static client + Node signaling server.

FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig*.json vite.config.ts ./
RUN npm ci

COPY . .
RUN npm run build

# Production Stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4050

RUN addgroup -S shree && adduser -S shree -G shree

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server

USER shree

EXPOSE 4050

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:$PORT/api/health" > /dev/null || exit 1

CMD ["npx", "tsx", "server/server.ts"]
