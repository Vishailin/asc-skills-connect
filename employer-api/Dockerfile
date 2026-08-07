# Same image runs both processes — the API (default CMD) and the
# background matching worker (override CMD to `node worker.js` at the
# host/compose level). No build step: this is plain Node, no bundler.
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# storage.js writes uploads under ./uploads relative to this file —
# create it (and hand it to the non-root user) so a fresh container
# can write to it before any volume is mounted over it.
RUN mkdir -p uploads && addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "server.js"]
