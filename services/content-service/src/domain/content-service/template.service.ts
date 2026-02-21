/**
 * @noema/content-service - Template Service
 *
 * Domain service implementing template CRUD and instantiation logic.
 */

import type { IAgentHints } from '@noema/contracts';
import type { IPaginatedResponse, TemplateId } from '@noema/types';
import { ID_PREFIXES } from '@noema/types';
import { nanoid } from 'nanoid';
import type { Logger } from 'pino';
import type {
  ICreateCardInput,
  ICreateTemplateInput,
  ITemplate,
  ITemplateQuery,
  ITemplateSummary,
  IUpdateTemplateInput,
} from '../../types/content.types.js';
import type { IEventPublisher } from '../shared/event-publisher.js';
import type { IExecutionContext, IServiceResult } from './content.service.js';
import { AuthorizationError, BusinessRuleError, ValidationError } from './errors/index.js';
import type { ITemplateRepository } from './template.repository.js';
import {
  CreateTemplateInputSchema,
  TemplateQuerySchema,
  UpdateTemplateInputSchema,
} from './template.schemas.js';

// ============================================================================
// Template Not Found Error (reuses CardNotFoundError pattern)
// ============================================================================

export class TemplateNotFoundError extends BusinessRuleError {
  public readonly templateId: string;
  constructor(templateId: string) {
    super(`Template not found: ${templateId}`, { templateId });
    this.templateId = templateId;
  }
}

// ============================================================================
// Template Service
// ============================================================================

export class TemplateService {
  private readonly logger: Logger;

  constructor(
    private readonly repository: ITemplateRepository,
    private readonly eventPublisher: IEventPublisher,
    logger: Logger
  ) {
    this.logger = logger.child({ service: 'TemplateService' });
  }

  // ============================================================================
  // Create
  // ============================================================================

  async create(
    input: ICreateTemplateInput,
    context: IExecutionContext
  ): Promise<IServiceResult<ITemplate>> {
    this.requireAuth(context);
    this.logger.info({ templateName: input.name, cardType: input.cardType }, 'Creating template');

    const parseResult = CreateTemplateInputSchema.safeParse(input);
    if (!parseResult.success) {
      const errors = parseResult.error.flatten();
      throw new ValidationError(
        'Invalid template input',
        errors.fieldErrors as Record<string, string[]>
      );
    }

    const id = `${ID_PREFIXES.TemplateId}${nanoid(21)}` as TemplateId;

    const template = await this.repository.create({
      id,
      userId: context.userId!, // eslint-disable-line @typescript-eslint/no-non-null-assertion
      ...(parseResult.data as unknown as ICreateTemplateInput),
    });

    await this.eventPublisher.publish({
      eventType: 'template.created',
      aggregateType: 'Template',
      aggregateId: id,
      payload: { entity: template },
      metadata: {
        correlationId: context.correlationId,
        userId: context.userId,
      },
    });

    this.logger.info({ templateId: id }, 'Template created');

    return {
      data: template,
      agentHints: this.createAgentHints('created', template),
    };
  }

  // ============================================================================
  // Read
  // ============================================================================

  async findById(id: TemplateId, context: IExecutionContext): Promise<IServiceResult<ITemplate>> {
    this.requireAuth(context);

    // Public templates visible to all; private/shared require ownership or admin
    const template = await this.repository.findById(id);
    if (!template) {
      throw new TemplateNotFoundError(id);
    }

    if (template.visibility === 'private' && template.userId !== context.userId) {
      if (!this.isAdmin(context)) {
        throw new TemplateNotFoundError(id); // don't leak existence
      }
    }

    return {
      data: template,
      agentHints: this.createAgentHints('found', template),
    };
  }

  async query(
    queryInput: ITemplateQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<IPaginatedResponse<ITemplateSummary>>> {
    this.requireAuth(context);

    const parseResult = TemplateQuerySchema.safeParse(queryInput);
    if (!parseResult.success) {
      const errors = parseResult.error.flatten();
      throw new ValidationError('Invalid query', errors.fieldErrors as Record<string, string[]>);
    }

    const validated = parseResult.data as ITemplateQuery;
    const effectiveUserId =
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.isAdmin(context) && validated.userId ? (validated.userId) : context.userId!;

    const result = await this.repository.query(validated, effectiveUserId);

    return {
      data: result,
      agentHints: {
        suggestedNextActions: [
          {
            action: 'create_card_from_template',
            description: 'Instantiate a card from a template',
            priority: 'high',
            category: 'optimization',
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
        reasoning: `Query returned ${String(result.total)} templates`,
      },
    };
  }

  // ============================================================================
  // Update
  // ============================================================================

  async update(
    id: TemplateId,
    input: IUpdateTemplateInput,
    version: number,
    context: IExecutionContext
  ): Promise<IServiceResult<ITemplate>> {
    this.requireAuth(context);
    this.logger.info({ templateId: id }, 'Updating template');

    const parseResult = UpdateTemplateInputSchema.safeParse(input);
    if (!parseResult.success) {
      const errors = parseResult.error.flatten();
      throw new ValidationError(
        'Invalid update input',
        errors.fieldErrors as Record<string, string[]>
      );
    }

    await this.requireTemplateOwnership(id, context);

    const template = await this.repository.update(
      id,
      parseResult.data as IUpdateTemplateInput,
      version
    );

    await this.eventPublisher.publish({
      eventType: 'template.updated',
      aggregateType: 'Template',
      aggregateId: id,
      payload: { changes: parseResult.data },
      metadata: {
        correlationId: context.correlationId,
        userId: context.userId,
      },
    });

    return {
      data: template,
      agentHints: this.createAgentHints('updated', template),
    };
  }

  // ============================================================================
  // Delete
  // ============================================================================

  async delete(id: TemplateId, soft: boolean, context: IExecutionContext): Promise<void> {
    this.requireAuth(context);
    this.logger.info({ templateId: id, soft }, 'Deleting template');

    const existing = await this.requireTemplateOwnership(id, context);

    if (soft) {
      await this.repository.softDelete(id, existing.version);
    } else {
      if (!this.isAdmin(context)) {
        throw new AuthorizationError('Hard delete requires admin role');
      }
      await this.repository.hardDelete(id);
    }

    await this.eventPublisher.publish({
      eventType: 'template.deleted',
      aggregateType: 'Template',
      aggregateId: id,
      payload: { soft },
      metadata: {
        correlationId: context.correlationId,
        userId: context.userId,
      },
    });
  }

  // ============================================================================
  // Instantiate — Convert template to card input
  // ============================================================================

  /**
   * Convert a template into a card creation input.
   * Increments the template's usage count.
   */
  async instantiate(
    id: TemplateId,
    overrides: Partial<ICreateCardInput>,
    context: IExecutionContext
  ): Promise<IServiceResult<ICreateCardInput>> {
    this.requireAuth(context);

    const templateResult = await this.findById(id, context);
    const template = templateResult.data;

    // Build card input from template + overrides
    const cardInput: ICreateCardInput = {
      cardType: overrides.cardType ?? template.cardType,
      content: overrides.content ?? template.content,
      difficulty: overrides.difficulty ?? template.difficulty,
      knowledgeNodeIds: overrides.knowledgeNodeIds ?? [...template.knowledgeNodeIds],
      tags: overrides.tags ?? [...template.tags],
      source: overrides.source ?? 'user',
      metadata: {
        ...template.metadata,
        ...overrides.metadata,
        templateId: template.id,
        templateName: template.name,
      },
    };

    // Track usage
    await this.repository.incrementUsageCount(id);

    this.logger.info({ templateId: id }, 'Template instantiated');

    return {
      data: cardInput,
      agentHints: {
        suggestedNextActions: [
          {
            action: 'create_card',
            description: 'Create the card from this template output',
            priority: 'high',
            category: 'optimization',
          },
        ],
        relatedResources: [
          { type: 'Template', id: template.id, label: template.name, relevance: 1.0 },
        ],
        confidence: 1.0,
        sourceQuality: 'high',
        validityPeriod: 'medium',
        contextNeeded: [],
        assumptions: ['Template content used as-is unless overrides provided'],
        riskFactors: [],
        dependencies: [],
        estimatedImpact: { benefit: 0.9, effort: 0.1, roi: 9.0 },
        preferenceAlignment: [],
        reasoning: `Instantiated template "${template.name}" for card creation`,
      },
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

  private isAdmin(context: IExecutionContext): boolean {
    return context.roles.includes('admin') || context.roles.includes('super_admin');
  }

  private async requireTemplateOwnership(
    id: TemplateId,
    context: IExecutionContext
  ): Promise<ITemplate> {
    const template = await this.repository.findById(id);
    if (!template) {
      throw new TemplateNotFoundError(id);
    }
    if (this.isAdmin(context)) return template;
    if (template.userId !== context.userId) {
      throw new TemplateNotFoundError(id);
    }
    return template;
  }

  private createAgentHints(action: string, template: ITemplate): IAgentHints {
    return {
      suggestedNextActions: [
        ...(action === 'created'
          ? [
              {
                action: 'instantiate_template' as const,
                description: 'Create a card from this template',
                priority: 'high' as const,
                category: 'optimization' as const,
              },
            ]
          : []),
        ...(action === 'found'
          ? [
              {
                action: 'instantiate_template' as const,
                description: 'Create a card from this template',
                priority: 'high' as const,
                category: 'optimization' as const,
              },
              {
                action: 'update_template' as const,
                description: 'Update the template',
                priority: 'low' as const,
                category: 'optimization' as const,
              },
            ]
          : []),
      ],
      relatedResources: [
        { type: 'Template', id: template.id, label: template.name, relevance: 1.0 },
      ],
      confidence: 1.0,
      sourceQuality: 'high',
      validityPeriod: 'medium',
      contextNeeded: [],
      assumptions: [],
      riskFactors: [],
      dependencies: [],
      estimatedImpact: { benefit: 0.8, effort: 0.2, roi: 4.0 },
      preferenceAlignment: [],
      reasoning: `Template ${action} operation completed`,
    };
  }
}
