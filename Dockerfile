# --- BASE IMAGE ---
FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Install Chromium and system dependencies for whatsapp-web.js / Puppeteer
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV WWEBJS_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /usr/src/app

# --- BUILD STAGE ---
FROM base AS build
COPY package.json pnpm-lock.yaml ./
# If lock file doesn't exist, we run pnpm install without lockfile check
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile || pnpm install

COPY . .
# Generate prisma client before building the NestJS app
RUN npx prisma generate
RUN pnpm run build

# Install production only dependencies
RUN rm -rf node_modules && \
    --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile || pnpm install --prod

# --- PRODUCTION RUNNER ---
FROM base AS runner
ENV NODE_ENV=production

# Copy built application and node_modules from build stage
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/package.json ./package.json
COPY --from=build /usr/src/app/prisma ./prisma

# Create directory for wwebjs session storage and set permissions to 'node' user
RUN mkdir -p ./wwebjs_sessions && chown -R node:node ./wwebjs_sessions

USER node
EXPOSE 3000

# Healthcheck configuration using curl (or a simple node script if curl isn't in slim, but we can call a health check API endpoint)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/v1/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Default command starts the API
CMD [ "node", "dist/main.js" ]
