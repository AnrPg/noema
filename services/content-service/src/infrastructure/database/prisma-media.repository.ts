/**
 * @noema/content-service - Prisma Media Repository
 *
 * Prisma implementation of IMediaRepository.
 * Stores media file metadata in PostgreSQL.
 */

import type { MediaId, UserId } from '@noema/types';
import { type PrismaClient, Prisma } from '@prisma/client';
import type { IMediaRepository } from '../../domain/content-service/media.repository.js';
import type { ICreateMediaInput, IMediaFile } from '../../types/content.types.js';

// ============================================================================
// Prisma Media Repository
// ============================================================================

export class PrismaMediaRepository implements IMediaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: MediaId): Promise<IMediaFile | null> {
    const record = await this.prisma.mediaFile.findFirst({
      where: { id, deletedAt: null },
    });
    return record ? this.toDomain(record) : null;
  }

  async findByIdForUser(id: MediaId, userId: UserId): Promise<IMediaFile | null> {
    const record = await this.prisma.mediaFile.findFirst({
      where: { id, userId, deletedAt: null },
    });
    return record ? this.toDomain(record) : null;
  }

  async findByUser(
    userId: UserId,
    options?: { mimeType?: string; limit?: number; offset?: number }
  ): Promise<{ items: IMediaFile[]; total: number }> {
    const where: Prisma.MediaFileWhereInput = { userId, deletedAt: null };
    if (options?.mimeType) {
      where['mimeType'] = options.mimeType;
    }

    const [records, total] = await this.prisma.$transaction([
      this.prisma.mediaFile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit ?? 20,
        skip: options?.offset ?? 0,
      }),
      this.prisma.mediaFile.count({ where }),
    ]);

    return {
      items: records.map((r) => this.toDomain(r)),
      total,
    };
  }

  async create(
    input: ICreateMediaInput & {
      id: MediaId;
      userId: UserId;
      filename: string;
      bucket: string;
      objectKey: string;
    }
  ): Promise<IMediaFile> {
    const record = await this.prisma.mediaFile.create({
      data: {
        id: input.id,
        userId: input.userId,
        filename: input.filename,
        originalFilename: input.originalFilename,
        mimeType: input.mimeType,
        sizeBytes: BigInt(input.sizeBytes),
        bucket: input.bucket,
        objectKey: input.objectKey,
        alt: input.alt ?? null,
        metadata: (input.metadata ?? {}) as unknown as Prisma.JsonObject,
        createdBy: input.userId,
        updatedBy: input.userId,
      },
    });
    return this.toDomain(record);
  }

  async confirmUpload(id: MediaId, sizeBytes: number): Promise<IMediaFile> {
    const record = await this.prisma.mediaFile.update({
      where: { id },
      data: { sizeBytes: BigInt(sizeBytes) },
    });
    return this.toDomain(record);
  }

  async softDelete(id: MediaId): Promise<void> {
    await this.prisma.mediaFile.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async hardDelete(id: MediaId): Promise<void> {
    await this.prisma.mediaFile.delete({
      where: { id },
    });
  }

  // ============================================================================
  // Mapping
  // ============================================================================

  private toDomain(record: {
    id: string;
    userId: string;
    filename: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: bigint;
    bucket: string;
    objectKey: string;
    alt: string | null;
    metadata: unknown;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  }): IMediaFile {
    return {
      id: record.id as MediaId,
      userId: record.userId as UserId,
      filename: record.filename,
      originalFilename: record.originalFilename,
      mimeType: record.mimeType,
      sizeBytes: Number(record.sizeBytes),
      bucket: record.bucket,
      objectKey: record.objectKey,
      alt: record.alt,
      metadata: (record.metadata ?? {}) as IMediaFile['metadata'],
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      deletedAt: record.deletedAt?.toISOString() ?? null,
    };
  }
}
