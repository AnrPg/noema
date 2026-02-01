// =============================================================================
// PLUGIN SYSTEM TYPES
// =============================================================================
// Highly extensible plugin architecture for:
// - Card generation (PDF, slides, notes → cards)
// - Scheduling (custom algorithms)
// - Scoring & feedback (speech, grading)
// - Domain-specific modes (medical, language, law)
// - Visualization (knowledge graphs, decay curves)
// - Meta-learning (strategy analysis)

import type { PluginId, UserId, DeckId, CardId } from './user.types';
import type { Card, CardContent } from './card.types';
import type { SchedulingResult, SchedulingContext } from './scheduler.types';

// =============================================================================
// PLUGIN CATEGORIES
// =============================================================================

/**
 * Categories of plugins supported by the platform
 */
export type PluginCategory =
  | 'card_generation'    // Generate cards from various sources
  | 'scheduling'         // Custom SRS algorithms
  | 'scoring'            // Grade responses, speech recognition
  | 'domain'             // Domain-specific learning modes
  | 'visualization'      // Knowledge graphs, charts
  | 'meta_learning'      // Strategy analysis, recommendations
  | 'import_export'      // File format support
  | 'integration'        // External service connections
  | 'ui_extension'       // Custom UI components
  | 'ai_enhancement';    // AI-powered features

/**
 * Plugin capability flags
 */
export type PluginCapability =
  // Card generation capabilities
  | 'parse_pdf'
  | 'parse_markdown'
  | 'parse_anki'
  | 'parse_csv'
  | 'parse_slides'
  | 'parse_audio'
  | 'parse_video'
  | 'generate_cloze'
  | 'generate_qa'
  | 'generate_occlusion'
  // Scheduling capabilities
  | 'custom_scheduler'
  | 'fatigue_aware'
  | 'context_aware'
  | 'ai_scheduler'
  // Scoring capabilities
  | 'speech_recognition'
  | 'fuzzy_matching'
  | 'semantic_scoring'
  | 'partial_credit'
  // Visualization capabilities
  | 'knowledge_graph'
  | 'decay_curves'
  | 'progress_charts'
  | 'heatmaps'
  // Meta-learning capabilities
  | 'strategy_analysis'
  | 'learning_recommendations'
  | 'efficiency_tracking';

// =============================================================================
// PLUGIN MANIFEST & METADATA
// =============================================================================

/**
 * Plugin manifest - Required metadata for all plugins
 * This is loaded from plugin.json in the plugin package
 */
export interface PluginManifest {
  readonly id: PluginId;
  readonly name: string;
  readonly version: string;                     // Semver: "1.0.0"
  readonly description: string;
  readonly author: PluginAuthor;
  readonly license: string;
  readonly homepage: string | null;
  readonly repository: string | null;
  
  // Categorization
  readonly category: PluginCategory;
  readonly capabilities: readonly PluginCapability[];
  readonly tags: readonly string[];
  
  // Compatibility
  readonly platformVersion: string;             // Min platform version: ">=1.0.0"
  readonly dependencies: Record<string, string>;// Other plugins needed
  
  // Entry points
  readonly main: string;                        // Main module path
  readonly ui: string | null;                   // UI component path (if any)
  
  // Permissions
  readonly permissions: readonly PluginPermission[];
  
  // Configuration schema
  readonly configSchema: PluginConfigSchema | null;
  
  // Assets
  readonly icon: string | null;
  readonly screenshots: readonly string[];
  
  // Marketplace
  readonly pricing: 'free' | 'paid' | 'freemium';
  readonly verified: boolean;
}

/**
 * Plugin author information
 */
export interface PluginAuthor {
  readonly name: string;
  readonly email: string | null;
  readonly url: string | null;
}

/**
 * Permissions that plugins can request
 */
export type PluginPermission =
  | 'read_cards'         // Read card content
  | 'write_cards'        // Create/modify cards
  | 'read_decks'         // Read deck information
  | 'write_decks'        // Create/modify decks
  | 'read_reviews'       // Access review history
  | 'write_reviews'      // Record reviews
  | 'read_user'          // Read user profile
  | 'write_user'         // Modify user settings
  | 'network'            // Make network requests
  | 'storage'            // Use local storage
  | 'clipboard'          // Access clipboard
  | 'notifications'      // Show notifications
  | 'audio'              // Record/play audio
  | 'camera'             // Access camera
  | 'file_system';       // Read/write files

/**
 * Plugin configuration schema (JSON Schema subset)
 */
export interface PluginConfigSchema {
  readonly type: 'object';
  readonly properties: Record<string, PluginConfigProperty>;
  readonly required: readonly string[];
}

/**
 * Individual configuration property
 */
export interface PluginConfigProperty {
  readonly type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  readonly title: string;
  readonly description: string;
  readonly default?: unknown;
  readonly enum?: readonly unknown[];
  readonly minimum?: number;
  readonly maximum?: number;
}

// =============================================================================
// PLUGIN INSTANCE & LIFECYCLE
// =============================================================================

/**
 * Installed plugin instance
 */
export interface InstalledPlugin {
  readonly id: PluginId;
  readonly manifest: PluginManifest;
  readonly installedAt: Date;
  readonly updatedAt: Date;
  readonly version: string;
  
  // State
  readonly isEnabled: boolean;
  readonly isLoaded: boolean;
  readonly loadError: string | null;
  
  // User configuration
  readonly config: Record<string, unknown>;
  
  // Usage statistics
  readonly usageCount: number;
  readonly lastUsedAt: Date | null;
}

/**
 * Plugin lifecycle hooks
 */
export interface PluginLifecycle {
  // Called when plugin is first installed
  onInstall?(): Promise<void>;
  
  // Called when plugin is enabled
  onEnable?(): Promise<void>;
  
  // Called when plugin is disabled
  onDisable?(): Promise<void>;
  
  // Called when plugin is uninstalled
  onUninstall?(): Promise<void>;
  
  // Called when plugin config changes
  onConfigChange?(newConfig: Record<string, unknown>): Promise<void>;
  
  // Called when platform is ready
  onReady?(): Promise<void>;
}

// =============================================================================
// CARD GENERATION PLUGIN INTERFACE
// =============================================================================

/**
 * Interface for card generation plugins
 * These convert various file formats into flashcards
 */
export interface CardGenerationPlugin extends PluginLifecycle {
  readonly type: 'card_generation';
  
  // Supported input formats
  readonly supportedFormats: readonly string[];  // e.g., ['pdf', 'md', 'docx']
  readonly maxFileSize: number;                  // Bytes
  
  /**
   * Parse a file and extract card candidates
   * Returns structured data that user can review/edit before creating cards
   */
  parseFile(input: FileInput): Promise<ParsedContent>;
  
  /**
   * Generate cards from parsed content
   * User has reviewed and approved the parsed content
   */
  generateCards(
    content: ParsedContent,
    options: CardGenerationOptions
  ): Promise<GeneratedCard[]>;
  
  /**
   * Validate generated cards before saving
   */
  validateCards(cards: GeneratedCard[]): Promise<ValidationResult>;
}

/**
 * Input for file parsing
 */
export interface FileInput {
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly content: ArrayBuffer | string;       // Binary or text
  readonly metadata?: Record<string, unknown>;
}

/**
 * Parsed content from a file
 */
export interface ParsedContent {
  readonly sourceFile: string;
  readonly format: string;
  readonly extractedAt: Date;
  
  // Structured content
  readonly title: string | null;
  readonly sections: readonly ContentSection[];
  readonly entities: readonly ExtractedEntity[];
  readonly relationships: readonly ExtractedRelationship[];
  
  // Card suggestions
  readonly suggestedCards: readonly CardSuggestion[];
  
  // Metadata
  readonly pageCount: number | null;
  readonly wordCount: number;
  readonly language: string | null;
}

/**
 * A section of content from the source
 */
export interface ContentSection {
  readonly id: string;
  readonly title: string | null;
  readonly content: string;
  readonly level: number;                       // Heading level
  readonly pageNumber: number | null;
  readonly children: readonly ContentSection[];
}

/**
 * Entity extracted from content (for knowledge graph)
 */
export interface ExtractedEntity {
  readonly id: string;
  readonly text: string;
  readonly type: 'concept' | 'term' | 'person' | 'place' | 'date' | 'other';
  readonly occurrences: number;
  readonly definitions: readonly string[];
}

/**
 * Relationship between entities
 */
export interface ExtractedRelationship {
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly type: string;
  readonly confidence: number;
}

/**
 * Suggested card from parsed content
 */
export interface CardSuggestion {
  readonly id: string;
  readonly type: string;                        // Card type
  readonly front: string;
  readonly back: string;
  readonly source: {
    readonly sectionId: string;
    readonly pageNumber: number | null;
    readonly excerpt: string;
  };
  readonly confidence: number;                  // How confident in quality
  readonly tags: readonly string[];
}

/**
 * Options for card generation
 */
export interface CardGenerationOptions {
  readonly targetDeckId: DeckId;
  readonly cardTypes: readonly string[];        // Which types to generate
  readonly maxCards: number | null;
  readonly language: string;
  readonly generateBidirectional: boolean;
  readonly generateCloze: boolean;
  readonly aiEnhance: boolean;                  // Use AI for better cards
}

/**
 * A generated card ready to save
 */
export interface GeneratedCard {
  readonly tempId: string;
  readonly content: CardContent;
  readonly tags: readonly string[];
  readonly sourceInfo: {
    readonly pluginId: PluginId;
    readonly sourceFile: string;
    readonly sourceLocation: string;
  };
  readonly confidence: number;
  readonly needsReview: boolean;
}

/**
 * Validation result for generated cards
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
  readonly warnings: readonly ValidationWarning[];
}

/**
 * Validation error
 */
export interface ValidationError {
  readonly cardId: string;
  readonly field: string;
  readonly message: string;
  readonly code: string;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  readonly cardId: string;
  readonly message: string;
  readonly suggestion: string | null;
}

// =============================================================================
// SCHEDULING PLUGIN INTERFACE
// =============================================================================

/**
 * Interface for custom scheduling plugins
 * Allows implementing new SRS algorithms
 */
export interface SchedulingPlugin extends PluginLifecycle {
  readonly type: 'scheduling';
  
  // Algorithm metadata
  readonly algorithmName: string;
  readonly algorithmVersion: string;
  readonly researchBasis: string | null;        // Paper citation
  
  /**
   * Initialize algorithm state for a new card
   */
  initializeCard(card: Card): Promise<Record<string, unknown>>;
  
  /**
   * Calculate scheduling for all rating options
   */
  schedule(
    card: Card,
    context: SchedulingContext
  ): Promise<SchedulingResult>;
  
  /**
   * Update card state after a review
   */
  updateAfterReview(
    card: Card,
    rating: string,
    responseTime: number
  ): Promise<{
    newState: Record<string, unknown>;
    nextDue: Date;
    interval: number;
  }>;
  
  /**
   * Optimize algorithm parameters from review history
   * Returns new optimized parameters
   */
  optimizeParameters?(
    reviewHistory: readonly ReviewHistoryItem[]
  ): Promise<Record<string, unknown>>;
}

/**
 * Review history item for optimization
 */
export interface ReviewHistoryItem {
  readonly cardId: CardId;
  readonly timestamp: Date;
  readonly rating: string;
  readonly responseTime: number;
  readonly previousInterval: number;
  readonly previousStability: number;
}

// =============================================================================
// SCORING PLUGIN INTERFACE
// =============================================================================

/**
 * Interface for scoring/feedback plugins
 * Grade responses beyond simple right/wrong
 */
export interface ScoringPlugin extends PluginLifecycle {
  readonly type: 'scoring';
  
  // Supported response types
  readonly supportedResponseTypes: readonly string[];
  
  /**
   * Score a user response
   */
  scoreResponse(input: ScoringInput): Promise<ScoringResult>;
  
  /**
   * Provide detailed feedback on response
   */
  provideFeedback(input: ScoringInput): Promise<FeedbackResult>;
}

/**
 * Input for scoring
 */
export interface ScoringInput {
  readonly cardId: CardId;
  readonly expectedAnswer: string;
  readonly userResponse: string | ArrayBuffer;  // Text or audio
  readonly responseType: 'text' | 'audio' | 'selection';
  readonly cardType: string;
  readonly context?: Record<string, unknown>;
}

/**
 * Scoring result
 */
export interface ScoringResult {
  readonly score: number;                       // 0-1
  readonly isCorrect: boolean;
  readonly partialCredit: boolean;
  readonly confidence: number;
  readonly details: Record<string, unknown>;
}

/**
 * Feedback for user
 */
export interface FeedbackResult {
  readonly summary: string;
  readonly corrections: readonly Correction[];
  readonly suggestions: readonly string[];
  readonly encouragement: string | null;
}

/**
 * A specific correction
 */
export interface Correction {
  readonly type: string;
  readonly expected: string;
  readonly actual: string;
  readonly explanation: string;
}

// =============================================================================
// VISUALIZATION PLUGIN INTERFACE
// =============================================================================

/**
 * Interface for visualization plugins
 * Render knowledge graphs, charts, decay curves
 */
export interface VisualizationPlugin extends PluginLifecycle {
  readonly type: 'visualization';
  
  // Supported visualization types
  readonly visualizationTypes: readonly string[];
  
  /**
   * Generate visualization data
   */
  generateVisualization(
    type: string,
    data: VisualizationInput
  ): Promise<VisualizationOutput>;
  
  /**
   * Get UI component for rendering
   */
  getRenderer(type: string): VisualizationRenderer;
}

/**
 * Input data for visualization
 */
export interface VisualizationInput {
  readonly userId: UserId;
  readonly deckIds?: readonly DeckId[];
  readonly cardIds?: readonly CardId[];
  readonly timeRange?: {
    readonly start: Date;
    readonly end: Date;
  };
  readonly options: Record<string, unknown>;
}

/**
 * Output from visualization generation
 */
export interface VisualizationOutput {
  readonly type: string;
  readonly data: unknown;                       // Visualization-specific data
  readonly metadata: {
    readonly generatedAt: Date;
    readonly dataPoints: number;
  };
}

/**
 * Renderer interface for visualization
 */
export interface VisualizationRenderer {
  // React component or similar
  render(data: VisualizationOutput, container: HTMLElement): void;
  update(data: VisualizationOutput): void;
  destroy(): void;
}

// =============================================================================
// META-LEARNING PLUGIN INTERFACE
// =============================================================================

/**
 * Interface for meta-learning plugins
 * Analyze learning patterns and provide recommendations
 */
export interface MetaLearningPlugin extends PluginLifecycle {
  readonly type: 'meta_learning';
  
  /**
   * Analyze user's learning patterns
   */
  analyzePatterns(userId: UserId): Promise<LearningPatternAnalysis>;
  
  /**
   * Generate personalized recommendations
   */
  generateRecommendations(
    userId: UserId,
    analysis: LearningPatternAnalysis
  ): Promise<LearningRecommendation[]>;
  
  /**
   * Evaluate effectiveness of a strategy
   */
  evaluateStrategy(
    userId: UserId,
    strategyId: string,
    period: { start: Date; end: Date }
  ): Promise<StrategyEvaluation>;
}

/**
 * Analysis of learning patterns
 */
export interface LearningPatternAnalysis {
  readonly userId: UserId;
  readonly analyzedAt: Date;
  readonly period: { start: Date; end: Date };
  
  // Time patterns
  readonly optimalStudyTime: string;            // Best time of day
  readonly averageSessionLength: number;        // Minutes
  readonly studyFrequency: number;              // Sessions per week
  
  // Performance patterns
  readonly strengthAreas: readonly string[];    // Tags/decks user excels at
  readonly weaknessAreas: readonly string[];    // Areas needing work
  readonly forgettingPatterns: readonly ForgettingPattern[];
  
  // Strategy effectiveness
  readonly currentStrategies: readonly string[];
  readonly strategyEffectiveness: Record<string, number>;
  
  // Efficiency metrics
  readonly learningEfficiency: number;          // Cards learned per hour
  readonly retentionEfficiency: number;         // Retention per review
}

/**
 * Pattern of forgetting
 */
export interface ForgettingPattern {
  readonly pattern: string;                     // Description
  readonly frequency: number;
  readonly affectedCards: number;
  readonly suggestedIntervention: string;
}

/**
 * Learning recommendation
 */
export interface LearningRecommendation {
  readonly id: string;
  readonly type: 'strategy' | 'schedule' | 'content' | 'behavior';
  readonly priority: 'high' | 'medium' | 'low';
  readonly title: string;
  readonly description: string;
  readonly rationale: string;                   // Why this is recommended
  readonly expectedImpact: string;
  readonly actions: readonly string[];
}

/**
 * Evaluation of a learning strategy
 */
export interface StrategyEvaluation {
  readonly strategyId: string;
  readonly period: { start: Date; end: Date };
  readonly effectiveness: number;               // 0-1
  readonly metrics: {
    readonly retentionBefore: number;
    readonly retentionAfter: number;
    readonly efficiencyBefore: number;
    readonly efficiencyAfter: number;
  };
  readonly verdict: 'highly_effective' | 'effective' | 'neutral' | 'ineffective';
  readonly shouldContinue: boolean;
}

// =============================================================================
// PLUGIN REGISTRY & API
// =============================================================================

/**
 * Plugin registry for managing installed plugins
 */
export interface PluginRegistry {
  // Query plugins
  getAll(): readonly InstalledPlugin[];
  getById(id: PluginId): InstalledPlugin | null;
  getByCategory(category: PluginCategory): readonly InstalledPlugin[];
  getByCapability(capability: PluginCapability): readonly InstalledPlugin[];
  
  // Lifecycle
  install(manifest: PluginManifest, code: string): Promise<InstalledPlugin>;
  uninstall(id: PluginId): Promise<void>;
  enable(id: PluginId): Promise<void>;
  disable(id: PluginId): Promise<void>;
  update(id: PluginId, newVersion: string): Promise<InstalledPlugin>;
  
  // Configuration
  getConfig(id: PluginId): Record<string, unknown>;
  setConfig(id: PluginId, config: Record<string, unknown>): Promise<void>;
}

/**
 * API available to plugins
 */
export interface PluginAPI {
  // Data access
  readonly cards: CardAPI;
  readonly decks: DeckAPI;
  readonly reviews: ReviewAPI;
  readonly user: UserAPI;
  
  // Utilities
  readonly storage: StorageAPI;
  readonly network: NetworkAPI;
  readonly ui: UIAPI;
  readonly ai: AIAPI;
  
  // Events
  readonly events: EventAPI;
}

// Placeholder interfaces for plugin API
export interface CardAPI {
  getById(id: CardId): Promise<Card | null>;
  query(filter: unknown): Promise<Card[]>;
  create(card: Partial<Card>): Promise<Card>;
  update(id: CardId, changes: Partial<Card>): Promise<Card>;
  delete(id: CardId): Promise<void>;
}

export interface DeckAPI {
  getById(id: DeckId): Promise<unknown>;
  query(filter: unknown): Promise<unknown[]>;
  create(deck: unknown): Promise<unknown>;
  update(id: DeckId, changes: unknown): Promise<unknown>;
  delete(id: DeckId): Promise<void>;
}

export interface ReviewAPI {
  getHistory(cardId: CardId): Promise<unknown[]>;
  record(review: unknown): Promise<void>;
}

export interface UserAPI {
  getCurrent(): Promise<unknown>;
  getPreferences(): Promise<unknown>;
  updatePreferences(prefs: unknown): Promise<void>;
}

export interface StorageAPI {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;
}

export interface NetworkAPI {
  fetch(url: string, options?: unknown): Promise<unknown>;
}

export interface UIAPI {
  showToast(message: string, type?: string): void;
  showModal(config: unknown): Promise<unknown>;
  registerComponent(name: string, component: unknown): void;
}

export interface AIAPI {
  embed(text: string): Promise<number[]>;
  complete(prompt: string, options?: unknown): Promise<string>;
  similarity(a: string, b: string): Promise<number>;
}

export interface EventAPI {
  on(event: string, handler: (data: unknown) => void): void;
  off(event: string, handler: (data: unknown) => void): void;
  emit(event: string, data: unknown): void;
}
