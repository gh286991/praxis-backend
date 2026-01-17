# === Stage 1: Build NsJail ===
FROM python:3.11-slim AS nsjail-builder

RUN apt-get update && apt-get install -y \
    autoconf \
    bison \
    flex \
    gcc \
    g++ \
    git \
    libprotobuf-dev \
    libnl-route-3-dev \
    libtool \
    make \
    pkg-config \
    protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /tmp
RUN git clone https://github.com/google/nsjail.git
WORKDIR /tmp/nsjail
RUN make && mv nsjail /bin/nsjail

# === Stage 2: Build NestJS App ===
FROM node:20-slim AS builder

# Install pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Copy root workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy backend package file
COPY backend/package.json ./backend/

# Install dependencies (frozen lockfile for consistency)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Copy source code
COPY backend ./backend

# Build the application
WORKDIR /app/backend
RUN pnpm build

# === Stage 3: Production Runner ===
FROM node:20-slim AS runner

WORKDIR /app

# Install pnpm and runtime dependencies
RUN npm install -g pnpm && corepack enable

# Install Python3 and NsJail dependencies (libprotobuf, etc needed for running nsjail dynamic link)
# Also install libnl-route-3-200 which nsjail likely needs
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    libprotobuf-dev \
    libnl-route-3-200 \
    && rm -rf /var/lib/apt/lists/*

# Copy NsJail binary from builder
COPY --from=nsjail-builder /bin/nsjail /usr/local/bin/nsjail

# Copy Backend Build Artifacts
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy NsJail Config (We assume it's in backend/docker/nsjail/nsjail.cfg or similar)
# Since we are context /app/backend in docker-compose, but here the context is root workspace?
# Wait, user said "deployment I only use this", implying the context is likely root or backend.
# The original Dockerfile copied `backend/package.json` so context was root.
# We need to find where nsjail.cfg is. It's in `backend/docker/nsjail/nsjail.cfg`.
COPY --from=builder /app/backend/docker/nsjail/nsjail.cfg /app/nsjail.cfg

EXPOSE 3001

CMD ["node", "dist/main"]
