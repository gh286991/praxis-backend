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

# Copy ONLY package.json (No pnpm-workspace.yaml or lockfile in standalone mode)
COPY package.json ./

# Install dependencies (No frozen lockfile since it might not exist in standalone repo)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install

# Copy source code (Context is ./backend, so we copy everything)
COPY . .

# Build the application
RUN pnpm build

# === Stage 3: Production Runner ===
FROM node:20-slim AS runner

WORKDIR /app

# Install pnpm and runtime dependencies
RUN npm install -g pnpm && corepack enable

# Install Python3 and NsJail dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    libprotobuf-dev \
    libnl-route-3-200 \
    && rm -rf /var/lib/apt/lists/*

# Copy NsJail binary from builder
COPY --from=nsjail-builder /bin/nsjail /usr/local/bin/nsjail

# Copy Backend Build Artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy NsJail Config (From the source copied in builder stage)
# In standalone repo, path is docker/nsjail/nsjail.cfg
COPY --from=builder /app/docker/nsjail/nsjail.cfg /app/nsjail.cfg

# Default Frontend URL (Override at runtime with -e)
ENV FRONTEND_URL=http://localhost:3000

EXPOSE 3001

CMD ["node", "dist/main"]
