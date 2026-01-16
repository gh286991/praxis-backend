FROM node:20-alpine AS builder

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy root workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy backend package file
COPY backend/package.json ./backend/

# Install dependencies for workspace (including backend)
RUN pnpm install --filter backend...

# Copy source code
COPY backend ./backend

# Build the application
WORKDIR /app/backend
RUN pnpm build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace config for pnpm
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY backend/package.json ./backend/

# Install PROD dependencies only (ensure no frozen-lockfile to handle out-of-sync lock)
RUN pnpm install --prod --filter backend

# Copy built app
COPY --from=builder /app/backend/dist ./backend/dist

WORKDIR /app/backend
CMD ["node", "dist/main"]
