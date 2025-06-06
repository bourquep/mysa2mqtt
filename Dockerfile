################################################################################
# Builder stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files and install all dependencies for building
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy source code and build
COPY src ./src
COPY tsconfig.json .
COPY tsup.config.cjs .

RUN npm run build

################################################################################
# Final stage
FROM node:22-alpine AS final

ARG VERSION

# Metadata
LABEL maintainer="Pascal Bourque <pascal@cosmos.moi>"
LABEL description="Expose Mysa smart thermostats to home automation platforms via MQTT."
LABEL org.opencontainers.image.source="https://github.com/bourquep/mysa2mqtt"
LABEL org.opencontainers.image.description="Expose Mysa smart thermostats to home automation platforms via MQTT"
LABEL org.opencontainers.image.licenses="MIT"

# Install security updates
RUN apk --no-cache upgrade

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
  adduser -S mysa2mqtt -u 1001

# Copy package files and install production dependencies only
COPY --from=builder /app/package*.json ./
RUN npm version ${VERSION} --no-git-tag-version && \
  npm ci --only=production --ignore-scripts && \
  npm cache clean --force

# Copy built application
COPY --from=builder /app/dist ./dist

# Change ownership to non-root user
RUN chown -R mysa2mqtt:nodejs /app
USER mysa2mqtt

ENTRYPOINT ["node", "dist/main.js"]
