# Build context is the repo root (not employer-api/) because the
# frontend imports the five asc_*_live.jsx dashboards directly from the
# repo root — see frontend/vite.config.js's alias workaround. There's no
# way to build the frontend from employer-api/ alone.

# ---- Stage 1: build the frontend ----
FROM node:20-alpine AS frontend-build
WORKDIR /repo

COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci

COPY asc_admin_dashboard_live.jsx asc_employer_dashboard_live.jsx \
     asc_funder_dashboard_live.jsx asc_learner_registration_live.jsx \
     asc_tsp_dashboard_live.jsx ./
COPY frontend ./frontend

# "" means same-origin relative API calls — server.js (stage 2) serves
# this build from the same process/origin, so no cross-origin call and
# no CORS_ORIGIN configuration is needed for the deployed app itself.
ENV VITE_API_BASE=""
RUN cd frontend && npm run build

# ---- Stage 2: the API runtime — same image runs both the web process
# (default CMD) and the background worker (override CMD to
# `node worker.js` at the host/compose level) ----
FROM node:20-alpine
WORKDIR /app/employer-api

COPY employer-api/package.json employer-api/package-lock.json ./
RUN npm ci --omit=dev

COPY employer-api/ .

# server.js resolves the frontend at path.join(__dirname, "../frontend/dist")
# — this has to land one level above employer-api/ to match that, the
# same relative position the two directories have in the repo itself.
COPY --from=frontend-build /repo/frontend/dist /app/frontend/dist

# storage.js writes uploads under ./uploads relative to this file —
# create it (and hand it to the non-root user) so a fresh container can
# write to it before any volume is mounted over it.
RUN mkdir -p uploads && addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "server.js"]
