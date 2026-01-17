# === Stage 1: Build NestJS App ===
FROM node:20-bookworm-slim AS builder

# Install pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Copy package.json (standalone mode)
COPY package.json ./

# Install dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install

# Copy source code
COPY . .

# Build the application
RUN pnpm build

# === Stage 2: Production Runner ===
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm && corepack enable

# Install Docker CLI (for docker-socket execution mode)
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*

# Copy Backend Build Artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Create temp directory for code execution
RUN mkdir -p /app/temp && chmod 777 /app/temp

# Environment Variables
ENV FRONTEND_URL=http://localhost:3000
# Execution mode: docker-socket (default), nsjail, or docker-exec
ENV EXECUTION_MODE=docker-socket

EXPOSE 3001

CMD ["node", "dist/main"]
