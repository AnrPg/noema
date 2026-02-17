# syntax=docker/dockerfile:1.4

# ============================================================================
# User Service Dockerfile
# Multi-stage build for production optimization
# ============================================================================

# ----------------------------------------------------------------------------
# Base stage - Common dependencies
# ----------------------------------------------------------------------------
FROM node:22-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set working directory
WORKDIR /app

# Install essential build tools
RUN apk add --no-cache libc6-compat

# ----------------------------------------------------------------------------
# Dependencies stage - Install all dependencies
# ----------------------------------------------------------------------------
FROM base AS deps

# Copy workspace configuration
COPY pnpm-workspace.yaml ./
COPY package.json pnpm-lock.yaml ./

# Copy package.json files for all packages
COPY packages/types/package.json ./packages/types/
COPY packages/events/package.json ./packages/events/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/validation/package.json ./packages/validation/
COPY packages/config/package.json ./packages/config/
COPY services/user-service/package.json ./services/user-service/

# Install dependencies
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ----------------------------------------------------------------------------
# Builder stage - Build the service
# ----------------------------------------------------------------------------
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY --from=deps /app/packages/events/node_modules ./packages/events/node_modules
COPY --from=deps /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=deps /app/packages/validation/node_modules ./packages/validation/node_modules
COPY --from=deps /app/packages/config/node_modules ./packages/config/node_modules
COPY --from=deps /app/services/user-service/node_modules ./services/user-service/node_modules

# Copy source code
COPY packages/types ./packages/types
COPY packages/events ./packages/events
COPY packages/contracts ./packages/contracts
COPY packages/validation ./packages/validation
COPY packages/config ./packages/config
COPY services/user-service ./services/user-service
COPY tsconfig.json tsconfig.build.json ./

# Build packages first (dependency order)
RUN pnpm --filter @noema/types build
RUN pnpm --filter @noema/events build
RUN pnpm --filter @noema/contracts build
RUN pnpm --filter @noema/validation build
RUN pnpm --filter @noema/config build

# Generate Prisma client
RUN cd services/user-service && pnpm prisma generate

# Build user-service
RUN pnpm --filter @noema/user-service build

# ----------------------------------------------------------------------------
# Production stage - Minimal runtime image
# ----------------------------------------------------------------------------
FROM node:22-alpine AS runner

# Don't run as root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 noema

# Set working directory
WORKDIR /app

# Copy package files
COPY --from=builder /app/package.json ./
COPY --from=builder /app/services/user-service/package.json ./services/user-service/

# Copy built artifacts
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/
COPY --from=builder /app/packages/events/dist ./packages/events/dist
COPY --from=builder /app/packages/events/package.json ./packages/events/
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /app/packages/contracts/package.json ./packages/contracts/
COPY --from=builder /app/packages/validation/dist ./packages/validation/dist
COPY --from=builder /app/packages/validation/package.json ./packages/validation/
COPY --from=builder /app/packages/config/dist ./packages/config/dist
COPY --from=builder /app/packages/config/package.json ./packages/config/

COPY --from=builder /app/services/user-service/dist ./services/user-service/dist
COPY --from=builder /app/services/user-service/prisma ./services/user-service/prisma
COPY --from=builder /app/services/user-service/node_modules/.prisma ./services/user-service/node_modules/.prisma
COPY --from=builder /app/services/user-service/node_modules/@prisma ./services/user-service/node_modules/@prisma

# Copy production node_modules
COPY --from=deps /app/node_modules ./node_modules

# Set ownership
RUN chown -R noema:nodejs /app

# Switch to non-root user
USER noema

# Set environment
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health/live || exit 1

# Start the service
WORKDIR /app/services/user-service
CMD ["node", "dist/index.js"]
