#!/bin/sh
# =============================================================================
# Noema Health Aggregator — Service Health Check Script
# =============================================================================
# Called by socat for each incoming HTTP connection. Checks all downstream
# services in parallel and returns aggregated JSON health status.
#
# Environment variables (set in docker-compose):
#   USER_SERVICE_URL            - Default: http://host.docker.internal:3002
#   SESSION_SERVICE_URL         - Default: http://host.docker.internal:3003
#   CONTENT_SERVICE_URL         - Default: http://host.docker.internal:3005
#   KNOWLEDGE_GRAPH_SERVICE_URL - Default: http://host.docker.internal:3006
#   SCHEDULER_SERVICE_URL       - Default: http://host.docker.internal:3009
#   HLR_SIDECAR_URL             - Default: http://hlr-sidecar:8020
# =============================================================================

set -e

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
USER_SERVICE_URL="${USER_SERVICE_URL:-http://host.docker.internal:3002}"
SESSION_SERVICE_URL="${SESSION_SERVICE_URL:-http://host.docker.internal:3003}"
CONTENT_SERVICE_URL="${CONTENT_SERVICE_URL:-http://host.docker.internal:3005}"
KNOWLEDGE_GRAPH_SERVICE_URL="${KNOWLEDGE_GRAPH_SERVICE_URL:-http://host.docker.internal:3006}"
SCHEDULER_SERVICE_URL="${SCHEDULER_SERVICE_URL:-http://host.docker.internal:3009}"
HLR_SIDECAR_URL="${HLR_SIDECAR_URL:-http://hlr-sidecar:8020}"

TIMEOUT=5

# ---------------------------------------------------------------------------
# Read HTTP request (socat pipes raw TCP — we must consume the request)
# ---------------------------------------------------------------------------
while IFS= read -r line; do
  # Strip carriage return
  line="${line%%[[:cntrl:]]}"
  # Empty line signals end of HTTP headers
  [ -z "$line" ] && break
done

# ---------------------------------------------------------------------------
# Check individual services
# ---------------------------------------------------------------------------
check_service() {
  local name="$1"
  local url="$2"
  local health_path="$3"
  local critical="$4"

  if curl -sf --max-time "$TIMEOUT" "${url}${health_path}" > /dev/null 2>&1; then
    echo "${name}:healthy:${critical}"
  else
    echo "${name}:unhealthy:${critical}"
  fi
}

# Tmp directory for parallel results
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# Launch all health checks in parallel
check_service "user-service"            "$USER_SERVICE_URL"            "/health/ready" "true"  > "$TMPDIR/1" &
check_service "session-service"         "$SESSION_SERVICE_URL"         "/health/ready" "true"  > "$TMPDIR/2" &
check_service "content-service"         "$CONTENT_SERVICE_URL"         "/health/ready" "true"  > "$TMPDIR/3" &
check_service "knowledge-graph-service" "$KNOWLEDGE_GRAPH_SERVICE_URL" "/health/ready" "true"  > "$TMPDIR/4" &
check_service "scheduler-service"       "$SCHEDULER_SERVICE_URL"       "/health/ready" "true"  > "$TMPDIR/5" &
check_service "hlr-sidecar"             "$HLR_SIDECAR_URL"            "/health"       "false" > "$TMPDIR/6" &

# Wait for all background jobs
wait

# ---------------------------------------------------------------------------
# Aggregate results into JSON
# ---------------------------------------------------------------------------
overall="healthy"
services_json="{"
first=true

for f in "$TMPDIR"/*; do
  result=$(cat "$f")
  name=$(echo "$result" | cut -d: -f1)
  status=$(echo "$result" | cut -d: -f2)
  critical=$(echo "$result" | cut -d: -f3)

  if [ "$first" = true ]; then
    first=false
  else
    services_json="${services_json},"
  fi
  services_json="${services_json}\"${name}\":\"${status}\""

  # If a critical service is unhealthy, degrade overall status
  if [ "$status" = "unhealthy" ] && [ "$critical" = "true" ]; then
    overall="degraded"
  fi
done

services_json="${services_json}}"

# Count healthy/total
total=6
healthy_count=$(cat "$TMPDIR"/* | grep -c ":healthy:" || true)

# If all critical services are down, mark as unhealthy
critical_down=$(cat "$TMPDIR"/* | grep ":unhealthy:true" | wc -l)
if [ "$critical_down" -ge 3 ]; then
  overall="unhealthy"
fi

# Build final JSON
timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
body=$(cat <<EOF
{"overall":"${overall}","services":${services_json},"summary":{"healthy":${healthy_count},"total":${total}},"timestamp":"${timestamp}"}
EOF
)

# ---------------------------------------------------------------------------
# Output HTTP response
# ---------------------------------------------------------------------------
content_length=$(printf '%s' "$body" | wc -c)

printf "HTTP/1.1 200 OK\r\n"
printf "Content-Type: application/json\r\n"
printf "Content-Length: %d\r\n" "$content_length"
printf "Connection: close\r\n"
printf "Cache-Control: no-cache, no-store\r\n"
printf "\r\n"
printf "%s" "$body"
