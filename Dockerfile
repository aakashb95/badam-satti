FROM node:22-bookworm-slim AS badam-client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-bookworm-slim AS kings-client-build
WORKDIR /app/kings-corner/client
COPY kings-corner/client/package*.json ./
RUN npm ci
COPY kings-corner/client/ ./
RUN npm run build

FROM node:22-bookworm-slim AS badam-server-deps
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS kings-server-deps
WORKDIR /app/kings-corner/server
COPY kings-corner/server/package*.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS badam-runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5001 DB_PATH=/data/badam-satti.db
WORKDIR /app
COPY --from=badam-server-deps /app/server/node_modules ./server/node_modules
COPY server ./server
COPY landing ./landing
COPY --from=badam-client-build /app/client/dist ./client/dist
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 5001
CMD ["node", "server/index.js"]

FROM node:22-bookworm-slim AS kings-runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5100
WORKDIR /app/kings-corner
COPY --from=kings-server-deps /app/kings-corner/server/node_modules ./server/node_modules
COPY kings-corner/server ./server
COPY --from=kings-client-build /app/kings-corner/client/dist ./client/dist
RUN chown -R node:node /app
USER node
EXPOSE 5100
CMD ["node", "server/index.js"]
