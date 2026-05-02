import type {
  IConceptCandidateDto,
  IDocumentChunkDto,
  IDocumentDetailDto,
  IDocumentDto,
  IDocumentIrDto,
  IDocumentUploadInputDto,
  IIngestionJobDto,
} from '@noema/contracts';
import type {
  ConceptCandidateId,
  ConceptCandidateState,
  DocumentId,
  IngestionJobId,
  IngestionJobStage,
  NodeId,
  UserId,
} from '@noema/types';
/* eslint-disable @typescript-eslint/unbound-method */
import type { IIngestionRepository } from '../../domain/ingestion-service/ingestion.repository.js';

interface IPrismaModel {
  create(args: unknown): Promise<unknown>;
  findMany(args: unknown): Promise<unknown[]>;
  findFirst(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
  upsert?(args: unknown): Promise<unknown>;
  delete(args: unknown): Promise<unknown>;
  deleteMany?(args: unknown): Promise<unknown>;
  createMany?(args: unknown): Promise<unknown>;
}

interface IPrismaLike {
  ingestionDocument: IPrismaModel;
  ingestionDocumentIr: IPrismaModel;
  ingestionDocumentChunk: IPrismaModel;
  ingestionConceptCandidate: IPrismaModel;
  ingestionJob: IPrismaModel;
}

export class PrismaIngestionRepository implements IIngestionRepository {
  constructor(private readonly prisma: IPrismaLike) {}

  async createDocument(
    input: IDocumentUploadInputDto & {
      id: DocumentId;
      userId: UserId;
      checksum: string;
      byteLength: number;
    }
  ): Promise<IDocumentDto> {
    const row = await this.prisma.ingestionDocument.create({
      data: {
        id: input.id,
        userId: input.userId,
        title: input.title,
        sourceKind: input.sourceKind ?? 'upload',
        mimeKind: input.mimeKind ?? 'text/plain',
        sourceUri: input.sourceUri,
        checksum: input.checksum,
        byteLength: input.byteLength,
        rawContent: input.content,
        metadata: input.metadata ?? {},
      },
    });
    return mapDocument(row);
  }

  async listDocuments(userId: UserId): Promise<IDocumentDto[]> {
    const rows = await this.prisma.ingestionDocument.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapDocument);
  }

  async getDocument(userId: UserId, documentId: DocumentId): Promise<IDocumentDto | undefined> {
    const row = await this.prisma.ingestionDocument.findFirst({
      where: { id: documentId, userId },
    });
    return row === null ? undefined : mapDocument(row);
  }

  async getDocumentContent(userId: UserId, documentId: DocumentId): Promise<string | undefined> {
    const row = await this.prisma.ingestionDocument.findFirst({
      where: { id: documentId, userId },
    });
    if (row === null) return undefined;
    const value = row as Record<string, unknown>;
    return typeof value['rawContent'] === 'string' ? value['rawContent'] : undefined;
  }

  async getDocumentDetail(
    userId: UserId,
    documentId: DocumentId
  ): Promise<IDocumentDetailDto | undefined> {
    const document = await this.getDocument(userId, documentId);
    if (document === undefined) return undefined;
    const [ir, chunks, concepts, jobs] = await Promise.all([
      this.getIr(documentId),
      this.listChunks(documentId),
      this.listConceptCandidates(documentId),
      this.listJobs(userId, documentId),
    ]);
    return { document, ir, chunks, concepts, jobs };
  }

  async deleteDocument(userId: UserId, documentId: DocumentId): Promise<void> {
    await this.prisma.ingestionDocument.delete({ where: { id: documentId, userId } });
  }

  async createJob(input: {
    id: IngestionJobId;
    documentId: DocumentId;
    userId: UserId;
    intent: IIngestionJobDto['intent'];
  }): Promise<IIngestionJobDto> {
    const row = await this.prisma.ingestionJob.create({
      data: {
        id: input.id,
        documentId: input.documentId,
        userId: input.userId,
        intent: input.intent,
        stage: 'queued',
        checkpoints: {},
        contentGenerationJobIds: [],
      },
    });
    return mapJob(row);
  }

  async getJob(userId: UserId, jobId: IngestionJobId): Promise<IIngestionJobDto | undefined> {
    const row = await this.prisma.ingestionJob.findFirst({ where: { id: jobId, userId } });
    return row === null ? undefined : mapJob(row);
  }

  async listJobs(
    userId: UserId,
    documentId?: DocumentId,
    stage?: IngestionJobStage
  ): Promise<IIngestionJobDto[]> {
    const where: Record<string, unknown> = { userId };
    if (documentId !== undefined) where['documentId'] = documentId;
    if (stage !== undefined) where['stage'] = stage;
    const rows = await this.prisma.ingestionJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapJob);
  }

  async updateJob(
    jobId: IngestionJobId,
    patch: Parameters<IIngestionRepository['updateJob']>[1]
  ): Promise<IIngestionJobDto> {
    const current = await this.prisma.ingestionJob.findFirst({ where: { id: jobId } });
    const currentJob = current === null ? undefined : mapJob(current);
    const data: Record<string, unknown> = {};
    if (patch.stage !== undefined) data['stage'] = patch.stage;
    if (patch.checkpoints !== undefined) {
      data['checkpoints'] = { ...(currentJob?.checkpoints ?? {}), ...patch.checkpoints };
    }
    if (patch.errorMessage !== undefined) data['errorMessage'] = patch.errorMessage;
    if (patch.finishedAt !== undefined) data['finishedAt'] = new Date(patch.finishedAt);
    if (patch.curriculumId !== undefined) data['curriculumId'] = patch.curriculumId;
    if (patch.contentGenerationJobIds !== undefined) {
      data['contentGenerationJobIds'] = patch.contentGenerationJobIds;
    }
    const row = await this.prisma.ingestionJob.update({ where: { id: jobId }, data });
    return mapJob(row);
  }

  async upsertIr(ir: IDocumentIrDto): Promise<IDocumentIrDto> {
    const upsert = this.prisma.ingestionDocumentIr.upsert;
    if (upsert === undefined)
      throw new Error('Prisma upsert unavailable for ingestion document IR.');
    const row = await upsert.call(this.prisma.ingestionDocumentIr, {
      where: { documentId: ir.documentId },
      create: {
        documentId: ir.documentId,
        language: ir.language,
        title: ir.title,
        outline: ir.outline,
        blocks: ir.blocks,
        metadata: ir.metadata,
      },
      update: {
        language: ir.language,
        title: ir.title,
        outline: ir.outline,
        blocks: ir.blocks,
        metadata: ir.metadata,
      },
    });
    return mapIr(row);
  }

  async getIr(documentId: DocumentId): Promise<IDocumentIrDto | undefined> {
    const row = await this.prisma.ingestionDocumentIr.findFirst({ where: { documentId } });
    return row === null ? undefined : mapIr(row);
  }

  async replaceChunks(
    documentId: DocumentId,
    chunks: IDocumentChunkDto[]
  ): Promise<IDocumentChunkDto[]> {
    this.requireBulk(this.prisma.ingestionDocumentChunk);
    await this.prisma.ingestionDocumentChunk.deleteMany?.({ where: { documentId } });
    await this.prisma.ingestionDocumentChunk.createMany?.({
      data: chunks.map((chunk) => ({
        id: chunk.id,
        documentId,
        userId: chunk.userId,
        ordinal: chunk.ordinal,
        text: chunk.text,
        tokenEstimate: chunk.tokenEstimate,
        headingPath: chunk.headingPath,
        pageRef: chunk.pageRef,
        vectorId: chunk.vectorId,
        metadata: chunk.metadata,
      })),
    });
    return this.listChunks(documentId);
  }

  async listChunks(documentId: DocumentId): Promise<IDocumentChunkDto[]> {
    const rows = await this.prisma.ingestionDocumentChunk.findMany({
      where: { documentId },
      orderBy: { ordinal: 'asc' },
    });
    return rows.map(mapChunk);
  }

  async replaceConceptCandidates(
    documentId: DocumentId,
    candidates: IConceptCandidateDto[]
  ): Promise<IConceptCandidateDto[]> {
    this.requireBulk(this.prisma.ingestionConceptCandidate);
    await this.prisma.ingestionConceptCandidate.deleteMany?.({ where: { documentId } });
    await this.prisma.ingestionConceptCandidate.createMany?.({
      data: candidates.map((candidate) => ({
        id: candidate.id,
        documentId,
        userId: candidate.userId,
        label: candidate.label,
        definition: candidate.definition,
        salience: candidate.salience,
        evidenceChunkIds: candidate.evidenceChunkIds,
        state: candidate.state,
        ckgNodeId: candidate.ckgNodeId,
        proposedNodeId: candidate.proposedNodeId,
        metadata: candidate.metadata,
      })),
    });
    return this.listConceptCandidates(documentId);
  }

  async listConceptCandidates(documentId: DocumentId): Promise<IConceptCandidateDto[]> {
    const rows = await this.prisma.ingestionConceptCandidate.findMany({
      where: { documentId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(mapCandidate);
  }

  async updateConceptCandidate(input: {
    id: ConceptCandidateId;
    state: ConceptCandidateState;
    ckgNodeId?: NodeId | undefined;
    proposedNodeId?: NodeId | undefined;
  }): Promise<IConceptCandidateDto> {
    const row = await this.prisma.ingestionConceptCandidate.update({
      where: { id: input.id },
      data: {
        state: input.state,
        ckgNodeId: input.ckgNodeId,
        proposedNodeId: input.proposedNodeId,
      },
    });
    return mapCandidate(row);
  }

  private requireBulk(model: IPrismaModel): void {
    if (model.deleteMany === undefined || model.createMany === undefined) {
      throw new Error('Prisma bulk methods are unavailable.');
    }
  }
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function optionalIso(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : toIso(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function mapDocument(row: unknown): IDocumentDto {
  const value = row as Record<string, unknown>;
  return {
    id: value['id'] as IDocumentDto['id'],
    userId: value['userId'] as IDocumentDto['userId'],
    title: value['title'] as string,
    sourceKind: value['sourceKind'] as IDocumentDto['sourceKind'],
    mimeKind: value['mimeKind'] as IDocumentDto['mimeKind'],
    ...(optionalString(value['sourceUri']) !== undefined
      ? { sourceUri: optionalString(value['sourceUri']) }
      : {}),
    checksum: value['checksum'] as string,
    byteLength: value['byteLength'] as number,
    metadata: (value['metadata'] as Record<string, unknown> | undefined) ?? {},
    createdAt: toIso(value['createdAt']),
    updatedAt: toIso(value['updatedAt']),
  };
}

function mapIr(row: unknown): IDocumentIrDto {
  const value = row as Record<string, unknown>;
  return {
    documentId: value['documentId'] as IDocumentIrDto['documentId'],
    language: value['language'] as string,
    title: value['title'] as string,
    outline: (value['outline'] as IDocumentIrDto['outline'] | undefined) ?? [],
    blocks: (value['blocks'] as IDocumentIrDto['blocks'] | undefined) ?? [],
    metadata: (value['metadata'] as Record<string, unknown> | undefined) ?? {},
    createdAt: toIso(value['createdAt']),
  };
}

function mapChunk(row: unknown): IDocumentChunkDto {
  const value = row as Record<string, unknown>;
  return {
    id: value['id'] as IDocumentChunkDto['id'],
    documentId: value['documentId'] as IDocumentChunkDto['documentId'],
    userId: value['userId'] as IDocumentChunkDto['userId'],
    ordinal: value['ordinal'] as number,
    text: value['text'] as string,
    tokenEstimate: value['tokenEstimate'] as number,
    headingPath: (value['headingPath'] as string[] | undefined) ?? [],
    ...(optionalString(value['pageRef']) !== undefined
      ? { pageRef: optionalString(value['pageRef']) }
      : {}),
    ...(optionalString(value['vectorId']) !== undefined
      ? { vectorId: optionalString(value['vectorId']) }
      : {}),
    metadata: (value['metadata'] as Record<string, unknown> | undefined) ?? {},
    createdAt: toIso(value['createdAt']),
  };
}

function mapCandidate(row: unknown): IConceptCandidateDto {
  const value = row as Record<string, unknown>;
  return {
    id: value['id'] as IConceptCandidateDto['id'],
    documentId: value['documentId'] as IConceptCandidateDto['documentId'],
    userId: value['userId'] as IConceptCandidateDto['userId'],
    label: value['label'] as string,
    ...(optionalString(value['definition']) !== undefined
      ? { definition: optionalString(value['definition']) }
      : {}),
    salience: value['salience'] as number,
    evidenceChunkIds:
      (value['evidenceChunkIds'] as IConceptCandidateDto['evidenceChunkIds'] | undefined) ?? [],
    state: value['state'] as IConceptCandidateDto['state'],
    ...(optionalString(value['ckgNodeId']) !== undefined
      ? { ckgNodeId: optionalString(value['ckgNodeId']) as IConceptCandidateDto['ckgNodeId'] }
      : {}),
    ...(optionalString(value['proposedNodeId']) !== undefined
      ? {
          proposedNodeId: optionalString(
            value['proposedNodeId']
          ) as IConceptCandidateDto['proposedNodeId'],
        }
      : {}),
    metadata: (value['metadata'] as Record<string, unknown> | undefined) ?? {},
    createdAt: toIso(value['createdAt']),
    updatedAt: toIso(value['updatedAt']),
  };
}

function mapJob(row: unknown): IIngestionJobDto {
  const value = row as Record<string, unknown>;
  return {
    id: value['id'] as IIngestionJobDto['id'],
    documentId: value['documentId'] as IIngestionJobDto['documentId'],
    userId: value['userId'] as IIngestionJobDto['userId'],
    intent: value['intent'] as IIngestionJobDto['intent'],
    stage: value['stage'] as IIngestionJobDto['stage'],
    checkpoints: (value['checkpoints'] as Record<string, unknown> | undefined) ?? {},
    ...(optionalString(value['errorMessage']) !== undefined
      ? { errorMessage: optionalString(value['errorMessage']) }
      : {}),
    ...(optionalString(value['curriculumId']) !== undefined
      ? { curriculumId: optionalString(value['curriculumId']) as IIngestionJobDto['curriculumId'] }
      : {}),
    contentGenerationJobIds: (value['contentGenerationJobIds'] as string[] | undefined) ?? [],
    createdAt: toIso(value['createdAt']),
    updatedAt: toIso(value['updatedAt']),
    ...(optionalIso(value['finishedAt']) !== undefined
      ? { finishedAt: optionalIso(value['finishedAt']) }
      : {}),
  };
}
