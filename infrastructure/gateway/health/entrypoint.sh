#!/bin/sh
# =============================================================================
# Noema Health Aggregator — Entrypoint
# =============================================================================
# Starts a minimal HTTP server using socat that delegates each request to
# health-check.sh. Supports concurrent connections via fork.
#
# The health aggregator listens on port 8090 and responds to ANY path with
# the aggregated health status of all downstream services.
# =============================================================================

set -e

echo "[health-aggregator] Starting on port ${PORT:-8090}..."
echo "[health-aggregator] Checking services:"
echo "  user-service:            ${USER_SERVICE_URL:-http://host.docker.internal:3002}"
echo "  session-service:         ${SESSION_SERVICE_URL:-http://host.docker.internal:3003}"
echo "  content-service:         ${CONTENT_SERVICE_URL:-http://host.docker.internal:3005}"
echo "  knowledge-graph-service: ${KNOWLEDGE_GRAPH_SERVICE_URL:-http://host.docker.internal:3006}"
echo "  scheduler-service:       ${SCHEDULER_SERVICE_URL:-http://host.docker.internal:3009}"
echo "  hlr-sidecar:             ${HLR_SIDECAR_URL:-http://hlr-sidecar:8020}"

exec socat \
  TCP-LISTEN:${PORT:-8090},reuseaddr,fork \
  EXEC:/usr/local/bin/health-check.sh
