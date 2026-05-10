import type {
  CardId,
  CardType,
  ConceptId,
  DifficultyLevel,
  NodeId,
  RemediationCardType,
  UserId,
} from '@noema/types';
import type { IContentGenerationJob } from '../../types/content.types.js';

export interface IGeneratedCardDraft {
  cardType: CardType | RemediationCardType;
  conceptIds: ConceptId[];
  primaryConceptId?: ConceptId;
  relatedConceptIds?: ConceptId[];
  anchoredCkgNodeIds?: ConceptId[];
  anchoredPkgNodeIds?: NodeId[];
  content: Record<string, unknown>;
  tags: string[];
  difficulty?: DifficultyLevel;
  factualityScore: number;
  rationale?: string;
}

export interface IGeneratedTransformDraft extends IGeneratedCardDraft {
  parentCardId: CardId;
}

export interface IContentAgentContext {
  userId: UserId;
  correlationId: string;
}

export interface IContentAgentPort {
  generateContent(
    job: IContentGenerationJob,
    context: IContentAgentContext
  ): Promise<{ agentRunId: string; drafts: IGeneratedCardDraft[]; rejectedDrafts: unknown[] }>;

  transformCard(
    input: {
      parentCardId: CardId;
      prompt?: string;
      transformationKind: string;
      targetCardType?: CardType | RemediationCardType;
      targetCardTypes?: (CardType | RemediationCardType)[];
      count?: number;
      card?: Record<string, unknown>;
    },
    context: IContentAgentContext
  ): Promise<{ agentRunId: string; drafts: IGeneratedTransformDraft[]; rejectedDrafts: unknown[] }>;
}

export class NoopContentAgentClient implements IContentAgentPort {
  generateContent(): Promise<{
    agentRunId: string;
    drafts: IGeneratedCardDraft[];
    rejectedDrafts: unknown[];
  }> {
    return Promise.resolve({ agentRunId: 'content_agent_not_configured', drafts: [], rejectedDrafts: [] });
  }

  transformCard(): Promise<{ agentRunId: string; drafts: IGeneratedTransformDraft[]; rejectedDrafts: unknown[] }> {
    return Promise.reject(new Error('Content agent is not configured.'));
  }
}
