import { nanoid } from 'nanoid';
import type { Prisma, PrismaClient } from '../../../../generated/prisma/index.js';
import type {
  ICancelOntologyImportRunInput,
  ICreateOntologyImportRunInput,
  IImportRunRepository,
  IOntologyImportRun,
  IRetryOntologyImportRunInput,
  OntologyImportStatus,
} from '../../../domain/knowledge-graph-service/ontology-imports.contracts.js';

interface IOntologyImportRunRecord {
  id: string;
  sourceId: string;
  sourceVersion: string | null;
  configuration: Prisma.JsonValue;
  submittedMutationIds: Prisma.JsonValue;
  status: string;
  trigger: string;
  initiatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  failureReason: string | null;
}

function toDomain(record: IOntologyImportRunRecord): IOntologyImportRun {
  return {
    id: record.id,
    sourceId: record.sourceId,
    sourceVersion: record.sourceVersion,
    configuration: parseRunConfiguration(record.configuration),
    submittedMutationIds: parseSubmittedMutationIds(record.submittedMutationIds),
    status: record.status as OntologyImportStatus,
    trigger: record.trigger as IOntologyImportRun['trigger'],
    initiatedBy: record.initiatedBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    startedAt: record.startedAt?.toISOString() ?? null,
    completedAt: record.completedAt?.toISOString() ?? null,
    failureReason: record.failureReason,
  };
}

function createRunId(): string {
  return `run_${nanoid()}`;
}

export class PrismaOntologyImportRunRepository implements IImportRunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get delegate(): {
    findMany(args: unknown): Promise<IOntologyImportRunRecord[]>;
    findUnique(args: unknown): Promise<IOntologyImportRunRecord | null>;
    create(args: unknown): Promise<IOntologyImportRunRecord>;
    update(args: unknown): Promise<IOntologyImportRunRecord>;
  } {
    return this.prisma.ontologyImportRun as unknown as {
      findMany(args: unknown): Promise<IOntologyImportRunRecord[]>;
      findUnique(args: unknown): Promise<IOntologyImportRunRecord | null>;
      create(args: unknown): Promise<IOntologyImportRunRecord>;
      update(args: unknown): Promise<IOntologyImportRunRecord>;
    };
  }

  async list(filters?: {
    sourceId?: string;
    status?: OntologyImportStatus;
  }): Promise<IOntologyImportRun[]> {
    const records = await this.delegate.findMany({
      where: {
        ...(filters?.sourceId !== undefined ? { sourceId: filters.sourceId } : {}),
        ...(filters?.status !== undefined ? { status: filters.status } : {}),
      } satisfies Prisma.OntologyImportRunWhereInput,
      orderBy: { createdAt: 'desc' },
    });
    return records.map(toDomain);
  }

  async getById(runId: string): Promise<IOntologyImportRun | null> {
    const record = await this.delegate.findUnique({
      where: { id: runId },
    });
    return record ? toDomain(record) : null;
  }

  async create(input: ICreateOntologyImportRunInput): Promise<IOntologyImportRun> {
    const record = await this.delegate.create({
      data: {
        id: createRunId(),
        sourceId: input.sourceId,
        sourceVersion: input.sourceVersion ?? null,
        configuration: {
          mode: input.configuration?.mode ?? null,
          language: input.configuration?.language ?? null,
          seedNodes: input.configuration?.seedNodes ?? [],
        },
        submittedMutationIds: [],
        status: 'queued',
        trigger: input.trigger,
        initiatedBy: input.initiatedBy ?? null,
      },
    });
    return toDomain(record);
  }

  async updateStatus(
    runId: string,
    status: OntologyImportStatus,
    options?: {
      failureReason?: string;
      startedAt?: string | null;
      completedAt?: string | null;
    }
  ): Promise<IOntologyImportRun> {
    const record = await this.delegate.update({
      where: { id: runId },
      data: {
        status,
        failureReason: options?.failureReason ?? null,
        ...(options?.startedAt !== undefined
          ? { startedAt: options.startedAt !== null ? new Date(options.startedAt) : null }
          : {}),
        ...(options?.completedAt !== undefined
          ? { completedAt: options.completedAt !== null ? new Date(options.completedAt) : null }
          : {}),
      },
    });
    return toDomain(record);
  }

  async cancel(input: ICancelOntologyImportRunInput): Promise<IOntologyImportRun> {
    const record = await this.delegate.update({
      where: { id: input.runId },
      data: {
        status: 'cancelled',
        failureReason: input.reason ?? null,
        completedAt: new Date(),
      },
    });
    return toDomain(record);
  }

  async recordSubmittedMutations(
    runId: string,
    mutationIds: string[]
  ): Promise<IOntologyImportRun> {
    const record = await this.delegate.update({
      where: { id: runId },
      data: {
        submittedMutationIds: mutationIds,
      },
    });
    return toDomain(record);
  }

  async retry(input: IRetryOntologyImportRunInput): Promise<IOntologyImportRun> {
    const record = await this.delegate.update({
      where: { id: input.runId },
      data: {
        status: 'queued',
        failureReason: input.reason ?? null,
        startedAt: null,
        completedAt: null,
      },
    });
    return toDomain(record);
  }
}

function parseSubmittedMutationIds(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry !== '')
    : [];
}

function parseRunConfiguration(value: Prisma.JsonValue): IOntologyImportRun['configuration'] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {
      mode: null,
      language: null,
      seedNodes: [],
    };
  }

  const mode = typeof value['mode'] === 'string' && value['mode'] !== '' ? value['mode'] : null;
  const language =
    typeof value['language'] === 'string' && value['language'] !== '' ? value['language'] : null;
  const seedNodes = Array.isArray(value['seedNodes'])
    ? value['seedNodes'].filter(
        (entry): entry is string => typeof entry === 'string' && entry !== ''
      )
    : [];

  return {
    mode,
    language,
    seedNodes,
  };
}
