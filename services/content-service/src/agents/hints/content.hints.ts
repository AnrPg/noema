/**
 * @noema/content-service - Agent Content Hints
 *
 * Hint generators that produce structured metadata for AI agents.
 * These hints appear in IServiceResult.agentHints and help agents
 * make informed decisions about follow-up actions.
 */

// ============================================================================
// Hint Types
// ============================================================================

export interface IContentHint {
  type: string;
  message: string;
  suggestedAction?: string;
  priority: 'low' | 'medium' | 'high';
}

// ============================================================================
// Hint Generators
// ============================================================================

/**
 * Generate hints based on card state transitions.
 */
export function generateStateTransitionHints(
  fromState: string,
  toState: string,
  _cardType: string
): IContentHint[] {
  const hints: IContentHint[] = [];

  if (fromState === 'draft' && toState === 'active') {
    hints.push({
      type: 'activation',
      message: 'Card activated — it is now eligible for scheduling.',
      suggestedAction: 'Consider linking to knowledge graph nodes if not already linked.',
      priority: 'low',
    });
  }

  if (toState === 'suspended') {
    hints.push({
      type: 'suspension',
      message: 'Card suspended — it will not appear in review sessions.',
      suggestedAction: 'Review and update content before reactivating.',
      priority: 'medium',
    });
  }

  if (toState === 'archived') {
    hints.push({
      type: 'archival',
      message: 'Card archived — it can be restored with POST /v1/cards/:id/restore.',
      suggestedAction: 'Verify this was intentional.',
      priority: 'low',
    });
  }

  return hints;
}

/**
 * Generate hints based on card quality signals.
 */
export function generateQualityHints(card: {
  content: Record<string, unknown>;
  tags: string[];
  knowledgeNodeIds: string[];
}): IContentHint[] {
  const hints: IContentHint[] = [];

  if (card.tags.length === 0) {
    hints.push({
      type: 'missing_tags',
      message: 'Card has no tags. Tags improve discoverability and organization.',
      suggestedAction: 'Add relevant tags.',
      priority: 'medium',
    });
  }

  if (card.knowledgeNodeIds.length === 0) {
    hints.push({
      type: 'unlinked',
      message: 'Card is not linked to any knowledge graph nodes.',
      suggestedAction: 'Link to relevant PKG nodes for curriculum integration.',
      priority: 'high',
    });
  }

  return hints;
}
