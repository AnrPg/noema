/**
 * @noema/knowledge-graph-service - Ontology Import API Schemas
 *
 * Zod validation schemas for ontology import source and run routes.
 */

import { z } from 'zod';
import {
  OntologyAccessModeSchema,
  OntologyImportRunConfigurationSchema,
  OntologyImportStatusSchema,
  OntologyRunTriggerSchema,
  OntologySourceRoleSchema,
} from '../../domain/knowledge-graph-service/ontology-imports.contracts.js';

export const OntologyImportSourceQuerySchema = z.object({
  role: OntologySourceRoleSchema.optional(),
  accessMode: OntologyAccessModeSchema.optional(),
});

export const OntologyImportRunsQuerySchema = z.object({
  sourceId: z.string().min(1, 'Source id is required').optional(),
  status: OntologyImportStatusSchema.optional(),
});

export const OntologyImportRunIdParamsSchema = z.object({
  runId: z.string().min(1, 'Run id is required'),
});

export const OntologyImportSourceIdParamsSchema = z.object({
  sourceId: z.string().min(1, 'Source id is required'),
});

export const CreateOntologyImportRunRequestSchema = z.object({
  sourceId: z.string().min(1, 'Source id is required'),
  trigger: OntologyRunTriggerSchema.default('manual'),
  sourceVersion: z.string().min(1).optional(),
  configuration: OntologyImportRunConfigurationSchema.partial().optional(),
});

export const RegisterOntologySourceRequestSchema = z.object({
  id: z.string().min(1, 'Source id is required'),
  name: z.string().min(1, 'Source name is required'),
  role: OntologySourceRoleSchema,
  accessMode: OntologyAccessModeSchema,
  description: z.string().min(1, 'Description is required'),
  homepageUrl: z.string().url().optional(),
  documentationUrl: z.string().url().optional(),
  supportedLanguages: z.array(z.string().min(1)).default([]),
  supportsIncremental: z.boolean().optional(),
});

export const UpdateOntologySourceRequestSchema = z
  .object({
    enabled: z.boolean().optional(),
  })
  .refine((value) => value.enabled !== undefined, {
    message: 'Provide at least one field to update.',
  });

export const CancelOntologyImportRunRequestSchema = z.object({
  reason: z.string().min(1).max(2000).optional(),
});

export type OntologyImportSourceQuery = z.infer<typeof OntologyImportSourceQuerySchema>;
export type OntologyImportRunsQuery = z.infer<typeof OntologyImportRunsQuerySchema>;
export type OntologyImportRunIdParams = z.infer<typeof OntologyImportRunIdParamsSchema>;
export type OntologyImportSourceIdParams = z.infer<typeof OntologyImportSourceIdParamsSchema>;
export type CreateOntologyImportRunRequest = z.infer<typeof CreateOntologyImportRunRequestSchema>;
export type RegisterOntologySourceRequest = z.infer<typeof RegisterOntologySourceRequestSchema>;
export type UpdateOntologySourceRequest = z.infer<typeof UpdateOntologySourceRequestSchema>;
export type CancelOntologyImportRunRequest = z.infer<typeof CancelOntologyImportRunRequestSchema>;
