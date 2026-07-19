################################################################################
# Builder stage
#
# NOTE: the build context is the *repository root*, not this directory, because
# this is an npm workspace: the root lockfile and the sibling packages are both
# required. Build with:
#   docker build -f packages/mysa2mqtt/Dockerfile .
FROM node:26-alpine AS builder

WORKDIR /app

# Copy the workspace manifests first so dependency installation stays cacheable.
COPY package.json package-lock.json ./
COPY packages/mysa2mqtt/package.json packages/mysa2mqtt/
COPY packages/mysa-js-sdk/package.json packages/mysa-js-sdk/
COPY packages/mqtt2ha/package.json packages/mqtt2ha/

RUN npm ci --ignore-scripts

# Copy sources and build, libraries first (mysa2mqtt consumes their dist output).
COPY tsconfig.base.json ./
COPY packages/mqtt2ha packages/mqtt2ha
COPY packages/mysa-js-sdk packages/mysa-js-sdk
COPY packages/mysa2mqtt packages/mysa2mqtt

RUN npm run build

################################################################################
# Final stage
FROM node:26-alpine AS final

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

# Install production dependencies only. The version in packages/mysa2mqtt/package.json
# is already correct here -- changesets writes it during the release, so there is no
# version stamping to do.
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/packages/mysa2mqtt/package.json packages/mysa2mqtt/
COPY --from=builder /app/packages/mysa-js-sdk/package.json packages/mysa-js-sdk/
COPY --from=builder /app/packages/mqtt2ha/package.json packages/mqtt2ha/

RUN npm ci --omit=dev --ignore-scripts && \
  npm cache clean --force

# Copy the built output. All three are required: `npm ci` links mysa-js-sdk and
# mqtt2ha as symlinks into packages/, so their dist/ must exist or the CLI fails
# at first import with ERR_MODULE_NOT_FOUND.
COPY --from=builder /app/packages/mysa2mqtt/dist packages/mysa2mqtt/dist
COPY --from=builder /app/packages/mysa-js-sdk/dist packages/mysa-js-sdk/dist
COPY --from=builder /app/packages/mqtt2ha/dist packages/mqtt2ha/dist

# Change ownership to non-root user
RUN chown -R mysa2mqtt:nodejs /app
USER mysa2mqtt

ENTRYPOINT ["node", "packages/mysa2mqtt/dist/main.js"]
