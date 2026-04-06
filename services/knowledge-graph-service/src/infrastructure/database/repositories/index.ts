/**
 * @noema/knowledge-graph-service — Infrastructure Repository Barrel Export
 */

export { PrismaAggregationEvidenceRepository } from './prisma-aggregation-evidence.repository.js';
export {
  NoopGraphCrdtStatsRepository,
  PrismaGraphCrdtStatsRepository,
} from './prisma-graph-crdt-stats.repository.js';
export { PrismaGraphRestoreTokenRepository } from './prisma-graph-restore-token.repository.js';
export { PrismaGraphSnapshotRepository } from './prisma-graph-snapshot.repository.js';
export { PrismaMetricsStalenessRepository } from './prisma-metrics-staleness.repository.js';
export { PrismaMetricsRepository } from './prisma-metrics.repository.js';
export { PrismaMisconceptionRepository } from './prisma-misconception.repository.js';
export { PrismaMutationRepository } from './prisma-mutation.repository.js';
export {
  PrismaOntologyImportArtifactRepository,
  PrismaOntologyImportCheckpointRepository,
  PrismaOntologyParsedBatchRepository,
} from './prisma-ontology-import-metadata.repository.js';
export { PrismaOntologyImportRunRepository } from './prisma-ontology-import-run.repository.js';
export { PrismaOntologySourceRepository } from './prisma-ontology-source.repository.js';
export { PrismaOperationLogRepository } from './prisma-operation-log.repository.js';
export { PrismaPkgPostWriteRecoveryRepository } from './prisma-post-write-recovery.repository.js';
