#!/bin/bash
# =============================================================================
# PostgreSQL Initialization Script
# =============================================================================
# Creates databases for each microservice following database-per-service pattern
# This script runs automatically when PostgreSQL container starts for the first time
# =============================================================================

set -e

echo "Initializing Noema databases..."

create_database() {
    local db_name=$1
    echo "Creating database: $db_name"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        SELECT 'CREATE DATABASE $db_name'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db_name')\gexec
EOSQL
}

create_database "noema_user"
create_database "noema_content"
create_database "noema_scheduler"
create_database "noema_session"
create_database "noema_gamification"
create_database "noema_knowledge_graph"
create_database "noema_metacognition"
create_database "noema_strategy"
create_database "noema_ingestion"
create_database "noema_analytics"
create_database "noema_sync"
create_database "noema_notification"
create_database "noema_media"
create_database "noema_collaboration"

for db in noema_user noema_content noema_scheduler noema_session noema_gamification noema_knowledge_graph noema_metacognition noema_strategy noema_ingestion noema_analytics noema_sync noema_notification noema_media noema_collaboration; do
    echo "Enabling extensions in $db..."
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<-EOSQL
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
        CREATE EXTENSION IF NOT EXISTS "pgcrypto";
        CREATE EXTENSION IF NOT EXISTS "pg_trgm";
EOSQL
done

echo "Noema databases initialized successfully!"
