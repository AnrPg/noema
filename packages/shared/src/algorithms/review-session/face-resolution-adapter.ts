// =============================================================================
// FACE RESOLUTION ADAPTER
// =============================================================================
// Integrates the FaceResolutionEngine with the Review Session Orchestrator.
// Provides face pivoting support for advanced users.
// =============================================================================

import type {
  FaceResolutionProvider,
  AlternativeFace,
  ImprovementPotential,
} from "../../types/review-session.types";

import type {
  FaceResolutionInput,
  FaceResolutionOutput,
  IFaceResolutionEngine,
  CardFaceWithRules,
  CategoryLensContext,
  ParticipationContext,
  ModeContext,
  LkgcSignalsContext,
  ResolutionRequestId,
} from "../../types/face-resolution.types";

import type {
  CanonicalCardId,
  CardFace,
  CardFaceId,
  CognitiveDepthLevel,
} from "../../types/canonical-card.types";
import type { UserId } from "../../types/user.types";
import type {
  NormalizedValue,
  Confidence,
  Timestamp,
} from "../../types/lkgc/foundation";

// =============================================================================
// FACE RESOLUTION ADAPTER
// =============================================================================

/**
 * Adapter that bridges the FaceResolutionEngine with the session orchestrator.
 * Adds face pivoting analysis and alternative face recommendations.
 */
export class FaceResolutionAdapter implements FaceResolutionProvider {
  private readonly engine: IFaceResolutionEngine;
  private readonly config: FaceAdapterConfig;

  constructor(
    engine: IFaceResolutionEngine,
    config: Partial<FaceAdapterConfig> = {},
  ) {
    this.engine = engine;
    this.config = { ...DEFAULT_FACE_ADAPTER_CONFIG, ...config };
  }

  /**
   * Resolve face for a single card
   */
  async resolveFace(input: FaceResolutionInput): Promise<FaceResolutionOutput> {
    return this.engine.resolve(input);
  }

  /**
   * Resolve faces for multiple cards
   */
  async resolveFacesBatch(
    inputs: readonly FaceResolutionInput[],
  ): Promise<readonly FaceResolutionOutput[]> {
    // Use the engine's batch method if available
    if (this.engine.resolveBatch) {
      return this.engine.resolveBatch(inputs);
    }

    // Fallback to parallel individual resolutions
    const results = await Promise.all(
      inputs
        .slice(0, this.config.maxConcurrentResolutions)
        .map((input) => this.engine.resolve(input)),
    );

    // Handle remaining inputs sequentially if we exceeded concurrent limit
    if (inputs.length > this.config.maxConcurrentResolutions) {
      for (
        let i = this.config.maxConcurrentResolutions;
        i < inputs.length;
        i++
      ) {
        results.push(await this.engine.resolve(inputs[i]));
      }
    }

    return results;
  }

  /**
   * Get alternative faces for a card with improvement potential analysis
   */
  async getAlternativeFaces(
    cardId: CanonicalCardId,
    currentFaceId: CardFaceId,
    context: FaceResolutionInput,
  ): Promise<readonly AlternativeFace[]> {
    const availableFaces = context.availableFaces;

    // Filter out current face
    const alternatives = availableFaces.filter(
      (f) => f.face.id !== currentFaceId,
    );

    if (alternatives.length === 0) {
      return [];
    }

    // Analyze each alternative
    const analyzedAlternatives: AlternativeFace[] = [];

    for (const alt of alternatives) {
      const analysis = await this.analyzeAlternativeFace(
        alt.face,
        currentFaceId,
        context,
      );
      analyzedAlternatives.push(analysis);
    }

    // Sort by relevance
    analyzedAlternatives.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Return top alternatives
    return analyzedAlternatives.slice(0, this.config.maxAlternatives);
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private async analyzeAlternativeFace(
    face: CardFace,
    currentFaceId: CardFaceId,
    context: FaceResolutionInput,
  ): Promise<AlternativeFace> {
    // Calculate relevance score based on context
    const relevanceScore = this.calculateFaceRelevance(face, context);

    // Determine availability reason
    const availabilityReason = this.getAvailabilityReason(face, context);

    // Analyze improvement potential
    const improvementPotential = this.analyzeImprovementPotential(
      face,
      currentFaceId,
      context,
    );

    return {
      face,
      faceId: face.id,
      relevanceScore,
      availabilityReason,
      improvementPotential,
    };
  }

  private calculateFaceRelevance(
    face: CardFace,
    context: FaceResolutionInput,
  ): NormalizedValue {
    let relevance = 0.5; // Base relevance

    // Mode-based relevance
    if (context.mode) {
      relevance += this.getModeRelevanceBonus(face, context.mode);
    }

    // Category-based relevance
    if (context.categoryLens) {
      relevance += this.getCategoryRelevanceBonus(face, context.categoryLens);
    }

    // LKGC signal-based relevance
    if (context.lkgcSignals) {
      relevance += this.getLkgcRelevanceBonus(face, context.lkgcSignals);
    }

    return Math.max(0, Math.min(1, relevance)) as NormalizedValue;
  }

  private getModeRelevanceBonus(face: CardFace, mode: ModeContext): number {
    // Different modes prefer different face types
    if (!mode.systemModeType) return 0;

    const modePreferences: Record<string, Record<string, number>> = {
      exploration: {
        recognition: 0.1,
        recall: 0.05,
        application: 0.15,
        synthesis: 0.2,
      },
      goal_driven: {
        recognition: 0.05,
        recall: 0.15,
        application: 0.1,
        synthesis: 0.05,
      },
      exam_oriented: {
        recognition: 0.15,
        recall: 0.2,
        application: 0.05,
        synthesis: 0,
      },
      synthesis: {
        recognition: 0,
        recall: 0.05,
        application: 0.1,
        synthesis: 0.25,
      },
    };

    const prefs = modePreferences[mode.systemModeType];
    if (!prefs) return 0;

    return prefs[face.faceType] ?? 0;
  }

  private getCategoryRelevanceBonus(
    face: CardFace,
    categoryLens: CategoryLensContext,
  ): number {
    // If category has a framing question, prefer faces that align
    if (categoryLens.framingQuestion) {
      // Simple heuristic: application faces for "how" questions
      // recall faces for "what" questions
      const question = categoryLens.framingQuestion.toLowerCase();
      if (question.includes("how") && face.faceType === "application") {
        return 0.15;
      }
      if (question.includes("what") && face.faceType === "recall") {
        return 0.15;
      }
    }

    return 0;
  }

  private getLkgcRelevanceBonus(
    face: CardFace,
    signals: LkgcSignalsContext,
  ): number {
    let bonus = 0;

    // Low stability → prefer recognition/recall faces
    if (signals.stability !== undefined && signals.stability < 0.3) {
      if (face.faceType === "recognition" || face.faceType === "recall") {
        bonus += 0.1;
      }
    }

    // High confidence → prefer application/synthesis faces
    if (signals.confidence !== undefined && signals.confidence > 0.7) {
      if (face.faceType === "application" || face.faceType === "synthesis") {
        bonus += 0.1;
      }
    }

    return bonus;
  }

  private getAvailabilityReason(
    face: CardFace,
    context: FaceResolutionInput,
  ): string {
    const faceType = face.faceType;
    const depth = face.depthLevel;

    // Generate human-readable reason
    const typeDescriptions: Record<string, string> = {
      recognition: "Test recognition of the concept",
      recall: "Practice active recall",
      application: "Apply knowledge to scenarios",
      synthesis: "Explore relationships with other concepts",
      definition: "Review the definition",
      cloze: "Fill in the blank exercise",
      explanation: "Explain the concept",
    };

    const depthDescriptions: Record<string, string> = {
      recognition: "Quick recognition",
      recall: "Active recall",
      understanding: "Standard depth",
      application: "Applied understanding",
      analysis: "Deep analysis",
      synthesis: "Synthesis level",
    };

    const typeDesc = typeDescriptions[faceType] ?? "Alternative perspective";
    const depthDesc = depthDescriptions[depth] ?? "";

    return `${typeDesc}${depthDesc ? ` (${depthDesc})` : ""}`;
  }

  private analyzeImprovementPotential(
    face: CardFace,
    currentFaceId: CardFaceId,
    context: FaceResolutionInput,
  ): ImprovementPotential | undefined {
    // Find current face
    const currentFaceEntry = context.availableFaces.find(
      (f) => f.face.id === currentFaceId,
    );
    if (!currentFaceEntry) return undefined;

    const currentFace = currentFaceEntry.face;

    // Compare depth levels
    const depthOrder: Record<CognitiveDepthLevel, number> = {
      recognition: 1,
      recall: 2,
      understanding: 3,
      application: 4,
      analysis: 5,
      synthesis: 6,
      evaluation: 7,
    };

    const currentDepth = depthOrder[currentFace.depthLevel] ?? 2;
    const alternativeDepth = depthOrder[face.depthLevel] ?? 2;

    if (alternativeDepth > currentDepth) {
      return {
        type: "depth",
        description: `Switching to "${face.name}" provides deeper exploration of the concept`,
        confidence: 0.7 as Confidence,
      };
    }

    if (alternativeDepth < currentDepth) {
      return {
        type: "reinforcement",
        description: `"${face.name}" offers simpler reinforcement if the current depth is too challenging`,
        confidence: 0.6 as Confidence,
      };
    }

    // Compare face types
    if (currentFace.faceType !== face.faceType) {
      if (face.faceType === "synthesis" || face.faceType === "comparison") {
        return {
          type: "breadth",
          description: `"${face.name}" helps connect this concept to related knowledge`,
          confidence: 0.65 as Confidence,
        };
      }

      if (
        face.faceType === "application" ||
        face.faceType === "problem_solving"
      ) {
        return {
          type: "challenge",
          description: `"${face.name}" tests practical application of the concept`,
          confidence: 0.7 as Confidence,
        };
      }
    }

    return undefined;
  }
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Configuration for the face adapter
 */
export interface FaceAdapterConfig {
  /** Maximum concurrent face resolutions */
  readonly maxConcurrentResolutions: number;

  /** Maximum alternative faces to return */
  readonly maxAlternatives: number;

  /** Include improvement potential analysis */
  readonly analyzeImprovementPotential: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_FACE_ADAPTER_CONFIG: FaceAdapterConfig = {
  maxConcurrentResolutions: 5,
  maxAlternatives: 4,
  analyzeImprovementPotential: true,
};

// =============================================================================
// FACE PIVOT ANALYZER
// =============================================================================

/**
 * Analyzes face pivoting patterns for learning insights
 */
export class FacePivotAnalyzer {
  private readonly pivotHistory: Map<string, PivotHistoryEntry[]>;

  constructor() {
    this.pivotHistory = new Map();
  }

  /**
   * Record a face pivot
   */
  recordPivot(
    userId: string,
    cardId: CanonicalCardId,
    fromFaceId: CardFaceId,
    toFaceId: CardFaceId,
    reason: string | undefined,
    timestamp: Timestamp,
  ): void {
    const key = `${userId}:${cardId}`;
    const entry: PivotHistoryEntry = {
      fromFaceId,
      toFaceId,
      reason,
      timestamp,
    };

    const history = this.pivotHistory.get(key) ?? [];
    history.push(entry);
    this.pivotHistory.set(key, history);
  }

  /**
   * Get pivot patterns for a user
   */
  getPivotPatterns(userId: string): PivotPattern[] {
    const patterns: PivotPattern[] = [];
    const userPivots: PivotHistoryEntry[] = [];

    // Collect all pivots for user
    for (const [key, entries] of this.pivotHistory.entries()) {
      if (key.startsWith(`${userId}:`)) {
        userPivots.push(...entries);
      }
    }

    // Analyze patterns
    const reasonCounts = new Map<string, number>();
    const transitionCounts = new Map<string, number>();

    for (const pivot of userPivots) {
      // Count reasons
      if (pivot.reason) {
        reasonCounts.set(
          pivot.reason,
          (reasonCounts.get(pivot.reason) ?? 0) + 1,
        );
      }

      // Count transitions
      const transition = `${pivot.fromFaceId}→${pivot.toFaceId}`;
      transitionCounts.set(
        transition,
        (transitionCounts.get(transition) ?? 0) + 1,
      );
    }

    // Build patterns
    if (userPivots.length > 0) {
      // Most common reason
      let topReason: string | undefined;
      let topReasonCount = 0;
      for (const [reason, count] of reasonCounts.entries()) {
        if (count > topReasonCount) {
          topReason = reason;
          topReasonCount = count;
        }
      }

      if (topReason && topReasonCount >= 3) {
        patterns.push({
          type: "reason_preference",
          description: `Frequently pivots due to "${topReason}"`,
          frequency: topReasonCount / userPivots.length,
          suggestion: this.getSuggestionForReason(topReason),
        });
      }

      // Check for difficulty mismatch pattern
      const tooHardCount = reasonCounts.get("too_hard") ?? 0;
      const tooEasyCount = reasonCounts.get("too_easy") ?? 0;

      if (tooHardCount > userPivots.length * 0.3) {
        patterns.push({
          type: "difficulty_mismatch",
          description: "Frequently finds faces too challenging",
          frequency: tooHardCount / userPivots.length,
          suggestion:
            "Consider adjusting default face selection to prefer simpler faces",
        });
      }

      if (tooEasyCount > userPivots.length * 0.3) {
        patterns.push({
          type: "challenge_seeking",
          description: "Often seeks more challenging faces",
          frequency: tooEasyCount / userPivots.length,
          suggestion: "Consider enabling deeper face selection by default",
        });
      }
    }

    return patterns;
  }

  /**
   * Get learning recommendations based on pivot history
   */
  getRecommendations(userId: string): PivotRecommendation[] {
    const patterns = this.getPivotPatterns(userId);
    const recommendations: PivotRecommendation[] = [];

    for (const pattern of patterns) {
      if (pattern.suggestion) {
        recommendations.push({
          pattern: pattern.type,
          recommendation: pattern.suggestion,
          confidence: pattern.frequency as Confidence,
        });
      }
    }

    return recommendations;
  }

  private getSuggestionForReason(reason: string): string | undefined {
    const suggestions: Record<string, string> = {
      too_easy: "Enable deeper face selection to match your skill level",
      too_hard: "Start with recognition faces before progressing to recall",
      want_different_angle:
        "You learn well from multiple perspectives - keep exploring!",
      context_mismatch:
        "Face rules may need adjustment for your learning context",
    };
    return suggestions[reason];
  }
}

/**
 * Pivot history entry
 */
export interface PivotHistoryEntry {
  readonly fromFaceId: CardFaceId;
  readonly toFaceId: CardFaceId;
  readonly reason: string | undefined;
  readonly timestamp: Timestamp;
}

/**
 * Detected pivot pattern
 */
export interface PivotPattern {
  readonly type: string;
  readonly description: string;
  readonly frequency: number;
  readonly suggestion?: string;
}

/**
 * Recommendation based on pivot patterns
 */
export interface PivotRecommendation {
  readonly pattern: string;
  readonly recommendation: string;
  readonly confidence: Confidence;
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a face resolution adapter
 */
export function createFaceResolutionAdapter(
  engine: IFaceResolutionEngine,
  config?: Partial<FaceAdapterConfig>,
): FaceResolutionProvider {
  return new FaceResolutionAdapter(engine, config);
}

/**
 * Create a face pivot analyzer
 */
export function createFacePivotAnalyzer(): FacePivotAnalyzer {
  return new FacePivotAnalyzer();
}
