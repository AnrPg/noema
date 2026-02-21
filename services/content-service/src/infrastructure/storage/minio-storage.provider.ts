/**
 * @noema/content-service - MinIO Storage Provider
 *
 * S3-compatible object storage implementation using MinIO client.
 * Generates presigned URLs for client-side upload/download.
 */

import { Client } from 'minio';
import type { Logger } from 'pino';
import type { IStorageProvider } from '../../domain/content-service/media.repository.js';

// ============================================================================
// MinIO Storage Configuration
// ============================================================================

export interface IMinioConfig {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  presignedUrlExpiry: number;
}

// ============================================================================
// MinIO Storage Provider
// ============================================================================

export class MinioStorageProvider implements IStorageProvider {
  private readonly client: Client;
  private readonly bucket: string;
  private readonly logger: Logger;

  constructor(config: IMinioConfig, logger: Logger) {
    this.client = new Client({
      endPoint: config.endPoint,
      port: config.port,
      useSSL: config.useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });
    this.bucket = config.bucket;
    this.logger = logger.child({ component: 'MinioStorageProvider' });
  }

  /**
   * Ensure the bucket exists, creating it if necessary.
   */
  async ensureBucket(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket, 'us-east-1');
      this.logger.info({ bucket: this.bucket }, 'Created storage bucket');
    }
  }

  /**
   * Generate a presigned PUT URL for client-side upload.
   */
  async getPresignedUploadUrl(
    objectKey: string,
    _mimeType: string,
    expirySeconds: number
  ): Promise<string> {
    this.logger.debug({ objectKey, expirySeconds }, 'Generating presigned upload URL');

    const url = await this.client.presignedPutObject(this.bucket, objectKey, expirySeconds);

    return url;
  }

  /**
   * Generate a presigned GET URL for client-side download.
   */
  async getPresignedDownloadUrl(objectKey: string, expirySeconds: number): Promise<string> {
    this.logger.debug({ objectKey, expirySeconds }, 'Generating presigned download URL');

    const url = await this.client.presignedGetObject(this.bucket, objectKey, expirySeconds);

    return url;
  }

  /**
   * Delete an object from storage.
   */
  async deleteObject(objectKey: string): Promise<void> {
    this.logger.debug({ objectKey }, 'Deleting object');

    await this.client.removeObject(this.bucket, objectKey);
  }

  /**
   * Check if an object exists in storage.
   */
  async objectExists(objectKey: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, objectKey);
      return true;
    } catch (error: unknown) {
      const err = error as { code?: string };
      if (err.code === 'NotFound') {
        return false;
      }
      throw error;
    }
  }
}
