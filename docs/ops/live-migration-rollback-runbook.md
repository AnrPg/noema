# Live Migration Rollback Runbook

## Purpose

This runbook defines the forward-only live migration process for Noema's
database-per-service architecture and the rollback assets that must exist before
any release starts.

The rollback mechanism is snapshot-based, not migration-reversal-based.

## Why Snapshot Rollback

- Several Prisma migrations are destructive.
- Service databases are independent, so each one can be dumped and restored
  deterministically.
- Redis stream state is part of runtime correctness, so it must be snapshotted
  with the databases.

## Release Boundary

The release boundary for a migration wave is:

- previous application version or image set
- PostgreSQL dumps for every migrated service database
- Redis RDB snapshot
- rollback manifest with exact git SHA, branch, env source, and per-service
  migration status

## Included Databases

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

## Commands

- `pnpm release:snapshot -- --release-id <release-id>`
  Create the rollback snapshot artifacts.
- `pnpm release:migrate -- --release-id <release-id> --ensure-databases`
  Apply all forward migrations using the same environment that the snapshot
  captured.
- `pnpm release:migrate -- --release-id <release-id> --ensure-databases --reset-unmanaged-databases`
  Disposable-environment recovery path only. Recreates databases that are not
  yet managed by Prisma Migrate so the migration chain can start cleanly.
- `pnpm release:restore -- --release-id <release-id>`
  Restore the PostgreSQL dumps recorded in the manifest.

## Dry-Run Validation

- `pnpm release:snapshot:dry-run -- --env-file <env-file>`
- `pnpm release:migrate:dry-run -- --release-id <release-id> --env-file <env-file> --ensure-databases`

Dry-run verifies environment resolution, migration status access, manifest
construction, and service coverage without applying restore or migrate changes.

## Preflight Checklist

- [ ] Deployment window approved.
- [ ] No unrelated deploys in flight.
- [ ] Target environment file or env vars are loaded.
- [ ] PostgreSQL and Redis are reachable from the operator machine.
- [ ] Snapshot manifest directory is on durable storage.
- [ ] Previous application release identifier is recorded.
- [ ] Event consumers can be paused or traffic can be minimized during the cut.

## Forward Migration Procedure

1. Create the rollback snapshot:
   - `pnpm release:snapshot -- --release-id <release-id>`
2. Verify the manifest exists:
   - `.release-artifacts/<release-id>/rollback-manifest.json`
3. Apply migrations:
   - `pnpm release:migrate -- --release-id <release-id> --ensure-databases`
4. Deploy the application version that matches the schema wave.
5. Run post-deploy health and smoke checks.

`--reset-unmanaged-databases` is only appropriate for disposable environments
where data loss is acceptable. Do not use it in a persistent environment unless
you have explicitly decided to replace the current database contents from
snapshots.

## Rollback Procedure

1. Re-deploy the previous application version.
2. Restore PostgreSQL state:
   - `pnpm release:restore -- --release-id <release-id>`
3. Restore Redis manually:
   - stop Redis
   - replace the active RDB file with the manifest snapshot
   - restart Redis
4. Start services in a controlled order.
5. Verify health, read models, and event consumers before opening traffic.

## Redis Notes

Redis restore is intentionally documented as a manual step because deployment
models differ. The snapshot artifact is still mandatory because stream offsets
and outbox/event-consumer state affect correctness after DB restore.

## Artifact Layout

Artifacts are written under:

- `C:\Users\anr\Apps\noema\.release-artifacts\<release-id>`

Expected files:

- `rollback-manifest.json`
- `dumps/<service>.dump`
- `dumps/redis-dump.rdb`

## Exit Criteria

- Snapshot manifest exists and is complete.
- Forward migrations have been recorded in the manifest.
- Application deploy is healthy.
- Rollback artifacts are retained until the release is declared stable.
