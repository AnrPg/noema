// =============================================================================
// TYPES INDEX - Re-export all types from a single entry point

// User & Authentication types
export type {
  UserId,
  DeckId,
  CardId,
  ReviewId,
  PluginId,
  AchievementId,
  SessionId,
  TagId,
  AuthProvider,
  SubscriptionTier,
  UserPreferences,
  ImportPreferences,
  User,
  UserLearningStats,
} from "./user.types";

// Card types - The heart of the system
export type {
  CardType,
  AtomicCardContent,
  ClozeCardContent,
  ClozeItem,
  ImageOcclusionContent,
  OcclusionRegion,
  ImageLabel,
  OcclusionLayer,
  AudioCardContent,
  ProcessCardContent,
  ProcessStep,
  ComparisonCardContent,
  ComparisonItem,
  ComparisonFeature,
  HiddenCell,
  ExceptionCardContent,
  ExceptionItem,
  ErrorSpottingContent,
  ErrorItem,
  ConfidenceCardContent,
  ConfidenceLevel,
  ConceptGraphContent,
  ConceptNode,
  ConceptRelation,
  RelationType,
  CaseBasedContent,
  CaseInfoItem,
  CaseOption,
  DecisionNode,
  MultimodalContent,
  MultimodalElement,
  ElementInteraction,
  TransferCardContent,
  TransferHint,
  ProgressiveDisclosureContent,
  ProgressiveLevel,
  RichText,
  MediaAttachment,
  MathBlock,
  CardContent,
  Card,
  CardSRSState,
  CardState,
  Rating,
  NumericRating,
  CardStats,
} from "./card.types";

// Re-export RatingValues constant and utilities
export { RatingValues, NumericToRating, toRating } from "./card.types";

// Deck & Organization types
export type {
  Deck,
  DeckSettings,
  DeckStats,
  DeckCollaborator,
  Tag,
  StudySession,
  SessionType,
  SessionSettings,
  ReviewRecord,
} from "./deck.types";

export { DEFAULT_DECK_SETTINGS, SYSTEM_TAGS } from "./deck.types";

// Scheduler & Algorithm types
export type {
  SchedulerType,
  BaseSchedulerConfig,
  FSRSConfig,
  FSRSWeights,
  HLRConfig,
  HLRFeatureWeights,
  SM2Config,
  LeitnerConfig,
  SchedulerConfig,
  SchedulingResult,
  SimpleSchedulingResult,
  IntervalPrediction,
  SchedulingContext,
  FatigueAdjustment,
} from "./scheduler.types";

export {
  DEFAULT_FSRS_WEIGHTS,
  DEFAULT_FSRS_CONFIG,
  DEFAULT_HLR_CONFIG,
  DEFAULT_SM2_CONFIG,
  DEFAULT_LEITNER_CONFIG,
  getDefaultSchedulerConfig,
} from "./scheduler.types";

// Gamification types
export type {
  XPConfig,
  Level,
  LevelPerk,
  StreakData,
  StreakMilestone,
  StreakReward,
  MemoryIntegrityScore,
  MemoryIntegritySnapshot,
  AchievementCategory,
  AchievementRarity,
  Achievement,
  AchievementRequirement,
  UserAchievement,
  MasteryBadge,
  MasteryLevel,
  CalibrationScore,
  CalibrationBucket,
  SkillTree,
  SkillNode,
  SkillEdge,
  ReflectionPrompt,
  ReflectionOption,
  ReflectionResponse,
  LearningStrategy,
  BurnoutIndicators,
  BurnoutIndicator,
  BurnoutRecommendation,
} from "./gamification.types";

export {
  DEFAULT_XP_CONFIG,
  MASTERY_REQUIREMENTS,
  LEARNING_STRATEGIES,
  BURNOUT_INDICATORS,
} from "./gamification.types";

// Plugin types
export type {
  PluginCategory,
  PluginCapability,
  PluginManifest,
  PluginAuthor,
  PluginPermission,
  PluginConfigSchema,
  PluginConfigProperty,
  InstalledPlugin,
  PluginLifecycle,
  CardGenerationPlugin,
  FileInput,
  ParsedContent,
  ContentSection,
  ExtractedEntity,
  ExtractedRelationship,
  CardSuggestion,
  CardGenerationOptions,
  GeneratedCard,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  SchedulingPlugin,
  ReviewHistoryItem,
  ScoringPlugin,
  ScoringInput,
  ScoringResult,
  FeedbackResult,
  Correction,
  VisualizationPlugin,
  VisualizationInput,
  VisualizationOutput,
  VisualizationRenderer,
  MetaLearningPlugin,
  LearningPatternAnalysis,
  ForgettingPattern,
  LearningRecommendation,
  StrategyEvaluation,
  PluginRegistry,
  PluginAPI,
  CardAPI,
  DeckAPI,
  ReviewAPI,
  UserAPI,
  StorageAPI,
  NetworkAPI,
  UIAPI,
  AIAPI,
  EventAPI,
} from "./plugin.types";

// API types
export type {
  APIResponse,
  APIError,
  APIMeta,
  PaginationParams,
  PaginatedResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  OAuthLoginRequest,
  RefreshTokenRequest,
  PasswordResetRequest,
  UserDTO,
  UserStatsDTO,
  UpdateProfileRequest,
  UpdatePreferencesRequest,
  DeckDTO,
  DeckStatsDTO,
  CreateDeckRequest,
  UpdateDeckRequest,
  UpdateDeckSettingsRequest,
  CardSummaryDTO,
  CardDTO,
  CardSRSStateDTO,
  CardStatsDTO,
  CreateCardRequest,
  BulkCreateCardsRequest,
  UpdateCardRequest,
  CardFilter,
  StartSessionRequest,
  SessionSettingsDTO,
  StudySessionDTO,
  NextCardResponse,
  SchedulingOptionsDTO,
  IntervalOptionDTO,
  SessionProgressDTO,
  SubmitReviewRequest,
  SubmitReviewResponse,
  EndSessionRequest,
  EndSessionResponse,
  SessionSummaryDTO,
  AchievementDTO,
  ImportRequest,
  ImportOptions,
  ImportProgressDTO,
  ExportRequest,
  ExportResponse,
  SyncRequest,
  // SyncChange - using sync.types version
  SyncResponse,
  // SyncConflict - using sync.types version
  AnalyticsTimeRange,
  StudyAnalyticsDTO,
  DailyStatsDTO,
  DeckAnalyticsDTO,
  RetentionDataPoint,
  HeatmapDataPoint,
  WSEventType,
  WSMessage,
} from "./api.types";

// Settings types - Professional-grade settings system
export type {
  SettingsId,
  ConfigSnapshotId,
  ConfigChangeId,
  LKGCId,
  PluginSettingsId,
  ReviewOrder,
  NewCardPosition,
  LeechAction,
  SettingsScope,
  SettingsScopeContext,
  ScopeMetadata,
  SettingExplanation,
  OptionExplanation,
  SettingMetadata,
  SettingType,
  SettingValidation,
  SettingsCategory,
  CategoryMetadata,
  // SchedulerType is exported from scheduler.types.ts above
  FSRSParameters,
  StudySettings,
  ThemeMode,
  FontSize,
  FontFamily,
  CardAnimation,
  DisplaySettings,
  HapticIntensity,
  AutoplaySpeed,
  AudioSettings,
  EmailDigestFrequency,
  NotificationSettings,
  PrivacySettings,
  SyncFrequency,
  ConflictResolution,
  SyncSettings,
  AccessibilitySettings,
  AISettings,
  ExportFormat,
  AdvancedSettings,
  PluginSettingsSection,
  PluginSettingsInjection,
  SettingsState,
  ScopedSettings,
  ConfigChangeSource,
  ConfigChange,
  ConfigCheckpoint,
  CheckpointChangesSummary,
  CategoryChangeSummary,
  LKGCAutoCriteria,
  LKGCEntry,
  LKGCPerformanceSnapshot,
  LKGCSuggestion,
  EffectiveSettings,
  SettingsConflict,
  SettingsActions,
} from "./settings.types";

export {
  DEFAULT_FSRS_PARAMETERS,
  DEFAULT_LKGC_CRITERIA,
} from "./settings.types";

// Settings metadata with explanations
export {
  CATEGORY_METADATA,
  STUDY_SETTINGS_METADATA,
  DISPLAY_SETTINGS_METADATA,
  AUDIO_SETTINGS_METADATA,
  NOTIFICATION_SETTINGS_METADATA,
  PRIVACY_SETTINGS_METADATA,
  SYNC_SETTINGS_METADATA,
  ACCESSIBILITY_SETTINGS_METADATA,
  AI_SETTINGS_METADATA,
  ADVANCED_SETTINGS_METADATA,
  // Keyed metadata for easy access
  STUDY_METADATA,
  DISPLAY_METADATA,
  AUDIO_METADATA,
  NOTIFICATION_METADATA,
  PRIVACY_METADATA,
  SYNC_METADATA,
  ACCESSIBILITY_METADATA,
  AI_METADATA,
  ADVANCED_METADATA,
  getSettingMetadata,
} from "./settings-metadata";

// =============================================================================
// LKGC - Local Knowledge Graph Controller Domain Model
// =============================================================================
// Core domain model for the cognitive substrate that powers learning.
// LKGC is NOT a database - it's a typed property graph with explicit
// provenance, privacy, sync, and explainability built-in.

// Foundation types (identity, provenance, privacy, sync)
export type {
  EntityId,
  DeviceId,
  UserId as LKGCUserId,
  SessionId as LKGCSessionId,
  NodeId,
  EdgeId,
  EventId,
  ProposalId,
  SnapshotId,
  RevisionNumber,
  Confidence,
  Probability,
  Timestamp,
  Duration,
  DataSource,
  Provenance,
  PrivacyLevel,
  TelemetryConsent,
  PrivacyScope,
  MergeStrategy,
  // SyncState - using sync.types version
  ConflictState,
  LKGCEntity,
  NormalizedValue,
  BipolarScore,
  Percentage,
} from "./lkgc/foundation";

export {
  DEFAULT_TELEMETRY_CONSENT,
  DEFAULT_PRIVACY_SCOPE,
} from "./lkgc/foundation";

// Node types (knowledge graph vertices)
export type {
  NodeType,
  BaseNode,
  MediaType,
  CardNode,
  ContentBlock,
  CardModel,
  SchedulingState,
  NoteNode,
  ConceptNode as LKGCConceptNode,
  TermNode,
  FactNode,
  FormulaNode,
  FormulaVariable,
  ProcedureNode,
  ProcedureStep,
  ExampleNode,
  CounterexampleNode,
  QuestionNode,
  ResourceNode,
  ResourceHighlight,
  ChunkNode,
  GoalNode,
  GoalTarget,
  LearningPathNode,
  LearningPathStep,
  MilestoneNode,
  MilestoneCriterion,
  AssessmentNode,
  AssessmentItem,
  AssessmentAttempt,
  AssessmentAnswer,
  RubricNode,
  RubricCriterion,
  RubricLevel,
  StrategyNode,
  ReflectionNode,
  ReflectionContent,
  PredictionNode,
  ErrorPatternNode,
  QuestNode,
  QuestObjective,
  QuestRequirements,
  ChallengeNode,
  BadgeNode,
  StreakRuleNode,
  StreakRequirement,
  BossNode,
  BossPhase,
  RewardNode,
  RewardContent,
  PluginModuleNode,
  PluginCapability as LKGCPluginCapability,
  ExperimentNode,
  ExperimentVariant,
  ExperimentResults,
  NotificationTemplateNode,
  NotificationTrigger,
  LKGCNode,
  NodeOfType,
} from "./lkgc/nodes";

export { isNodeType } from "./lkgc/nodes";

// Edge types (knowledge graph relationships)
export type {
  EdgeType,
  EdgePolarity,
  BaseEdge,
  PrerequisiteOfEdge,
  PartOfEdge,
  ExplainsEdge,
  CausesEdge,
  AnalogousToEdge,
  ExampleOfEdge,
  CounterexampleOfEdge,
  DerivedFromEdge,
  DefinesEdge,
  UsesEdge,
  ContrastsWithEdge,
  ContrastDifference,
  TargetsGoalEdge,
  IntroducedInPathStepEdge,
  AssessedByEdge,
  PracticedByEdge,
  BestLearnedWithStrategyEdge,
  ErrorPatternForEdge,
  ReflectionAboutEdge,
  FrequentlyConfusedWithEdge,
  CrossDeckDuplicateOfEdge,
  MentionsEdge,
  BacklinkEdge,
  LKGCEdge,
  EdgeOfType,
  EdgeDirection,
  EdgeQueryPredicate,
} from "./lkgc/edges";

export { isEdgeType } from "./lkgc/edges";

// Mastery state (multi-dimensional learning state)
export type {
  MasteryGranularity,
  MasteryState,
  MemoryState,
  EvidenceAggregate,
  ReviewOutcomeCounts,
  TimeOfDay,
  MetacognitionState,
  MasteryCalibration,
  StrategyUsageMetrics,
  MasterySelfRegulation,
  ReflectionMetrics as MasteryReflectionMetrics,
  ForgettingState,
  GeneralizationState,
  CognitiveLoadState,
  AffectState,
  AffectiveMetric,
  TrustState,
  MasteryStateDelta,
  MasteryUpdateReason,
  MasterySnapshot,
  MasteryFeatureVector,
  RecentHistorySummary,
  PeriodSummary,
  RelatedNodeSummary,
} from "./lkgc/mastery";

// Session & timeline (learning as a process)
export type {
  SessionMode,
  SessionGoalType,
  StudySession as LKGCStudySession,
  ReviewAttemptId,
  SessionGoal,
  SessionPause,
  SessionInterruption,
  PacingProfile,
  SessionStatistics,
  MoodCapture,
  EnvironmentContext,
  ReviewRating,
  ReviewAttempt,
  ReviewTiming,
  ReviewResponse,
  AnswerChange,
  ReviewEdit,
  HintUsage,
  HintReveal,
  ReviewInteraction,
  ScrollingBehavior,
  TouchPatterns,
  PreReviewState,
  PostReviewState,
  ReviewMetacognition,
  ReflectionArtifact,
  ReflectionStructuredContent,
  PlannedAdjustment,
  ReflectionQualityAssessment,
  ReflectionInsight,
  ActionItem,
  TimelineEntry,
  TimelineEntryType,
} from "./lkgc/session";

// Events (strict event taxonomy)
export type {
  EventCategory,
  BaseEvent,
  ReviewPerformanceEventType,
  ReviewStartedEvent,
  ReviewCompletedEvent,
  AnswerRevealedEvent,
  HintRequestedEvent,
  AnswerChangedEvent,
  CardEditedEvent,
  CardSuspendedEvent,
  CardFlaggedEvent,
  MetacognitiveEventType,
  ConfidenceReportedEvent,
  RecallForecastEvent,
  FeelingOfKnowingEvent,
  ErrorAttributionEvent,
  StrategySelectedEvent,
  EffortReportedEvent,
  ReflectionSubmittedEvent,
  AttentionEventType,
  IdleDetectedEvent,
  AppBackgroundedEvent,
  AppForegroundedEvent,
  NotificationReceivedEvent,
  DeckSwitchedEvent,
  ScrollActivityEvent,
  RapidFailDetectedEvent,
  GraphExploredEvent,
  SpeedrunDetectedEvent,
  StallDetectedEvent,
  GamificationEventType,
  QuestAcceptedEvent,
  QuestCompletedEvent,
  QuestAbandonedEvent,
  ChallengeStartedEvent,
  ChallengeCompletedEvent,
  ChallengeFailedEvent,
  BadgeEarnedEvent,
  StreakExtendedEvent,
  StreakBrokenEvent,
  StreakFrozenEvent,
  BossAttemptedEvent,
  BossDefeatedEvent,
  BossFailedEvent,
  RewardClaimedEvent,
  LevelUpEvent,
  XpGainedEvent,
  ContentEventType,
  ImportStartedEvent,
  ImportCompletedEvent,
  ImportFailedEvent,
  DuplicateMergedEvent,
  TagEditedEvent,
  LinkCreatedEvent,
  LinkDeletedEvent,
  NodeCreatedEvent,
  NodeUpdatedEvent,
  NodeDeletedEvent,
  EnvironmentEventType,
  SessionEnvironmentCapturedEvent,
  ConnectivityChangedEvent,
  TimeZoneChangedEvent,
  DeviceChangedEvent,
  ReviewPerformanceEvent,
  MetacognitiveEvent,
  AttentionEvent,
  GamificationEvent,
  ContentEvent,
  EnvironmentEvent,
  LKGCEvent,
} from "./lkgc/events";

export { isEventCategory } from "./lkgc/events";

// Aggregation pipeline
export type {
  RawEventEntry,
  EventBatch,
  FeatureGranularity,
  BaseDerivedFeature,
  AttemptFeatures,
  SessionFeatures,
  DailyFeatures,
  WeeklyFeatures,
  DerivedFeature,
  StateUpdateBatch,
  StateTransition,
  StateTransitionCause,
  AISnapshot,
  SnapshotPurpose,
  GlobalFeatures,
  PendingDecision,
  AIProposal,
  ProposalType,
  ProposalStatus,
  ProposalContent,
  SchedulingProposal,
  DifficultyAdjustmentProposal,
  CoachingInterventionProposal,
  GamificationTriggerProposal,
  ContentSuggestionProposal,
  StrategyRecommendationProposal,
  GoalAdjustmentProposal,
  DecisionRationale,
  FeatureContribution,
  Counterfactual,
  UserProposalResponse,
  ProposalApplicationResult,
  AuditedChange,
  ChangeInitiator,
  AffectedEntity,
  FieldChange,
  RollbackInfo,
  AggregationPipelineConfig,
} from "./lkgc/aggregation";

// Explainability artifacts
export type {
  DecisionRationaleRecord,
  DecisionType,
  FeatureAnalysis,
  FeatureDetail,
  FeatureInteraction,
  ModelInfo,
  CounterfactualAnalysis,
  RequiredChange,
  RationaleSummary,
  UncertaintyAnalysis,
  UncertaintySource,
  UncertaintyReductionStrategy,
  CoachingInterventionRecord,
  InterventionType,
  TriggerCondition,
  InterventionContent,
  RelatedLink,
  PersonalizationInfo,
  UserInteractionRecord,
  UserFeedback,
  InterventionEffect,
  InterventionMetrics,
  InterventionUplift,
  ExplanationTemplate,
  PlaceholderDefinition,
  TemplateCondition,
  GeneratedInsight,
  InsightType,
  InsightContent,
  InsightVisualization,
  InsightEvidence,
  EvidenceItem,
  InsightActionability,
  SuggestedAction,
  ExplanationAudit,
  ExplanationQualityMetrics,
  ExplanationFeedback,
} from "./lkgc/explainability";

// Meta-learning metrics
export type {
  MetricsCollection,
  MetricsPeriod,
  MetricsHealth,
  MetricWarning,
  CalibrationMetrics,
  BrierScoreMetric,
  ECEMetric,
  CalibrationBin,
  CalibrationBiasMetric,
  ResolutionMetric,
  MetacognitiveSensitivityMetric,
  DunningKrugerMetric,
  CorrelationMetric,
  CalibrationByDifficulty,
  EfficiencyMetrics,
  StabilityTrendMetric,
  ForgettingCurveFitMetric,
  IntervalFitError,
  TimeToMasteryMetric,
  HintDependencyMetric,
  SpacingQualityMetric,
  InterferenceMetric,
  ConfusionPair,
  ReviewEfficiencyMetric,
  RetentionRateMetric,
  LapseRateMetric,
  StrategyMetrics,
  StrategyDiversityMetric,
  StrategyAdherenceMetric,
  StrategyEfficacyMetric,
  StrategyEffectiveness,
  ReflectionCompletionMetric,
  ReflectionQualityMetric,
  PlanFollowThroughMetric,
  StrategySelectionMetric,
  SelfRegulationMetrics,
  SessionConsistencyMetric,
  FatigueIndexMetric,
  FlowProxyMetric,
  FrictionScoreMetric,
  StreakHealthMetric,
  GoalAlignmentMetric,
  ProcrastinationMetric,
  SelfEfficacyMetric,
  TransferMetrics,
  GeneralizationScoreMetric,
  ConceptCoverageMetric,
  ErrorPatternMetric,
  ExplanationQualityMetric,
  CrossContextMetric,
  AnalogicalReasoningMetric,
  IntegrationScoreMetric,
  MetricsQuery,
  MetricCategory,
  MetricsComparison,
  MetricsChanges,
  MetricChange,
  MetricThresholds,
} from "./lkgc/metrics";

export { DEFAULT_METRIC_THRESHOLDS } from "./lkgc/metrics";

// Knowledge Ecosystem types
export type {
  // Core identifiers
  CategoryId,
  CategoryRelationId,
  ParticipationId,
  DynamicDeckId,
  AnnotationId,
  EmphasisRuleId,
  ContextPerformanceId,
  // Category types
  LearningIntent,
  DepthGoal,
  MaturityStage,
  SemanticIntent,
  InterpretationPriority,
  Category,
  CategoryWithChildren,
  CategoryWithRelations,
  CategorySummary,
  // Relationship types
  CategoryRelationType,
  CategoryRelation,
  CategoryRelationWithCategories,
  // Participation types
  SemanticRole,
  CardCategoryParticipation,
  ParticipationWithCategory,
  ParticipationWithCard,
  // Context faces
  CardContextFace,
  // Lens-based types
  ContextualAnnotation,
  AnnotationType,
  EmphasisRule,
  EmphasisRuleType,
  // Learning modes
  LearningMode,
  ViewLens,
  CategoryModeType,
  QuestionStyle,
  CategoryLearningMode,
  UserLearningFlow,
  // Dynamic decks
  DynamicDeckQueryType,
  DynamicDeckSortBy,
  DynamicDeck,
  // Evolution
  EvolutionEventType,
  CategoryEvolutionEvent,
  // Suggestions
  SuggestionStatus,
  CategorySuggestion,
  // API Input/Output
  CreateCategoryInput,
  UpdateCategoryInput,
  MoveCategoryInput,
  SplitCategoryInput,
  MergeCategoriesInput,
  CreateCategoryRelationInput,
  AddCardToCategoryInput,
  BulkAddCardsToCategoryInput,
  CreateContextFaceInput,
  CreateDynamicDeckInput,
  UpdateLearningFlowInput,
  RespondToSuggestionInput,
  CreateAnnotationInput,
  UpdateAnnotationInput,
  CreateEmphasisRuleInput,
  UpdateEmphasisRuleInput,
  // Graph visualization
  CategoryGraphNode,
  CategoryGraphEdge,
  CategoryGraph,
  TerritoryRegion,
  // Study flow
  EcosystemStudyContext,
  CardPresentationContext,
  // =========================================================================
  // STRUCTURAL REFACTORING - Subcategories as Cognitive Refinement
  // =========================================================================
  // Refactor types
  StructuralRefactorType,
  RefactorOperationStatus,
  RefactorConflictSeverity,
  RefactorAISuggestionSource,
  // Split operation
  SplitChildDefinition,
  SplitDistinctionArticulation,
  SplitCategoryResult,
  SplitAIAnalysis,
  // Merge operation
  MergeCategoriesResult,
  MergeAIValidation,
  // Move operation
  MoveCategoryResult,
  // Structural history
  StructuralRefactorEvent,
  RefactorConflictInfo,
  RefactorConflictResolution,
  RefactorConflictAction,
  // Snapshots & diffs
  StructuralSnapshot,
  SnapshotCategoryNode,
  SnapshotRelation,
  SnapshotParticipation,
  StructuralDiff,
  // Timeline
  RefactorTimelineEntry,
  RefactorTimelineQuery,
  // AI suggestions
  AISplitSuggestion,
  AIMergeSuggestion,
} from "./ecosystem.types";

// =============================================================================
// MULTI-BELONGING & CONCEPTUAL OVERLAP TYPES
// =============================================================================

export type {
  // Identifiers (ParticipationId already exported from ecosystem.types.ts)
  SynthesisPromptId,
  SynthesisResponseId,
  SynthesisNoteId,
  BridgeCardId,
  BridgeCardSuggestionId,
  CrossContextQuizId,
  PerformanceDivergenceId,
  // Enums & Type Unions
  ExtendedSemanticRole,
  ProvenanceType,
  SynthesisTriggerType,
  SynthesisPromptType,
  SynthesisPromptStatus,
  SynthesisNoteType,
  BridgeType,
  ConnectionType,
  BridgeSurfaceTrigger,
  BridgeCardStatus,
  CrossContextQuizType,
  DivergenceSeverity,
  DivergenceStatus,
  // Core Participation Model
  CardCategoryParticipation as MultiBelongingParticipation,
  ParticipationWithCategory as MultiBelongingParticipationWithCategory,
  ParticipationWithCard as MultiBelongingParticipationWithCard,
  FullParticipation,
  // Synthesis Engine
  SynthesisPrompt,
  SynthesisPromptWithContext,
  SynthesisResponse,
  SynthesisNote,
  // Bridge Cards
  BridgeCard,
  BridgeCardWithContext,
  BridgeCardSuggestion,
  // Cross-Context Quiz
  CrossContextQuiz,
  // Performance Divergence
  PerformanceDivergence,
  PerformanceDivergenceWithContext,
  // Card Presentation
  CardPresentationContext as MultiBelongingCardPresentationContext,
  // API Input Types
  AddParticipationInput,
  UpdateParticipationInput,
  BulkAddParticipationsInput,
  BulkUpdateParticipationsInput,
  RespondToSynthesisInput,
  CreateSynthesisNoteInput,
  CreateBridgeCardInput,
  AnswerCrossContextQuizInput,
  // Query Types
  ParticipationQueryOptions,
  BridgeCandidateQueryOptions,
  SynthesisPromptQueryOptions,
  // Analytics Types
  CardParticipationAnalytics,
  CategoryParticipationAnalytics,
  // Event Types
  MultiBelongingEvent,
  // Plugin Hooks
  ParticipationSuggestionProvider,
  SynthesisPromptGenerator,
  BridgeCardRecommender,
} from "./multi-belonging.types";

// =============================================================================
// ECOSYSTEM-LKGC BRIDGE TYPES
// =============================================================================

export type {
  // Identifiers
  EcosystemMappingId,
  SyncEventId,
  // Enums
  SyncDirection as EcosystemSyncDirection,
  MappingStatus,
  EcosystemSyncEventType,
  // Mappings
  CategoryToConceptMapping,
  CategoryRelationToEdgeMapping,
  ParticipationToEdgeMapping,
  // Context & Projection
  ContextReviewEventData,
  MasteryProjection,
  ActiveLensContext,
  // Sync Events
  EcosystemSyncEvent,
  // Configuration
  EcosystemBridgeConfig,
} from "./ecosystem-bridge.types";

export {
  // Constants
  CATEGORY_RELATION_TO_LKGC_EDGE,
  LKGC_EDGE_TO_CATEGORY_RELATION,
  ECOSYSTEM_SYNC_CONFIDENCE,
  DEFAULT_ACTIVE_LENS_CONTEXT,
  DEFAULT_BRIDGE_CONFIG,
} from "./ecosystem-bridge.types";

// =============================================================================
// OFFLINE-FIRST SYNC TYPES
// =============================================================================

export type {
  SyncId,
  ClientId,
  VectorClock,
  SyncEntityType,
  SyncOperation,
  SyncChange,
  ConflictHint,
  ConflictResolutionStrategy,
  SyncConflict,
  ConflictType,
  ConflictSeverity,
  ResolvedConflict,
  MergeDetails,
  DroppedChange,
  SyncSession,
  SyncStatus,
  SyncDirection,
  SyncStats,
  SyncError,
  SyncErrorCode,
  SyncPushRequest,
  SyncPushResponse,
  SyncPullRequest,
  SyncPullResponse,
  AcceptedChange,
  RejectedChange,
  DeletedEntity,
  DeviceInfo,
  SyncState,
  ClientSyncStatus,
  ChangeLogEntry,
  OfflineQueueEntry,
  OfflineOperation,
  OfflineQueueStatus,
  SyncConfig,
  SyncEventType,
  SyncEvent,
  SyncProgressEvent,
  SyncConflictEvent,
} from "./sync.types";

export {
  DEFAULT_SYNC_CONFIG,
  compareVersions,
  mergeVectorClocks,
  incrementVectorClock,
  generateChecksum,
} from "./sync.types";

// =============================================================================
// LEARNING MODE FRAMEWORK TYPES
// =============================================================================

export type {
  // Identifiers
  LearningModeId,
  ModeActivationId,
  ModeParameterSetId,
  ModeSessionId,
  ExplainabilityTraceId,
  NavigationSuggestionId,
  ReviewCandidateId,
  ModePluginId,
  // Mode Definition
  SystemModeType,
  ModeSource,
  ModeDefinition,
  // Parameters
  ModeParameterType,
  ModeParameterDefinition,
  ParameterRange,
  EnumOption,
  ModeParameterConstraints,
  ModeParameterSchema,
  ModeParameterUiGroup,
  CrossValidationRule,
  // Policies
  ModePolicyAffects,
  AffectedPolicies,
  LkgcSignalType,
  // UI
  ModeUiEmphasis,
  BipolarValue,
  ModeColorTheme,
  ModeCapability,
  // Activation & Persistence
  ModeActivationScope,
  ModeActivation,
  UserModePreferences,
  ModeParameterPreset,
  // Runtime
  ModeRuntimeState,
  ModeScopeContext,
  LkgcSignalSnapshot,
  LkgcSignalValue,
  // Explainability
  ExplainabilityTrace,
  ExplainabilitySubject,
  ExplainabilityFactor,
  ExplainabilitySuggestedAction,
  // Navigation (placeholder for Phase 5B)
  NavigationSuggestion,
  NavigationSuggestionType,
  NavigationTarget,
  // Review Candidates (placeholder for Phase 5B)
  ReviewCandidate,
  ReviewCandidateScoring,
  // Ranked Output
  RankedCandidateList,
  NewCardRecommendation,
  SynthesisOpportunity,
  MetacognitivePrompt,
  // Policy Interfaces
  NavigationPolicy,
  ReviewSelectionPolicy,
  CardOrderingPolicy,
  NewCardIntroductionPolicy,
  ReviewCandidateInput,
  ModePolicyContext,
  // Plugin
  ModePluginManifest,
  ModePolicyDeclaration,
  // Category Scheduling
  CategorySchedulingMetadata,
  DecayModelType,
} from "./learning-mode.types";

export {
  // Default Parameters
  DEFAULT_EXPLORATION_PARAMETERS,
  DEFAULT_GOAL_DRIVEN_PARAMETERS,
  DEFAULT_EXAM_ORIENTED_PARAMETERS,
  DEFAULT_SYNTHESIS_PARAMETERS,
  DEFAULT_CATEGORY_SCHEDULING_METADATA,
} from "./learning-mode.types";

// Branded type factories - Learning Mode identifiers
export {
  // Configuration
  DEFAULT_VALIDATION_CONFIG,
  STRICT_VALIDATION_CONFIG,
  // LearningModeId factories
  createLearningModeId,
  createSystemModeId,
  createPluginModeId,
  createCustomModeId,
  isLearningModeId,
  isSystemModeId,
  extractSystemModeType,
  // ModeActivationId factories
  createModeActivationId,
  generateModeActivationId,
  isModeActivationId,
  // ModeSessionId factories
  createModeSessionId,
  generateModeSessionId,
  isModeSessionId,
  // ModeParameterSetId factories
  createModeParameterSetId,
  generateModeParameterSetId,
  isModeParameterSetId,
  // ExplainabilityTraceId factories
  createExplainabilityTraceId,
  generateExplainabilityTraceId,
  isExplainabilityTraceId,
  // NavigationSuggestionId factories
  createNavigationSuggestionId,
  generateNavigationSuggestionId,
  isNavigationSuggestionId,
  // ReviewCandidateId factories
  createReviewCandidateId,
  generateReviewCandidateId,
  isReviewCandidateId,
  // ModePluginId factories
  createModePluginId,
  generateModePluginId,
  isModePluginId,
  // Foundation type factories
  createTimestamp,
  // Note: now() is exported from lkgc/id-generator.ts
  createNormalizedValue,
  createConfidence,
  // Batch conversion utilities
  batchCreateBrandedTypes,
  asReadonly,
  asMutable,
} from "./branded-type-factories";

export type { BrandedTypeValidationConfig } from "./branded-type-factories";

// =============================================================================
// NAVIGATION FEED TYPES (Phase 5B)
// =============================================================================

export type {
  // Identifiers
  NavigationFeedId,
  NeighborhoodNodeId,
  PrerequisitePathId,
  CoverageGapId,
  ConstellationChallengeId,
  // Request Types
  NavigationFeedRequest,
  NeighborhoodFeedOptions,
  PrerequisitePathOptions,
  CoverageFeedOptions,
  ConstellationChallengeOptions,
  // Neighborhood Feed
  NeighborhoodNode,
  NeighborhoodEdge,
  NeighborhoodFeed,
  NeighborhoodSuggestion,
  NeighborhoodSuggestionFactors,
  NeighborhoodVisualizationData,
  // Prerequisite Path Feed
  PrerequisiteNode,
  PrerequisitePath,
  PrerequisiteEdge,
  PrerequisiteGap,
  PrerequisitePathFeed,
  PrerequisiteSuggestion,
  GapSeverity,
  // Coverage Feed
  CategoryCoverage,
  CoverageGap,
  CoverageSummary,
  CoverageFeed,
  CoverageSuggestion,
  CoverageGapType,
  // Constellation Challenge Feed
  Constellation,
  ConstellationType,
  ConstellationChallenge,
  ConstellationChallengeType,
  BridgeOpportunity,
  ConstellationChallengeFeed,
  ConstellationSuggestion,
  PerformanceDivergenceSummary,
  // Unified Feed
  UnifiedNavigationFeed,
  NavigationSuggestionUnion,
  NavigationFeedContext,
  NavigationFeedMetadata,
  // Generator Interfaces
  NeighborhoodFeedGenerator,
  PrerequisitePathFeedGenerator,
  CoverageFeedGenerator,
  ConstellationChallengeFeedGenerator,
  NavigationFeedService,
  // Configuration
  ModeFeedConfiguration,
  NavigationFeedType,
} from "./navigation-feed.types";

export {
  // Mode Feed Configurations
  EXPLORATION_FEED_CONFIG,
  GOAL_DRIVEN_FEED_CONFIG,
  EXAM_ORIENTED_FEED_CONFIG,
  SYNTHESIS_FEED_CONFIG,
  MODE_FEED_CONFIGS,
} from "./navigation-feed.types";

// =============================================================================
// REVIEW POLICY TYPES (Policy-Based Review Planner)
// =============================================================================

export type {
  // Identifiers
  ReviewPolicyId,
  PolicyChainId,
  RankingFactorId,
  // Candidate Types
  SchedulerCandidateOutput,
  CategoryMetadataForPolicy,
  PolicyRankedCandidate,
  CandidateRanking,
  UrgencyLevel,
  ReviewRecommendation,
  // Ranking Factors
  RankingFactor,
  RankingFactorSource,
  PolicyContribution,
  // Policy Interface
  ReviewPolicy,
  ReviewPolicyType,
  PolicyExecutionContext,
  PolicyFactorResult,
  PolicyWeights,
  PolicyValidationResult,
  // Policy Composition
  PolicyCompositionChain,
  ComposedPolicyEntry,
  AggregationStrategy,
  NormalizationStrategy,
  // Policy Configurations
  BaseUrgencyPolicyConfig,
  ModeModifierPolicyConfig,
  CategoryHookPolicyConfig,
  ExamCramPolicyConfig,
  ExplorationPolicyConfig,
  // Execution Result
  PolicyExecutionResult,
  PolicyExecutionMetadata,
  PolicyExplainabilitySummary,
  // Request/Response
  ReviewPlannerRequest,
  ReviewPlannerResponse,
  SessionRecommendations,
  // Registry
  PolicyRegistryEntry,
  PolicyRegistry,
} from "./review-policy.types";

export {
  // Default Configurations
  DEFAULT_BASE_URGENCY_CONFIG,
  DEFAULT_EXPLORATION_CONFIG,
  DEFAULT_EXAM_CRAM_CONFIG,
  DEFAULT_GOAL_DRIVEN_CONFIG,
  DEFAULT_SYNTHESIS_CONFIG,
} from "./review-policy.types";

// =============================================================================
// CANONICAL CARD & FACE SYSTEM (Phase 6A)
// =============================================================================
// Multi-faceted cards with context-sensitive faces

export type {
  // Identifiers
  CanonicalCardId,
  CardFaceId,
  FaceApplicabilityRuleId,
  ContentPrimitiveId,
  FaceVersionId,
  // Content Primitives
  ContentPrimitiveType,
  ContentPrimitiveBase,
  TextPrimitive,
  MarkdownPrimitive,
  LatexPrimitive,
  CodePrimitive,
  ImagePrimitive,
  ImageRegion,
  AudioPrimitive,
  AudioSegment,
  ClozeRegionPrimitive,
  ClozeDefinition,
  FormulaPrimitive,
  ContentPrimitive,
  // Canonical Card
  CanonicalCard,
  CanonicalCardStructuralType,
  CardSource,
  CardSourceType,
  CardContentLayout,
  CustomLayoutSpec,
  GlobalSchedulingState,
  CardLearningState,
  LearningHistorySnapshot,
  // Card Face
  CardFace,
  CardFaceType,
  CognitiveDepthLevel,
  FaceContentPresentation,
  ContentPresentationStrategy,
  PrimitiveReference,
  PrimitiveTransform,
  EmphasisHint,
  FaceScaffolding,
  ScaffoldingHint,
  ExpectedOutputType,
  EvaluationCriteria,
  EvaluationRubric,
  // Note: RubricCriterion and RubricLevel are exported from lkgc/nodes
  // Applicability Rules
  FaceApplicabilityRule,
  ApplicabilityRuleType,
  ApplicabilityConditionSet,
  ApplicabilityCondition,
  CategoryCondition,
  RoleCondition,
  ModeCondition,
  DepthCondition,
  IntentCondition,
  CategoryIntent,
  LkgcSignalCondition,
  // Note: LkgcSignalType is exported from lkgc/nodes
  UserPreferenceCondition,
  TemporalCondition,
  TimeConstraint,
  CompositeCondition,
  CustomCondition,
  // Mastery Transfer
  MasteryTransferConfig,
  CrossFaceTransferRule,
  // Performance Tracking
  FacePerformanceSnapshot,
  // Face Provenance
  FaceSource,
  FaceSourceType,
  // API Input/Output
  CreateCanonicalCardInput,
  UpdateCanonicalCardInput,
  CreateCardFaceInput,
  UpdateCardFaceInput,
  AddFaceApplicabilityRulesInput,
  RecordFacePerformanceInput,
  FaceQueryContext,
  FaceQueryResult,
  // Events
  CanonicalCardCreatedEvent,
  CanonicalCardUpdatedEvent,
  CardFaceCreatedEvent,
  CardFaceUpdatedEvent,
  FacePerformanceRecordedEvent,
  CanonicalCardEvent,
  // Explainability
  FaceSelectionExplanation,
  MatchedApplicabilityRule,
  UnmatchedApplicabilityRule,
  // Plugin Extension
  FaceTypePlugin,
  FaceTypeRenderHints,
  ApplicabilityRulePlugin,
  // AI Face Suggestions
  AiFaceSuggestion,
  AiFaceSuggestionStatus,
  RequestAiFaceSuggestionsInput,
} from "./canonical-card.types";

// =============================================================================
// FACE RESOLUTION ENGINE (Phase 6B)
// =============================================================================
// Declarative, rule-based face resolution engine

export type {
  // Identifiers
  ResolutionRequestId,
  ResolutionRulePluginId,
  FaceResolutionTraceId,
  // Input Types
  FaceResolutionInput,
  CardFaceWithRules,
  CategoryLensContext,
  ParticipationContext,
  ModeContext,
  LkgcSignalsContext,
  UserPreferencesContext,
  TemporalContext,
  ResolutionOptions,
  // Output Types
  FaceResolutionOutput,
  ScaffoldingDirectives,
  RenderingDirectives,
  EmphasisDirective,
  ContentRegionHighlight,
  ContextIndicator,
  // Explainability Types
  FaceResolutionExplainability,
  FaceResolutionFactor,
  FaceResolutionFactorType,
  MatchedRuleExplanation,
  UnmatchedRuleExplanation,
  ConditionMatchExplanation,
  ConditionFailureExplanation,
  AlternativeFaceExplanation,
  ResolutionContextSnapshot,
  // Plugin Types
  ResolutionRulePlugin,
  CustomConditionTypeDefinition,
  ConditionEvaluator,
  ConditionEvaluationResult,
  FaceScorer,
  FaceScoringResult,
  ScoreComponent,
  NamedFaceScorer,
  // Registry Types
  ConditionEvaluatorRegistry,
  FaceScorerRegistry,
  // Configuration Types
  FaceResolutionEngineConfig,
  ScaffoldingAdjustmentConfig,
  ResolutionCacheConfig,
  // Event Types
  FaceResolvedEvent,
  FaceResolutionFailedEvent,
  PluginRuleEvaluatedEvent,
  FaceResolutionEvent,
  // Engine Interface
  IFaceResolutionEngine,
  // Note: FaceResolutionInputBuilder class is exported from algorithms/
} from "./face-resolution.types";

export {
  DEFAULT_RESOLUTION_CONFIG,
  DEPTH_LEVEL_ORDER,
} from "./face-resolution.types";

// =============================================================================
// DYNAMIC DECK TYPES (Phase 6C)
// =============================================================================

// Note: DynamicDeckId from dynamic-deck.types.ts is a branded version.
// We export it with a different name to avoid conflicts with ecosystem.types.ts
export type {
  // Core deck types (DynamicDeckId branded version renamed to avoid conflict)
  DynamicDeckId as BrandedDynamicDeckId,
  DeckQueryId,
  PredicateId,
  DeckSnapshotId,
  InclusionExplanationId,
  DeckChangeEventId,
  DynamicDeckDefinition,

  // Query types
  DeckQuery,
  DeckQueryType,
  BaseDeckQuery,
  CombinatorQuery,
  DeckReferenceQuery,

  // Filter/State types (renamed to avoid conflicts with card.types.ts)
  CardState as DeckQueryCardState,
  NumericRange,
  IntegerRange,
  TemporalWindow,

  // LKGC predicates (LkgcSignalType renamed to avoid conflict with learning-mode.types.ts)
  LkgcPredicate,
  LkgcSignalType as DeckQueryLkgcSignalType,
  ComparisonOperator,

  // Graph predicates
  GraphPredicate,
  DirectRelationPredicate,
  TransitiveReachabilityPredicate,
  NeighborhoodPredicate,
  PathExistsPredicate,
  SubgraphContainmentPredicate,
  CustomDeckPredicate,

  // Sorting
  DeckSortSpec,
  DeckSortField,
  DeckSortableField,

  // Evaluation types
  DeckQueryEvaluationInput,
  DeckQueryEvaluationResult,
  DeckCardResult,
  CardLkgcSignals,
  DeckEvaluationMetadata,
  DeckStatistics,

  // Explainability types
  CardInclusionExplanation,
  InclusionReason,
  QueryNodeMatch,
  InclusionFactor,
  InclusionFactorType,
  ExclusionThreat,

  // Auto-update types
  DeckAutoUpdateConfig,
  DeckUpdateTrigger,
  DeckChangeType,
  DeckChangeEvent,
  DeckSnapshotSummary,

  // Engine interface
  IDeckQueryEngine,
  DeckChangePreview,
  DeckQueryValidationResult,
  DeckQueryError,
  DeckQueryWarning,
  DeckQueryComplexity,

  // Predicate evaluation
  CustomPredicateEvaluator,
  PredicateEvaluationContext,
  PredicateEvaluationResult,

  // Graph/LKGC readers
  GraphReader,
  LkgcReader,
  GraphNode,
  GraphEdge,
  TraversalOptions as DeckTraversalOptions,
  PathOptions,

  // Subscriptions
  DeckChangeCallback,
  DeckChangeSubscription,

  // Events
  DeckQueryEvent,
  DeckCreatedEvent,
  DeckUpdatedEvent,
  DeckDeletedEvent,
  DeckEvaluatedEvent,
  DeckCacheInvalidatedEvent,

  // Builders
  DeckQueryBuilder,
  BaseQueryBuilder,
  CombinatorQueryBuilder,
} from "./dynamic-deck.types";

// Constants
export {
  DEFAULT_AUTO_UPDATE_CONFIG,
  DEFAULT_PAGE_SIZE,
  MAX_QUERY_COMPLEXITY,
  MAX_TRAVERSAL_DEPTH,
  MAX_COMBINATOR_OPERANDS,
} from "./dynamic-deck.types";

// =============================================================================
// REVIEW SESSION TYPES (Phase 6D)
// =============================================================================

export type {
  // Session identifiers
  ReviewSessionId,
  ReviewItemId,
  OrchestrationTraceId,
  FacePivotId,
  SessionEventId,

  // Request/Response
  ReviewSessionRequest,
  ReviewSessionResponse,
  ReviewSessionState,

  // Review items
  ResolvedReviewItem,
  ReviewItemScheduling,
  ReviewItemDeckContext,
  ResolvedFaceContext,
  AlternativeFace,
  ImprovementPotential,

  // Context indicators (ContextIndicator is already exported from face-resolution.types)
  ContextIndicatorType,

  // Review processing
  ReviewResult,
  ReviewResultResponse,
  ReviewFeedback,

  // Face pivoting
  FacePivotRequest,
  FacePivotResponse,
  FacePivotReason,
  FacePivotRecord,
  LearningImpactEstimate,

  // Session state
  SessionStatus,
  // SessionStatistics already exported from scheduler.types.ts - use ReviewSessionStatistics
  ReviewSessionStatistics,
  SessionConstraints,
  ActiveDeckContext,
  DeckEvaluationSummary,

  // Completion
  SessionCompletionSummary,
  LearningInsight,
  SessionRecommendation,

  // Explainability
  SessionExplainability,
  ReviewItemExplainability,
  SchedulerStageExplanation,
  ModeStageExplanation,
  DeckStageExplanation,
  FaceStageExplanation,
  SignalContribution,
  ModeInfluenceExplanation,
  SignalAmplificationExplanation,
  PolicyModificationExplanation,
  DeckFilterExplanation,
  QueueCompositionExplanation,

  // Events
  SessionEvent,
  SessionEventCallback,
  SessionEventSubscription,
  SessionStartedEvent,
  ItemPresentedEvent,
  ItemReviewedEvent,
  FacePivotedEvent,
  SessionPausedEvent,
  SessionResumedEvent,
  SessionCompletedEvent,
  SessionErrorEvent,

  // Provider interfaces
  IReviewSessionOrchestrator,
  RankedCandidateProvider,
  RankedCandidateOptions,
  DeckEvaluationProvider,
  DeckMembershipResult,
  FaceResolutionProvider,
  CardDataProviderForSession,
  CardData,
  ParticipationSummary,

  // Configuration
  SessionOrchestratorConfig,

  // Shared types - note: CardState exported from card.types, UrgencyLevel from scheduler.types
} from "./review-session.types";

// Constants
export { DEFAULT_SESSION_ORCHESTRATOR_CONFIG } from "./review-session.types";
