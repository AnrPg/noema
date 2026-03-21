# =============================================================================
# Noema Health Aggregator — Dockerfile
# =============================================================================
# Minimal Alpine container that serves an aggregated health check endpoint
# for all Noema backend services. Uses socat to handle HTTP connections and
# curl to probe downstream services.
#
# Build:  docker build -t noema-health-aggregator .
# Run:    docker run -p 8090:8090 noema-health-aggregator
# =============================================================================

FROM alpine:3.19

RUN apk add --no-cache \
    curl \
    jq \
    socat

COPY health-check.sh /usr/local/bin/health-check.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh

RUN sed -i 's/\r$//' /usr/local/bin/health-check.sh /usr/local/bin/entrypoint.sh \
    && chmod +x /usr/local/bin/health-check.sh /usr/local/bin/entrypoint.sh

EXPOSE 8090

HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD curl -sf http://localhost:8090/health || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
