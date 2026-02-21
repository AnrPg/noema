/**
 * @noema/content-service - Media Repository Interface
 *
 * Abstract repository interface for media file metadata access.
 * Actual file storage is handled by the storage layer (MinIO).
 */

import type { MediaId, UserId } from '@noema/types';
import type { ICreateMediaInput, IMediaFile } from '../../types/content.types.js';

// ============================================================================
// Storage Provider Interface
// ============================================================================

/**
 * Object storage provider interface.
 * Implementations can use MinIO, S3, local filesystem, etc.
 */
export interface IStorageProvider {
  /**
   * Generate a presigned URL for client-side upload.
   */
  getPresignedUploadUrl(
    objectKey: string,
    mimeType: string,
    expirySeconds: number
  ): Promise<string>;

  /**
   * Generate a presigned URL for client-side download.
   */
  getPresignedDownloadUrl(objectKey: string, expirySeconds: number): Promise<string>;

  /**
   * Delete an object from storage.
   */
  deleteObject(objectKey: string): Promise<void>;

  /**
   * Check if an object exists in storage.
   */
  objectExists(objectKey: string): Promise<boolean>;
}

// ============================================================================
// Media Repository Interface
// ============================================================================

/**
 * Media repository interface.
 * All media file metadata access goes through this interface.
 */
export interface IMediaRepository {
  /**
   * Find media file by ID.
   * @returns Media file or null if not found (excludes soft-deleted)
   */
  findById(id: MediaId): Promise<IMediaFile | null>;

  /**
   * Find media file by ID, scoped to a user.
   */
  findByIdForUser(id: MediaId, userId: UserId): Promise<IMediaFile | null>;

  /**
   * Find media files by user.
   */
  findByUser(
    userId: UserId,
    options?: { mimeType?: string; limit?: number; offset?: number }
  ): Promise<{ items: IMediaFile[]; total: number }>;

  /**
   * Create a media file record.
   */
  create(
    input: ICreateMediaInput & { id: MediaId; userId: UserId; filename: string; bucket: string; objectKey: string }
  ): Promise<IMediaFile>;

  /**
   * Confirm upload (set sizeBytes after client uploads).
   */
  confirmUpload(id: MediaId, sizeBytes: number): Promise<IMediaFile>;

  /**
   * Soft-delete a media file record.
   */
  softDelete(id: MediaId): Promise<void>;

  /**
   * Hard-delete a media file record (permanent, admin only).
   */
  hardDelete(id: MediaId): Promise<void>;
}
