FROM node:20-bullseye-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-bullseye-slim
WORKDIR /app

# Install sqlite3 in case we need CLI access, and it helps with better-sqlite3 native bindings
RUN apt-get update && apt-get install -y --no-install-recommends \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

COPY server/package*.json ./server/
RUN cd server && npm install --production

COPY --from=builder /app/dist ./dist
COPY server ./server

EXPOSE 8080
ENV PORT=8080
ENV DB_PATH=/data/testara.db

CMD ["node", "server/index.js"]
