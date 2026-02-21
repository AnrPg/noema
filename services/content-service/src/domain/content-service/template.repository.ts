/**
 * @noema/content-service - Template Repository Interface
 *
 * Abstract repository interface for template data access.
 */

import type { IPaginatedResponse, TemplateId, UserId } from '@noema/types';
import type {
    ICreateTemplateInput,
    ITemplate,
    ITemplateQuery,
    ITemplateSummary,
    IUpdateTemplateInput,
} from '../../types/content.types.js';

// ============================================================================
// Repository Interface
// ============================================================================

export interface ITemplateRepository {
  // Read Operations
  findById(id: TemplateId): Promise<ITemplate | null>;
  findByIdForUser(id: TemplateId, userId: UserId): Promise<ITemplate | null>;
  query(query: ITemplateQuery, userId: UserId): Promise<IPaginatedResponse<ITemplateSummary>>;

  // Write Operations
  create(input: ICreateTemplateInput & { id: TemplateId; userId: UserId }): Promise<ITemplate>;
  update(id: TemplateId, input: IUpdateTemplateInput, version: number): Promise<ITemplate>;
  incrementUsageCount(id: TemplateId): Promise<void>;
  softDelete(id: TemplateId, version: number): Promise<void>;
  hardDelete(id: TemplateId): Promise<void>;
}
