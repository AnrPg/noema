/**
 * Contracts for the Step-first realignment learning loop.
 */

import type {
  ActivityId,
  CardId,
  ConceptId,
  EpistemicMode,
  EvaluationId,
  GeneratedVariantId,
  GoalId,
  GoalSource,
  GoalState,
  GoalType,
  LearningInterventionType,
  LearningMode,
  LessonPlanId,
  ReplanScope,
  RigorLevel,
  SessionId,
  StepId,
  StepSelfRating,
  StepStatus,
  StudyMode,
  TransformationType,
  TriggerId,
  TriggerStatus,
  TriggerType,
  UserId,
} from '@noema/types';

export interface IConceptRefDto {
  conceptId: ConceptId;
  label?: string;
  source?: string;
}

export interface ILessonPlanDto {
  id: LessonPlanId;
  sessionId: SessionId;
  userId: UserId;
  studyMode: StudyMode;
  learningMode: LearningMode;
  rigorLevel: RigorLevel;
  topic: string;
  prerequisites: IConceptRefDto[];
  sourceDecks: string[];
  sourceCategories: string[];
  assessmentStrategy?: string;
  adaptationRules?: string;
  guardianValidationId?: string;
  state: 'draft' | 'validated' | 'active' | 'completed' | 'abandoned';
  goals: ILessonPlanGoalDto[];
  steps: IStepDto[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ILessonPlanGoalDto {
  id: GoalId;
  lessonPlanId: LessonPlanId;
  description: string;
  type: GoalType;
  parentGoalId?: GoalId;
  state: GoalState;
  source: GoalSource;
  conceptRefs: ConceptId[];
  createdAt: string;
  updatedAt: string;
}

export type ActivityContentSourceDto =
  | { type: 'card'; cardId: CardId }
  | { type: 'generated'; variantId: GeneratedVariantId; templateId?: string };

export interface IActivityDto {
  id: ActivityId;
  stepId: StepId;
  contentSource: ActivityContentSourceDto;
  prompt: string;
  expectedResponseType: string;
  renderPayload?: unknown;
  variantSeed: string;
}

export interface IStepDto {
  id: StepId;
  lessonPlanId: LessonPlanId;
  sessionId: SessionId;
  userId: UserId;
  studyMode: StudyMode;
  position: number;
  objective: string;
  servesGoalIds: GoalId[];
  eligibleModes: EpistemicMode[];
  selectedMode: EpistemicMode;
  transformationType: TransformationType;
  expectedOutcome: string;
  evaluationType: string;
  difficulty: number;
  isRepair: boolean;
  conceptRefs: ConceptId[];
  variantSeed: string;
  status: StepStatus;
  evaluationId?: EvaluationId;
  guardianValidationId?: string;
  presentedAt?: string;
  answeredAt?: string;
  evaluatedAt?: string;
  supersededByStepId?: StepId;
  activities: IActivityDto[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ISevenFrameTraceFrameDto {
  score: number;
  notes: string;
}

export interface ISevenFrameTraceDto {
  frames: {
    f0: ISevenFrameTraceFrameDto;
    f1: ISevenFrameTraceFrameDto;
    f2: ISevenFrameTraceFrameDto;
    f3: ISevenFrameTraceFrameDto;
    f4: ISevenFrameTraceFrameDto;
    f5: ISevenFrameTraceFrameDto;
    f6: ISevenFrameTraceFrameDto;
  };
}

export interface IEvaluationDto {
  id: EvaluationId;
  stepId: StepId;
  sessionId: SessionId;
  userId: UserId;
  conceptRefs: ConceptId[];
  correct: boolean;
  selfRating: StepSelfRating;
  reasoningQuality: number;
  confidenceSignal: number;
  combinedScore: number;
  trace: ISevenFrameTraceDto;
  errorType?: string;
  misconceptionRef?: string;
  triggersFired: TriggerId[];
  recommendedAction: string;
  createdAt: string;
}

export type EvidenceAuthorityDto =
  | 'recorded_fact'
  | 'detected_signal'
  | 'deterministic_projection'
  | 'validation_result';

export interface IEvidenceCompletenessDto {
  state: 'complete' | 'partial' | 'missing_required';
  missingRequiredFields: string[];
  missingOptionalFields: string[];
  notes: string[];
}

export interface ILearnerAnswerArtifactDto {
  stepId: StepId;
  responseShape: string;
  learnerAnswerSummaryText: string;
  rawResponseRef: string;
  recordedAt: string;
  authority: EvidenceAuthorityDto;
}

export interface IRubricSummaryRecordDto {
  stepId: StepId;
  rubricSummaryText: string;
  successCriteriaText: string[];
  commonFailureModesText: string[];
  expectedAnswerShapeText: string;
  rubricVersion: string;
  authority: EvidenceAuthorityDto;
}

export interface IStepEvidenceRecordDto {
  stepId: StepId;
  sessionId: SessionId;
  lessonPlanId: LessonPlanId;
  userId: UserId;
  studyMode: StudyMode;
  epistemicMode: EpistemicMode;
  transformationType: TransformationType;
  stepObjectiveText: string;
  expectedOutcomeText: string;
  activityPromptText: string;
  activityTypeLabel: string;
  learnerAnswerSummaryText: string;
  responseShape: string;
  responseTimeMs?: number;
  hintRequestCount: number;
  revisionCount: number;
  answeredAt?: string;
  rubricSummary: IRubricSummaryRecordDto;
  evidenceCompleteness: IEvidenceCompletenessDto;
  serviceReferences: {
    stepId: StepId;
    sessionId: SessionId;
    lessonPlanId: LessonPlanId;
    activityId?: ActivityId;
    evaluationId?: EvaluationId;
    rawResponseRef?: string;
  };
}

export interface ITraceFrameEvidenceDto {
  frameKey: keyof ISevenFrameTraceDto['frames'];
  frameLabel: string;
  learnerReadableMeaning: string;
  score: number | null;
  signalLabel: 'strong' | 'mixed' | 'fragile' | 'missing';
  evidenceText: string;
  confidenceNoteText: string;
  privacyClass: 'prompt_safe_summary' | 'minimized_private_trace';
  authority: EvidenceAuthorityDto;
}

export interface ITraceEvidencePackDto {
  stepId: StepId;
  evaluationId: EvaluationId;
  traceVersion: string;
  overallReasoningQuality: number;
  frameEvidence: ITraceFrameEvidenceDto[];
  strongestFramesText: string[];
  fragileFramesText: string[];
  missingFramesText: string[];
  traceSummaryText: string;
  traceCompleteness: IEvidenceCompletenessDto;
  serviceReferences: {
    stepId: StepId;
    sessionId: SessionId;
    lessonPlanId: LessonPlanId;
    evaluationId: EvaluationId;
    conceptRefs: ConceptId[];
  };
}

export interface IContentAnchorSummaryDto {
  anchorLabelText: string;
  sourceKind: string;
  promptExcerptText: string;
  expectedUseText: string;
  coverageStatusText: string;
  serviceReferences: {
    activityId?: ActivityId;
    cardId?: CardId;
    generatedVariantId?: GeneratedVariantId;
    templateId?: string;
    conceptIds?: ConceptId[];
  };
}

export interface IConceptRelationSummaryDto {
  labelText: string;
  relationshipText: string;
  knownStabilityText?: string;
  riskIfWeakText?: string;
  disambiguatingCueText?: string;
  recentEvidenceText?: string;
  serviceReferences: {
    conceptId?: ConceptId;
    nodeId?: string;
    edgeId?: string;
  };
}

export interface IConceptLearningContextDto {
  conceptLabelText: string;
  conceptShortDescriptionText: string;
  conceptAliasesText: string[];
  whyThisConceptMattersText?: string;
  prerequisiteSummaries: IConceptRelationSummaryDto[];
  confusableConceptSummaries: IConceptRelationSummaryDto[];
  contrastSummaries: IConceptRelationSummaryDto[];
  misconceptionLinkSummaries: IConceptRelationSummaryDto[];
  contentAnchorSummaries: IContentAnchorSummaryDto[];
  curriculumAnchorText?: string;
  graphAnchorStatus: {
    state: 'resolved' | 'fallback_label' | 'missing_concept_node';
    notes: string[];
  };
  serviceReferences: {
    conceptId: ConceptId;
    nodeId?: string;
    prerequisiteConceptIds: ConceptId[];
    confusableConceptIds: ConceptId[];
    contentCardIds: CardId[];
    generatedVariantIds: GeneratedVariantId[];
    curriculumNodeIds: string[];
  };
}

export interface IStepActivityContextDto {
  stepId: StepId;
  activityPromptText: string;
  activityTypeText: string;
  contentAnchorSummaries: IContentAnchorSummaryDto[];
  serviceReferences: {
    stepId: StepId;
    activityIds: ActivityId[];
    cardIds: CardId[];
    generatedVariantIds: GeneratedVariantId[];
    templateIds: string[];
  };
}

export interface IStepCurriculumAnchorDto {
  stepId: StepId;
  curriculumAnchorText: string;
  selectedNodeIds: string[];
  topicText?: string;
  serviceReferences: {
    stepId: StepId;
    sessionId: SessionId;
    lessonPlanId: LessonPlanId;
    curriculumNodeIds: string[];
  };
}

export type LearnerFeedbackSurfaceDto =
  | 'mental_debugger'
  | 'calibration_coach'
  | 'calibration_drill'
  | 'patch_planner'
  | 'lesson_plan';

export type LearnerFeedbackActionTypeDto =
  | 'debugger_reflection_dismissed'
  | 'debugger_reflection_marked_not_fit'
  | 'debugger_reflection_show_less'
  | 'debugger_reflection_show_more'
  | 'debugger_pattern_hidden_temporarily'
  | 'calibration_note_dismissed'
  | 'calibration_note_marked_not_fit'
  | 'calibration_drill_accepted'
  | 'calibration_drill_declined'
  | 'calibration_show_trend';

export interface ILearnerFeedbackActionDto {
  id: string;
  userId: UserId;
  sessionId?: SessionId;
  stepId?: StepId;
  surface: LearnerFeedbackSurfaceDto;
  actionType: LearnerFeedbackActionTypeDto;
  noteText?: string;
  reasonText?: string;
  conceptIds: ConceptId[];
  createdAt: string;
}

export interface ILearnerFeedbackHistoryDto {
  userId: UserId;
  surface: LearnerFeedbackSurfaceDto;
  windowLabelText: string;
  recentDismissals: ILearnerFeedbackActionDto[];
  recentCorrections: ILearnerFeedbackActionDto[];
  feedbackDepthPreference: 'less_detail' | 'more_detail' | 'standard';
  temporaryHideState: {
    hidden: boolean;
    hiddenUntilText?: string;
    reasonText?: string;
  };
  correctionThemesText: string[];
  summaryText: string;
  serviceReferences: {
    actionIds: string[];
  };
}

export interface ILearnerLoadStateDto {
  userId: UserId;
  sessionId: SessionId;
  frustrationSignalText: string;
  overloadRiskLevel: 'low' | 'medium' | 'high';
  fatigueIndicatorsText: string[];
  recommendedToneText: string;
  shouldDeferReflectiveAgent: boolean;
  evidenceWindowText: string;
  serviceReferences: {
    sessionId: SessionId;
    stepIds: StepId[];
  };
}

export interface IExposureBudgetStateDto {
  userId: UserId;
  sessionId: SessionId;
  debuggerExposureCountInSession: number;
  calibrationExposureCountInSession: number;
  lastDebuggerShownAtText: string;
  lastCalibrationShownAtText: string;
  debuggerExposureBudgetText: string;
  coachingFrequencyBudgetText: string;
  remainingBudget: {
    mentalDebugger: number;
    calibrationCoach: number;
  };
  mustUseQuietSurface: boolean;
  serviceReferences: {
    exposureIds: string[];
  };
}

export interface IAgentSurfaceExposureDto {
  id: string;
  userId: UserId;
  sessionId: SessionId;
  stepId?: StepId;
  surface: LearnerFeedbackSurfaceDto;
  shownAt: string;
}

export interface IRepeatedPatternSummaryDto {
  patternLabelText: string;
  learnerSafeDescriptionText: string;
  evidenceCount: number;
  affectedConceptLabelsText: string[];
  typicalFragileFramesText: string[];
  lastSeenText: string;
  recommendedInterpretationText: string;
}

export interface IRepeatedPatternHistoryDto {
  userId: UserId;
  conceptIds: ConceptId[];
  windowLabelText: string;
  patternSummaries: IRepeatedPatternSummaryDto[];
  singleSignalWarningText: string;
  mostRecentSimilarStepsText: string[];
  trendDirectionText: string;
  confidenceNoteText: string;
  serviceReferences: {
    evaluationIds: EvaluationId[];
    stepIds: StepId[];
  };
}

export interface ICalibrationTrendSummaryDto {
  userId: UserId;
  conceptIds: ConceptId[];
  recentCalibrationTrendText: string;
  alignmentRate: number;
  overconfidenceCount: number;
  underconfidenceCount: number;
  hesitationWithQualityCount: number;
  trendWindow: {
    windowLabelText: string;
    sampleCount: number;
  };
  evidenceExamplesText: string[];
  confidenceInTrendText: string;
  serviceReferences: {
    evaluationIds: EvaluationId[];
  };
}

export interface IConceptMismatchHistoryDto {
  userId: UserId;
  conceptId: ConceptId;
  conceptLabelText: string;
  mismatchPatternText: string;
  reasoningVersusConfidenceText: string;
  recentExamplesText: string[];
  scheduleProjectionText?: string;
  recommendedCalibrationMoveText: string;
  serviceReferences: {
    conceptId: ConceptId;
    evaluationIds: EvaluationId[];
  };
}

export interface IPriorCalibrationDrillHistoryDto {
  userId: UserId;
  conceptIds: ConceptId[];
  windowLabelText: string;
  priorDrillsText: string[];
  lastDrillOutcomeText: string;
  drillFatigueText: string;
  recommendedNextDrillTypeText: string;
  serviceReferences: {
    feedbackActionIds: string[];
  };
}

export interface IInterventionCadenceStateDto {
  userId: UserId;
  conceptIds: ConceptId[];
  surfaces: LearnerFeedbackSurfaceDto[];
  coachingFrequencyBudgetText: string;
  debuggerExposureBudgetText: string;
  shouldDeferText: string;
  serviceReferences: {
    exposureIds: string[];
  };
}

export interface ITriggerDto {
  id: TriggerId;
  userId: UserId;
  type: TriggerType;
  severity: number;
  detectedFrom: string[];
  context: {
    conceptRefs: ConceptId[];
    stepId: StepId;
    sessionId: SessionId;
  };
  recommendedIntervention: LearningInterventionType;
  status: TriggerStatus;
  createdAt: string;
  updatedAt: string;
}

export interface IReplanDto {
  sessionId: SessionId;
  lessonPlanId: LessonPlanId;
  triggerIds: TriggerId[];
  scope: ReplanScope;
  interventionType: LearningInterventionType;
  supersededStepIds: StepId[];
  insertedSteps: IStepDto[];
  guardianValidationId?: string;
  committedAt?: string;
}
