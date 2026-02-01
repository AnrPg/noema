// =============================================================================
// STORAGE CONFIGURATION (MinIO/S3)
// =============================================================================

import { Client } from 'minio';
import { env } from './env.js';

export const minio = new Client({
  endPoint: env.MINIO_ENDPOINT,
  port: env.MINIO_PORT,
  useSSL: env.MINIO_USE_SSL,
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

// Ensure bucket exists
async function ensureBucket() {
  try {
    const exists = await minio.bucketExists(env.MINIO_BUCKET);
    if (!exists) {
      await minio.makeBucket(env.MINIO_BUCKET);
      console.log(`✅ Created bucket: ${env.MINIO_BUCKET}`);
    } else {
      console.log(`✅ Storage bucket ready: ${env.MINIO_BUCKET}`);
    }
  } catch (error) {
    console.error('❌ Storage error:', error);
  }
}

ensureBucket();

export type MinioClient = typeof minio;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Upload a file to storage
 */
export async function uploadFile(
  key: string,
  data: Buffer,
  mimeType: string
): Promise<string> {
  await minio.putObject(env.MINIO_BUCKET, key, data, data.length, {
    'Content-Type': mimeType,
  });
  
  // Return the URL
  if (env.NODE_ENV === 'production') {
    return `https://${env.MINIO_ENDPOINT}/${env.MINIO_BUCKET}/${key}`;
  }
  return `http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}/${env.MINIO_BUCKET}/${key}`;
}

/**
 * Get a presigned URL for download
 */
export async function getPresignedUrl(
  key: string,
  expirySeconds: number = 3600
): Promise<string> {
  return minio.presignedGetObject(env.MINIO_BUCKET, key, expirySeconds);
}

/**
 * Delete a file from storage
 */
export async function deleteFile(key: string): Promise<void> {
  await minio.removeObject(env.MINIO_BUCKET, key);
}
