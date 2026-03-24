import { nanoid } from 'nanoid';
import type { PrismaClient } from '../../../../generated/prisma/index.js';
import type {
  IImportArtifactRepository,
  IImportCheckpointRepository,
  IParsedBatchRepository,
  IOntologyImportArtifact,
  IOntologyImportCheckpoint,
  IParsedOntologyBatch,
} from '../../../domain/knowledge-graph-service/ontology-imports.contracts.js';

function createId(prefix: string): string {
  return `${prefix}_${nanoid()}`;
}

export class PrismaOntologyImportArtifactRepository implements IImportArtifactRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listByRunId(runId: string): Promise<IOntologyImportArtifact[]> {
    const records = await this.prisma.ontologyImportArtifact.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    });
    return records.map((record) => ({
      id: record.id,
      runId: record.runId,
      sourceId: record.sourceId,
      kind: record.kind as IOntologyImportArtifact['kind'],
      storageKey: record.storageKey,
      contentType: record.contentType,
      checksum: record.checksum,
      sizeBytes: record.sizeBytes,
      createdAt: record.createdAt.toISOString(),
    }));
  }

  async create(
    artifact: Omit<IOntologyImportArtifact, 'id' | 'createdAt'>
  ): Promise<IOntologyImportArtifact> {
    const record = await this.prisma.ontologyImportArtifact.create({
      data: {
        id: createId('artifact'),
        runId: artifact.runId,
        sourceId: artifact.sourceId,
        kind: artifact.kind,
        storageKey: artifact.storageKey,
        contentType: artifact.contentType,
        checksum: artifact.checksum,
        sizeBytes: artifact.sizeBytes,
      },
    });
    return {
      id: record.id,
      runId: record.runId,
      sourceId: record.sourceId,
      kind: record.kind as IOntologyImportArtifact['kind'],
      storageKey: record.storageKey,
      contentType: record.contentType,
      checksum: record.checksum,
      sizeBytes: record.sizeBytes,
      createdAt: record.createdAt.toISOString(),
    };
  }
}

export class PrismaOntologyImportCheckpointRepository implements IImportCheckpointRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listByRunId(runId: string): Promise<IOntologyImportCheckpoint[]> {
    const records = await this.prisma.ontologyImportCheckpoint.findMany({
      where: { runId },
      orderBy: { startedAt: 'asc' },
    });
    return records.map((record) => ({
      id: record.id,
      runId: record.runId,
      step: record.step as IOntologyImportCheckpoint['step'],
      status: record.status as IOntologyImportCheckpoint['status'],
      startedAt: record.startedAt?.toISOString() ?? null,
      completedAt: record.completedAt?.toISOString() ?? null,
      detail: record.detail,
    }));
  }

  async create(
    checkpoint: Omit<IOntologyImportCheckpoint, 'id'>
  ): Promise<IOntologyImportCheckpoint> {
    const record = await this.prisma.ontologyImportCheckpoint.create({
      data: {
        id: createId('checkpoint'),
        runId: checkpoint.runId,
        step: checkpoint.step,
        status: checkpoint.status,
        startedAt: checkpoint.startedAt !== null ? new Date(checkpoint.startedAt) : null,
        completedAt: checkpoint.completedAt !== null ? new Date(checkpoint.completedAt) : null,
        detail: checkpoint.detail,
      },
    });
    return {
      id: record.id,
      runId: record.runId,
      step: record.step as IOntologyImportCheckpoint['step'],
      status: record.status as IOntologyImportCheckpoint['status'],
      startedAt: record.startedAt?.toISOString() ?? null,
      completedAt: record.completedAt?.toISOString() ?? null,
      detail: record.detail,
    };
  }
}

export class PrismaOntologyParsedBatchRepository implements IParsedBatchRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getByRunId(runId: string): Promise<IParsedOntologyBatch | null> {
    const record = await this.prisma.ontologyParsedBatch.findUnique({
      where: { runId },
    });
    if (record === null) {
      return null;
    }
    return {
      runId: record.runId,
      sourceId: record.sourceId,
      sourceVersion: record.sourceVersion,
      recordCount: record.recordCount,
      artifactId: record.artifactId,
    };
  }

  async save(batch: IParsedOntologyBatch): Promise<IParsedOntologyBatch> {
    const record = await this.prisma.ontologyParsedBatch.upsert({
      where: { runId: batch.runId },
      update: {
        sourceId: batch.sourceId,
        sourceVersion: batch.sourceVersion,
        recordCount: batch.recordCount,
        artifactId: batch.artifactId,
      },
      create: {
        runId: batch.runId,
        sourceId: batch.sourceId,
        sourceVersion: batch.sourceVersion,
        recordCount: batch.recordCount,
        artifactId: batch.artifactId,
      },
    });
    return {
      runId: record.runId,
      sourceId: record.sourceId,
      sourceVersion: record.sourceVersion,
      recordCount: record.recordCount,
      artifactId: record.artifactId,
    };
  }
}
