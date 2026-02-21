/**
 * @noema/content-service - Media Service
 *
 * Domain service implementing media file management logic.
 * Actual file storage is delegated to IStorageProvider (MinIO).
 * Database metadata is handled by IMediaRepository (Prisma).
 */

import type { IAgentHints } from '@noema/contracts';
import type { JsonValue, MediaId, UserId } from '@noema/types';
import { ID_PREFIXES } from '@noema/types';
import { nanoid } from 'nanoid';
import type { Logger } from 'pino';
import type {
  ICreateMediaInput,
  IMediaFile,
  IPresignedDownloadUrl,
  IPresignedUploadUrl,
} from '../../types/content.types.js';
import type { IEventPublisher } from '../shared/event-publisher.js';
import type { IExecutionContext, IServiceResult } from './content.service.js';
import { AuthorizationError, BusinessRuleError, ValidationError } from './errors/index.js';
import type { IMediaRepository, IStorageProvider } from './media.repository.js';
import { ConfirmUploadSchema, MediaQuerySchema, RequestUploadUrlSchema } from './media.schemas.js';

// ============================================================================
// Media Not Found Error
// ============================================================================

export class MediaNotFoundError extends BusinessRuleError {
  public readonly mediaId: string;
  constructor(mediaId: string) {
    super(`Media file not found: ${mediaId}`, { mediaId });
    this.mediaId = mediaId;
  }
}

// ============================================================================
// Constants
// ============================================================================

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'video/mp4',
  'video/webm',
  'application/pdf',
]);

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

// ============================================================================
// Media Service
// ============================================================================

export class MediaService {
  private readonly logger: Logger;

  constructor(
    private readonly mediaRepository: IMediaRepository,
    private readonly storageProvider: IStorageProvider,
    private readonly eventPublisher: IEventPublisher,
    private readonly bucket: string,
    private readonly presignedUrlExpiry: number,
    logger: Logger
  ) {
    this.logger = logger.child({ service: 'MediaService' });
  }

  // ============================================================================
  // Upload Flow
  // ============================================================================

  /**
   * Request a presigned URL for client-side upload.
   * Creates a media record in "pending" state.
   */
  async requestUploadUrl(
    input: unknown,
    context: IExecutionContext
  ): Promise<IServiceResult<IPresignedUploadUrl>> {
    this.requireAuth(context);
    this.logger.info('Requesting presigned upload URL');

    // Validate input
    const parseResult = RequestUploadUrlSchema.safeParse(input);
    if (!parseResult.success) {
      const errors = parseResult.error.flatten();
      throw new ValidationError(
        'Invalid upload request',
        errors.fieldErrors as Record<string, string[]>
      );
    }

    const validated = parseResult.data;

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.has(validated.mimeType)) {
      throw new BusinessRuleError(`Unsupported file type: ${validated.mimeType}`, {
        allowedTypes: [...ALLOWED_MIME_TYPES],
      });
    }

    // Validate size
    if (validated.sizeBytes > MAX_FILE_SIZE) {
      throw new BusinessRuleError(
        `File size ${String(validated.sizeBytes)} exceeds maximum ${String(MAX_FILE_SIZE)} bytes`
      );
    }

    // Generate IDs and storage key
    const mediaId = `${ID_PREFIXES.MediaId}${nanoid(21)}` as MediaId;
    const ext = this.extractExtension(validated.originalFilename);
    const objectKey = `${context.userId as string}/${mediaId}${ext}`;
    const filename = `${mediaId}${ext}`;

    // Create media record
    const createInput: ICreateMediaInput & { id: MediaId; userId: UserId; filename: string; bucket: string; objectKey: string } = {
      id: mediaId,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      userId: context.userId!,
      originalFilename: validated.originalFilename,
      mimeType: validated.mimeType,
      sizeBytes: validated.sizeBytes,
      metadata: (validated.metadata ?? {}) as Record<string, JsonValue>,
      filename,
      bucket: this.bucket,
      objectKey,
    };
    if (validated.alt !== undefined && validated.alt !== '') {
      createInput.alt = validated.alt;
    }
    await this.mediaRepository.create(createInput);

    // Generate presigned URL
    const uploadUrl = await this.storageProvider.getPresignedUploadUrl(
      objectKey,
      validated.mimeType,
      this.presignedUrlExpiry
    );

    const expiresAt = new Date(Date.now() + this.presignedUrlExpiry * 1000).toISOString();

    this.logger.info({ mediaId, objectKey }, 'Presigned upload URL generated');

    return {
      data: { uploadUrl, mediaId, objectKey, bucket: this.bucket, expiresAt },
      agentHints: this.createAgentHints('upload_url_generated', mediaId),
    };
  }

  /**
   * Confirm that a client upload has completed.
   */
  async confirmUpload(
    mediaId: MediaId,
    input: unknown,
    context: IExecutionContext
  ): Promise<IServiceResult<IMediaFile>> {
    this.requireAuth(context);
    this.logger.info({ mediaId }, 'Confirming upload');

    // Validate input
    const parseResult = ConfirmUploadSchema.safeParse(input);
    if (!parseResult.success) {
      const errors = parseResult.error.flatten();
      throw new ValidationError(
        'Invalid confirm input',
        errors.fieldErrors as Record<string, string[]>
      );
    }

    // Verify ownership
    const existing = await this.mediaRepository.findByIdForUser(
      mediaId,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      context.userId!
    );
    if (!existing) {
      throw new MediaNotFoundError(mediaId);
    }

    // Verify the object exists in storage
    const exists = await this.storageProvider.objectExists(existing.objectKey);
    if (!exists) {
      throw new BusinessRuleError('Upload has not completed — object not found in storage', {
        mediaId,
        objectKey: existing.objectKey,
      });
    }

    // Update record with confirmed size
    const media = await this.mediaRepository.confirmUpload(mediaId, parseResult.data.sizeBytes);

    // Publish event
    await this.eventPublisher.publish({
      eventType: 'media.uploaded',
      aggregateType: 'MediaFile',
      aggregateId: mediaId,
      payload: {
        entity: media,
      },
      metadata: {
        correlationId: context.correlationId,
        userId: context.userId,
      },
    });

    this.logger.info({ mediaId }, 'Upload confirmed');

    return {
      data: media,
      agentHints: this.createAgentHints('upload_confirmed', mediaId),
    };
  }

  // ============================================================================
  // Read Operations
  // ============================================================================

  /**
   * Get media file metadata by ID.
   */
  async findById(id: MediaId, context: IExecutionContext): Promise<IServiceResult<IMediaFile>> {
    this.requireAuth(context);

    const media = await this.mediaRepository.findByIdForUser(
      id,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      context.userId!
    );
    if (!media) {
      throw new MediaNotFoundError(id);
    }

    return {
      data: media,
      agentHints: this.createAgentHints('found', id),
    };
  }

  /**
   * Get a presigned download URL for a media file.
   */
  async getDownloadUrl(
    id: MediaId,
    context: IExecutionContext
  ): Promise<IServiceResult<IPresignedDownloadUrl>> {
    this.requireAuth(context);

    const media = await this.mediaRepository.findByIdForUser(
      id,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      context.userId!
    );
    if (!media) {
      throw new MediaNotFoundError(id);
    }

    const downloadUrl = await this.storageProvider.getPresignedDownloadUrl(
      media.objectKey,
      this.presignedUrlExpiry
    );

    const expiresAt = new Date(Date.now() + this.presignedUrlExpiry * 1000).toISOString();

    return {
      data: { downloadUrl, expiresAt },
      agentHints: this.createAgentHints('download_url_generated', id),
    };
  }

  /**
   * List media files for current user.
   */
  async listUserMedia(
    queryInput: unknown,
    context: IExecutionContext
  ): Promise<IServiceResult<{ items: IMediaFile[]; total: number }>> {
    this.requireAuth(context);

    // Validate query
    const parseResult = MediaQuerySchema.safeParse(queryInput);
    if (!parseResult.success) {
      const errors = parseResult.error.flatten();
      throw new ValidationError('Invalid query', errors.fieldErrors as Record<string, string[]>);
    }

    const validated = parseResult.data;
    const findOptions: { mimeType?: string; limit?: number; offset?: number } = {
      limit: validated.limit,
      offset: validated.offset,
    };
    if (validated.mimeType !== undefined && validated.mimeType !== '') findOptions.mimeType = validated.mimeType;
    const result = await this.mediaRepository.findByUser(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      context.userId!,
      findOptions
    );

    return {
      data: result,
      agentHints: {
        suggestedNextActions: [
          {
            action: 'attach_to_card',
            description: 'Attach media to a card',
            priority: 'high',
            category: 'exploration',
          },
        ],
        relatedResources: [],
        confidence: 0.9,
        sourceQuality: 'high',
        validityPeriod: 'short',
        contextNeeded: [],
        assumptions: [],
        riskFactors: [],
        dependencies: [],
        estimatedImpact: { benefit: 0.5, effort: 0.2, roi: 2.5 },
        preferenceAlignment: [],
        reasoning: `Found ${String(result.total)} media files`,
      },
    };
  }

  // ============================================================================
  // Delete Operations
  // ============================================================================

  /**
   * Delete a media file (soft-delete metadata, remove from storage).
   */
  async delete(
    id: MediaId,
    context: IExecutionContext
  ): Promise<IServiceResult<{ deleted: true }>> {
    this.requireAuth(context);
    this.logger.info({ mediaId: id }, 'Deleting media file');

    // Verify ownership
    const media = await this.mediaRepository.findByIdForUser(
      id,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      context.userId!
    );
    if (!media) {
      throw new MediaNotFoundError(id);
    }

    // Delete from storage
    try {
      await this.storageProvider.deleteObject(media.objectKey);
    } catch (error) {
      this.logger.warn(
        { mediaId: id, error },
        'Failed to delete object from storage — proceeding with metadata delete'
      );
    }

    // Soft-delete metadata
    await this.mediaRepository.softDelete(id);

    // Publish event
    await this.eventPublisher.publish({
      eventType: 'media.deleted',
      aggregateType: 'MediaFile',
      aggregateId: id,
      payload: {
        mediaId: id,
        objectKey: media.objectKey,
        bucket: media.bucket,
      },
      metadata: {
        correlationId: context.correlationId,
        userId: context.userId,
      },
    });

    this.logger.info({ mediaId: id }, 'Media file deleted');

    return {
      data: { deleted: true },
      agentHints: this.createAgentHints('deleted', id),
    };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private requireAuth(context: IExecutionContext): void {
    if (!context.userId) {
      throw new AuthorizationError('Authentication required');
    }
  }

  private extractExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) return '';
    return filename.slice(lastDot);
  }

  private createAgentHints(action: string, mediaId: string): IAgentHints {
    return {
      suggestedNextActions: [
        {
          action: action === 'upload_url_generated' ? 'upload_file' : 'attach_to_card',
          description:
            action === 'upload_url_generated'
              ? 'Upload the file using the presigned URL, then confirm'
              : 'Attach this media to a card content block',
          priority: 'high',
          category: 'exploration',
        },
      ],
      relatedResources: [
        {
          type: 'mediaFile',
          id: mediaId,
          label: `Media ${mediaId}`,
          relevance: 1.0,
        },
      ],
      confidence: 0.95,
      sourceQuality: 'high',
      validityPeriod: action.includes('url') ? 'short' : 'medium',
      contextNeeded: [],
      assumptions: [],
      riskFactors: [],
      dependencies: [],
      estimatedImpact: { benefit: 0.6, effort: 0.3, roi: 2.0 },
      preferenceAlignment: [],
      reasoning: `Media ${action}: ${mediaId}`,
    };
  }
}
