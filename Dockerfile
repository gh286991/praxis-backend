FROM node:20-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# Stage 1: Prod Dependencies
FROM base AS prod-deps
COPY package.json ./
# Use --prod to install only production dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --ignore-scripts --config.auto-install-peers=true

# Stage 2: Build
FROM base AS builder
COPY package.json ./
# Install all dependencies for build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile=false
COPY . .
RUN pnpm build

# Stage 3: Runner
FROM base AS runner

# Install Docker CLI and Python (Runtime requirements)
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y docker-ce-cli python3-full \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy production dependencies
COPY --from=prod-deps /app/node_modules ./node_modules
# Copy build artifacts
COPY --from=builder /app/dist ./dist
# Copy package.json
COPY --from=builder /app/package.json ./package.json

# Create temp directory
RUN mkdir -p /app/temp && chmod 777 /app/temp

# Environment Variables
ENV NODE_ENV=production
ENV FRONTEND_URL=http://localhost:3000
ENV EXECUTION_MODE=docker-socket

EXPOSE 3001

CMD ["node", "dist/src/main"]
