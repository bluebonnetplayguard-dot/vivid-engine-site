# One image for the whole app: builds the React site and the API, and the API
# serves both. Works the same on a Droplet (behind Nginx) and on App Platform.
#   docker build -t vivid-engine .
#   docker run -p 8080:8080 --env-file infra/.env vivid-engine

# 1) Build the website (Vite -> static files)
FROM node:22-bookworm-slim AS site
WORKDIR /site
# The lock file pins the exact, tested versions (including Linux builds of Tailwind's native helpers).
COPY site/package.json site/package-lock.json site/.npmrc ./
RUN npm ci --no-audit --no-fund
COPY site/ ./
RUN npm run build

# 2) Build the API (TypeScript -> JavaScript)
FROM node:22-bookworm-slim AS api
WORKDIR /api
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build && npm prune --omit=dev

# 3) Runtime: compiled code only, non-root user
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8080 STATIC_DIR=/app/public
WORKDIR /app
COPY --from=api /api/node_modules ./node_modules
COPY --from=api /api/dist ./dist
COPY --from=api /api/package.json ./package.json
COPY --from=site /site/dist ./public
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
