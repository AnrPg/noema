import type {
  CardId,
  ConceptId,
  EpistemicMode,
  GeneratedVariantId,
  GoalId,
  GoalType,
  LearningInterventionType,
  LearningMode,
  LessonPlanId,
  ReplanScope,
  RigorLevel,
  SessionId,
  StepId,
  StudyMode,
  TransformationType,
  UserId,
} from '@noema/types';

export const GuardianArtifactType = {
  LESSON_PLAN: 'lesson_plan',
  STEP: 'step',
  ACTIVITY: 'activity',
  REPLAN: 'replan',
  GENERATED_VARIANT: 'generated_variant',
} as const;

export type GuardianArtifactType = (typeof GuardianArtifactType)[keyof typeof GuardianArtifactType];

export const GuardianResult = {
  ACCEPTED: 'accepted',
  WARNING: 'warning',
  REJECTED: 'rejected',
} as const;

export type GuardianResult = (typeof GuardianResult)[keyof typeof GuardianResult];

export interface IGuardianValidation {
  id: string;
  artifactType: GuardianArtifactType;
  artifactId: string;
  artifactHash: string;
  result: GuardianResult;
  reasonCodes: string[];
  blocking: boolean;
  evaluatedRules: unknown;
  triggeredBy: string;
  createdAt: string;
}

export interface IGuardianValidationOutcome {
  result: GuardianResult;
  reasonCodes: string[];
  blocking: boolean;
  validationId: string;
}

export interface IGuardianValidationInput {
  artifactType: GuardianArtifactType;
  artifactId: string;
  artifactHash: string;
  result: GuardianResult;
  reasonCodes: string[];
  blocking: boolean;
  evaluatedRules: unknown;
  triggeredBy: string;
}

export interface IGuardianRepository {
  createValidation(input: IGuardianValidationInput): Promise<IGuardianValidation>;
}

export interface IConceptStateLookup {
  isConceptStable(input: {
    userId: UserId;
    conceptId: ConceptId;
    studyMode: StudyMode;
  }): Promise<boolean>;
}

export interface ILessonPlanGoal {
  id: GoalId;
  type: GoalType;
  state?: string;
  conceptRefs?: ConceptId[];
}

export interface IGuardianActivity {
  id: string;
  stepId?: StepId;
  contentSourceType: 'card' | 'template' | 'generated';
  cardId?: CardId | null;
  templateId?: string | null;
  generatedVariantId?: GeneratedVariantId | null;
  prompt: string;
  expectedResponseType: string;
  responseSchema: unknown;
  compatibleTransformations?: TransformationType[];
  content?: unknown;
}

export interface IGuardianStep {
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
  expectedOutcome?: string;
  evaluationType: string;
  difficulty: number;
  isRepair: boolean;
  conceptRefs: ConceptId[];
  status: string;
  activities: IGuardianActivity[];
  supersededByStepId?: StepId | null;
}

export interface IGuardianLessonPlan {
  id: LessonPlanId;
  sessionId: SessionId;
  userId: UserId;
  studyMode: StudyMode;
  learningMode: LearningMode;
  rigorLevel: RigorLevel;
  topic: string;
  prerequisites: ConceptId[];
  goals: ILessonPlanGoal[];
  steps: IGuardianStep[];
}

export interface IValidateActivityInput {
  activity: IGuardianActivity;
  step?: IGuardianStep;
}

export interface IValidateStepInput {
  step: IGuardianStep;
  previousFailedStep?: IGuardianStep;
}

export interface IValidateReplanInput {
  current: IGuardianLessonPlan;
  proposed: IGuardianLessonPlan;
  trigger: {
    type: string;
    severity?: number;
    recommendedIntervention?: LearningInterventionType;
  };
  scope: ReplanScope;
}

export interface IGeneratedActivityVariant {
  id: GeneratedVariantId;
  conceptId: ConceptId;
  transformationType: TransformationType;
  epistemicMode: EpistemicMode;
  difficultyBucket: number;
  prompt: string;
  expectedResponseType: string;
  responseSchema: unknown;
  renderPayload: unknown;
}
