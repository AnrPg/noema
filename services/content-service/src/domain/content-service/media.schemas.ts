/**
 * @noema/content-service - Media Schemas
 *
 * Zod validation schemas for media file operations.
 */

import { z } from 'zod';

// ============================================================================
// Upload Request Schema
// ============================================================================

/**
 * Schema for requesting a presigned upload URL.
 */
export const RequestUploadUrlSchema = z
  .object({
    originalFilename: z
      .string()
      .min(1, 'Filename is required')
      .max(500, 'Filename must be at most 500 characters'),
    mimeType: z
      .string()
      .min(1, 'MIME type is required')
      .max(200, 'MIME type must be at most 200 characters')
      .regex(/^[\w-]+\/[\w.+-]+$/, 'Invalid MIME type format'),
    sizeBytes: z
      .number()
      .int()
      .positive('File size must be positive')
      .max(104_857_600, 'File size must be at most 100 MB'),
    alt: z.string().max(500, 'Alt text must be at most 500 characters').optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

// ============================================================================
// Confirm Upload Schema
// ============================================================================

/**
 * Schema for confirming that an upload completed.
 */
export const ConfirmUploadSchema = z
  .object({
    sizeBytes: z
      .number()
      .int()
      .positive('File size must be positive')
      .max(104_857_600, 'File size must be at most 100 MB'),
  })
  .strict();

// ============================================================================
// Media Query Schema
// ============================================================================

/**
 * Schema for querying media files.
 */
export const MediaQuerySchema = z
  .object({
    mimeType: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional().default(20),
    offset: z.number().int().min(0).optional().default(0),
  })
  .strict();

// ============================================================================
// Type Exports
// ============================================================================

export type RequestUploadUrlInput = z.infer<typeof RequestUploadUrlSchema>;
export type ConfirmUploadInput = z.infer<typeof ConfirmUploadSchema>;
export type MediaQueryInput = z.infer<typeof MediaQuerySchema>;
