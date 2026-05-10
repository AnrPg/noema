# Rollback Tooling Reference

## Purpose

This document explains the release snapshot and rollback tooling under
[`scripts/release`](/C:/Users/anr/Apps/noema/scripts/release).

Use this guide when you need to:

- create pre-migration rollback assets
- understand what the release manifest records
- apply forward Prisma migrations in a controlled way
- restore PostgreSQL state from a previously captured release snapshot
- understand the difference between safe persistent-environment usage and
  disposable-environment recovery flags

This tooling is intentionally snapshot-based. It does not attempt to reverse
Prisma migrations.

## Files

- [`config.cjs`](/C:/Users/anr/Apps/noema/scripts/release/config.cjs)
  Canonical service map, artifact root, and Redis snapshot config.
- [`shared.cjs`](/C:/Users/anr/Apps/noema/scripts/release/shared.cjs)
  Shared helpers for env resolution, Docker client fallback, manifest helpers,
  and Prisma command resolution.
- [`create-rollback-snapshot.cjs`](/C:/Users/anr/Apps/noema/scripts/release/create-rollback-snapshot.cjs)
  Creates PostgreSQL dumps, a Redis RDB snapshot, and the release manifest.
- [`apply-migrations.cjs`](/C:/Users/anr/Apps/noema/scripts/release/apply-migrations.cjs)
  Applies forward Prisma migrations using the same environment captured by the
  snapshot.
- [`restore-rollback-snapshot.cjs`](/C:/Users/anr/Apps/noema/scripts/release/restore-rollback-snapshot.cjs)
  Restores PostgreSQL dumps recorded in the manifest. Redis restore remains a
  manual operator step.
- [`manifest-schema.json`](/C:/Users/anr/Apps/noema/scripts/release/manifest-schema.json)
  Shape contract for `rollback-manifest.json`.

## Covered Services

The tooling currently manages these Prisma-backed databases:

- `user-service`
- `content-service`
- `scheduler-service`
- `session-service`
- `gamification-service`
- `knowledge-graph-service`
- `metacognition-service`
- `ingestion-service`
- `pedagogy-guardian-service`
- `curriculum-service`

The canonical mapping lives in
[`config.cjs`](/C:/Users/anr/Apps/noema/scripts/release/config.cjs).

## Command Summary

### Snapshot

```bash
pnpm release:snapshot -- --release-id <release-id>
```

Creates:

- one PostgreSQL custom-format dump per existing service database
- one Redis RDB snapshot
- one manifest tying the artifacts to a git SHA and environment source

### Snapshot Dry Run

```bash
pnpm release:snapshot:dry-run -- --release-id <release-id>
```

Validates:

- env resolution
- database discovery
- Prisma migration status collection
- manifest generation

Does not create the actual dumps.

### Forward Migration

```bash
pnpm release:migrate -- --release-id <release-id> --ensure-databases
```

Applies forward Prisma migrations using the same env source that the snapshot
used.

`--ensure-databases` creates missing databases before migrating them and enables
the standard PostgreSQL extensions used by this repo.

### Forward Migration Dry Run

```bash
pnpm release:migrate:dry-run -- --release-id <release-id> --ensure-databases
```

Validates the migration plan and updates the manifest with dry-run results
without actually applying Prisma migrations.

### PostgreSQL Restore

```bash
pnpm release:restore -- --release-id <release-id>
```

Restores only PostgreSQL state recorded in the manifest.

Redis restore is intentionally manual and is described below.

## Required Inputs

The scripts resolve configuration in this order:

1. explicit `--env-file`
2. the env file recorded in the release manifest
3. the repo default [` .env `](/C:/Users/anr/Apps/noema/.env)

For service databases, the preferred source is the service-specific variable:

- `DATABASE_URL_USER`
- `DATABASE_URL_CONTENT`
- `DATABASE_URL_SCHEDULER`
- `DATABASE_URL_SESSION`
- `DATABASE_URL_GAMIFICATION`
- `DATABASE_URL_KNOWLEDGE_GRAPH`
- `DATABASE_URL_METACOGNITION`
- `DATABASE_URL_INGESTION`
- `DATABASE_URL_PEDAGOGY_GUARDIAN`
- `DATABASE_URL_CURRICULUM`

If a service-specific URL is missing, the tooling will derive one from:

- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_HOST`
- `POSTGRES_PORT`
- optional `POSTGRES_SCHEMA`
- optional `POSTGRES_SSLMODE`

Redis is resolved from:

- `REDIS_URL`

or derived from:

- `REDIS_HOST`
- `REDIS_PORT`
- optional `REDIS_PASSWORD`

## Artifact Layout

Artifacts are written under:

- [`.release-artifacts`](/C:/Users/anr/Apps/noema/.release-artifacts)

Each release gets its own directory:

- `.release-artifacts/<release-id>/rollback-manifest.json`
- `.release-artifacts/<release-id>/dumps/<service>.dump`
- `.release-artifacts/<release-id>/dumps/redis-dump.rdb`

## Manifest Semantics

The manifest is the source of truth for the release snapshot.

Important fields:

- `schemaVersion`
  Version of the manifest contract.
- `releaseId`
  Human-chosen or auto-generated release identifier.
- `repo.gitSha`
  Exact commit the snapshot was taken against.
- `repo.gitBranch`
  Branch at snapshot time.
- `services[*].databaseExisted`
  Whether the database existed when the snapshot was taken.
- `services[*].statusBefore`
  Raw Prisma migration status before forward migration.
- `services[*].statusAfter`
  Raw Prisma migration status after forward migration.
- `services[*].dumpFile`
  Dump file path if the database existed at snapshot time.
- `migrationRun.results[*].createdDatabase`
  Whether the forward run created the database.
- `migrationRun.results[*].resetUnmanaged`
  Whether the forward run recreated an unmanaged database before migrating.
- `redis.dumpFile`
  RDB snapshot path.
- `status.snapshotCreated`
  Whether the snapshot was real or just a dry run.
- `status.migrationsApplied`
  Whether forward migrations actually ran.

## Docker Client Fallback

The tooling prefers local CLI binaries when available:

- `pg_dump`
- `pg_restore`
- `psql`
- `redis-cli`

If they are missing, it falls back to Docker images:

- `postgres:16-alpine`
- `redis:7-alpine`

This is why the operator machine only needs Docker installed in many cases.

## Safe vs Destructive Flags

### `--ensure-databases`

Safe in both persistent and disposable environments.

It creates missing databases and enables:

- `uuid-ossp`
- `pgcrypto`
- `pg_trgm`

### `--reset-unmanaged-databases`

Destructive. Disposable environments only.

Use this only when a database exists but Prisma reports:

- `The current database is not managed by Prisma Migrate`

What it does:

1. terminates active connections
2. drops the database
3. recreates it
4. re-enables the standard PostgreSQL extensions
5. runs the Prisma migration chain from the beginning

Do not use this in a persistent environment unless you have explicitly decided
to replace the current database contents and you already have a valid rollback
snapshot.

## Redis Restore

Redis is not restored automatically because deployment models differ and Redis
process ownership is environment-specific.

The intended restore flow is:

1. stop Redis
2. replace the active RDB file with the manifest snapshot
3. restart Redis
4. only then re-enable services and event consumers

Treat Redis as part of the rollback boundary whenever event streams, outboxes,
or consumer offsets matter to correctness.

## Recommended Persistent-Environment Workflow

1. Validate env resolution:
   - `pnpm release:snapshot:dry-run -- --release-id <release-id> --env-file <env-file>`
2. Create the real rollback snapshot:
   - `pnpm release:snapshot -- --release-id <release-id> --env-file <env-file>`
3. Verify the manifest exists and is on durable storage.
4. Apply forward migrations:
   - `pnpm release:migrate -- --release-id <release-id> --env-file <env-file> --ensure-databases`
5. Deploy the matching application version.
6. Run service health and smoke checks.

## Recommended Disposable-Environment Workflow

If local/dev databases are partially drifted or unmanaged:

1. Create the snapshot anyway:
   - `pnpm release:snapshot -- --release-id <release-id>`
2. Apply forward migrations with disposable reset enabled:
   - `pnpm release:migrate -- --release-id <release-id> --ensure-databases --reset-unmanaged-databases`

This is appropriate for local Docker infra, ephemeral test environments, or
rebuildable staging clones where data replacement is acceptable.

## Troubleshooting

### `prisma migrate status` reports failed migrations

Meaning:

- Prisma migration bookkeeping already contains a failed attempt.

Typical recovery:

1. fix the migration SQL or schema problem
2. use `prisma migrate resolve --rolled-back <migration_name>` for that service
3. rerun `pnpm release:migrate`

### Database object already exists

Meaning:

- the migration was not resilient to preexisting state
- or the environment drifted before the migration chain ran

Preferred fix:

- harden the migration SQL so it is safe against the existing object state

### A service database does not exist yet

This is fine.

The snapshot manifest will record:

- `databaseExisted: false`
- no PostgreSQL dump for that service

During forward migration, `--ensure-databases` will create it.

### Local machine is missing `pg_dump` or `redis-cli`

This is fine if Docker is installed.

The scripts will fall back to containerized clients automatically.

## Related Docs

- [Live Migration Rollback Runbook](/C:/Users/anr/Apps/noema/docs/ops/live-migration-rollback-runbook.md)
- [`.env.example`](/C:/Users/anr/Apps/noema/.env.example)
- [Postgres Init Script](/C:/Users/anr/Apps/noema/infrastructure/scripts/postgres-init/01-init-databases.sh)
