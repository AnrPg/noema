/**
 * @noema/api-client - Scheduler Service Types
 *
 * TypeScript types for Scheduler Service API endpoints.
 */

import type { IApiResponse } from '@noema/contracts';
import type { CardId, StudyMode } from '@noema/types';

// ============================================================================
// Common
// ============================================================================

export interface ISchedulerPolicyVersion {
  version: string;
}

// ============================================================================
// Review Queue (H5)
// ============================================================================

export interface IReviewQueueParams {
  lane?: 'retention' | 'calibration';
  limit?: number;
  asOf?: string;
  studyMode?: StudyMode;
}

export interface IReviewListParams {
  userId: string;
  studyMode?: StudyMode;
  cardId?: CardId;
  sessionId?: string;
  lane?: 'retention' | 'calibration';
  algorithm?: 'fsrs' | 'hlr' | 'sm2';
  rating?: 'again' | 'hard' | 'good' | 'easy';
  outcome?: string;
  reviewedAfter?: string;
  reviewedBefore?: string;
  sortBy?: 'reviewedAt' | 'responseTime' | 'rating';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface IReviewStatsParams {
  userId: string;
  studyMode?: StudyMode;
  cardId?: CardId;
  sessionId?: string;
  lane?: 'retention' | 'calibration';
  algorithm?: 'fsrs' | 'hlr' | 'sm2';
  rating?: 'again' | 'hard' | 'good' | 'easy';
  outcome?: string;
  reviewedAfter?: string;
  reviewedBefore?: string;
}

export interface IReviewQueueCard {
  cardId: string;
  userId: string;
  studyMode: StudyMode;
  lane: 'retention' | 'calibration';
  schedulingAlgorithm: 'fsrs' | 'hlr' | 'sm2';
  stability: number | null;
  difficulty: number | null;
  nextReviewDate: string | null;
  lastReviewedAt: string | null;
  reviewCount: number;
  lapseCount: number;
  state: string;
}

export interface IReviewQueueResponse {
  cards: IReviewQueueCard[];
  totalDue: number;
  retentionDue: number;
  calibrationDue: number;
  asOf: string;
  policyVersion: ISchedulerPolicyVersion;
}

// ============================================================================
// Retention Prediction (H6)
// ============================================================================

export interface IRetentionPredictionRequest {
  cardId: string;
  algorithm: 'fsrs' | 'hlr' | 'sm2';
  asOf?: string;
}

export interface IPredictRetentionInput {
  userId: string;
  cards: IRetentionPredictionRequest[];
}

export interface IRetentionPrediction {
  cardId: string;
  algorithm: string;
  retentionProbability: number;
  daysUntilDue: number;
  nextReviewAt: string;
  confidence: number;
}

export interface IRetentionPredictionResponse {
  predictions: IRetentionPrediction[];
  generatedAt: string;
  policyVersion: ISchedulerPolicyVersion;
}

export interface IForecastInput {
  userId: string;
  days?: number;
  includeOverdue?: boolean;
  studyMode?: StudyMode;
}

export interface IForecastLaneCounts {
  newDue: number;
  overdue: number;
  total: number;
}

export interface IForecastDay {
  date: string;
  retention: IForecastLaneCounts;
  calibration: IForecastLaneCounts;
  combined: IForecastLaneCounts;
  estimatedMinutes: number;
}

export interface IForecastResponse {
  days: IForecastDay[];
  generatedAt: string;
  model: 'consumed';
  averageSecondsPerCard: number;
}

export interface ISchedulerProgressSummaryParams {
  studyMode?: StudyMode;
}

export interface ISchedulerProgressSummary {
  userId: string;
  studyMode: StudyMode;
  totalCards: number;
  trackedCards: number;
  dueNow: number;
  dueToday: number;
  overdueCards: number;
  newCards: number;
  learningCards: number;
  matureCards: number;
  suspendedCards: number;
  retentionCards: number;
  calibrationCards: number;
  fsrsCards: number;
  hlrCards: number;
  sm2Cards: number;
  averageRecallProbability: number | null;
  strongRecallCards: number;
  fragileCards: number;
}

export interface ISchedulerCardFocusSummaryParams {
  studyMode?: StudyMode;
  limit?: number;
}

export type SchedulerDueStatus = 'overdue' | 'due_today' | 'upcoming';
export type SchedulerReadinessBand = 'untracked' | 'fragile' | 'recovering' | 'stable';

export interface ISchedulerCardFocusEntry {
  cardId: string;
  studyMode: StudyMode;
  lane: 'retention' | 'calibration';
  state: string;
  schedulingAlgorithm: 'fsrs' | 'hlr' | 'sm2';
  nextReviewDate: string;
  reviewCount: number;
  cardType: string | null;
  difficulty: string | null;
  dueStatus: SchedulerDueStatus;
  daysUntilDue: number;
  recallProbability: number | null;
  readinessBand: SchedulerReadinessBand;
  focusReason: string;
}

export interface ISchedulerCardFocusSummary {
  userId: string;
  studyMode: StudyMode;
  weakestCards: ISchedulerCardFocusEntry[];
  strongestCards: ISchedulerCardFocusEntry[];
}

export interface ISchedulerStudyGuidanceSummaryParams {
  studyMode?: StudyMode;
}

export type SchedulerGuidanceAction =
  | 'clear_overdue'
  | 'reinforce_fragile_cards'
  | 'do_scheduled_reviews'
  | 'build_coverage'
  | 'expand_confidently';

export interface ISchedulerGuidanceRecommendation {
  action: SchedulerGuidanceAction;
  headline: string;
  explanation: string;
  suggestedCardCount: number;
  relatedCardIds: string[];
}

export interface ISchedulerStudyGuidanceSummary {
  userId: string;
  studyMode: StudyMode;
  recommendations: ISchedulerGuidanceRecommendation[];
}

export interface IReviewHistoryEntry {
  id: string;
  cardId: CardId;
  userId: string;
  studyMode: StudyMode;
  sessionId: string;
  attemptId: string;
  rating: 'again' | 'hard' | 'good' | 'easy';
  ratingValue: number;
  outcome: string;
  deltaDays: number;
  responseTime: number | null;
  reviewedAt: string;
  lane: 'retention' | 'calibration';
  algorithm: string;
  priorState: Record<string, unknown>;
  newState: Record<string, unknown>;
  confidenceBefore: number | null;
  confidenceAfter: number | null;
  calibrationDelta: number | null;
  hintDepthReached: number | null;
}

export interface IReviewHistoryListResponse {
  data: IReviewHistoryEntry[];
  pagination: {
    offset: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

export interface IReviewStats {
  totalReviews: number;
  averageResponseTimeMs: number | null;
  ratingDistribution: {
    again: number;
    hard: number;
    good: number;
    easy: number;
  };
  outcomeDistribution: {
    correct: number;
    incorrect: number;
    partial: number;
    skipped: number;
  };
  averageCalibrationDelta: number | null;
  averageInterval: number | null;
  reviewsByDay: { date: string; count: number }[];
}

// ============================================================================
// Scheduler Card
// ============================================================================

export interface ISchedulerCardResponse {
  card: IReviewQueueCard;
}

export interface ISchedulerCardListParams {
  userId: string;
  studyMode?: StudyMode;
  lane?: string;
  state?: string;
  algorithm?: string;
  dueBefore?: string;
  dueAfter?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ISchedulerCardListResponse {
  data: IReviewQueueCard[];
  pagination: {
    offset: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

// ============================================================================
// Backward-compat aliases (Phase 01)
// ============================================================================

export type SchedulerPolicyVersion = ISchedulerPolicyVersion;
export type ReviewQueueParams = IReviewQueueParams;
export type ReviewQueueCard = IReviewQueueCard;
export type ReviewQueueResponse = IApiResponse<IReviewQueueResponse>;
export type RetentionPredictionRequest = IRetentionPredictionRequest;
export type PredictRetentionInput = IPredictRetentionInput;
export type RetentionPrediction = IRetentionPrediction;
export type RetentionPredictionResponse = IApiResponse<IRetentionPredictionResponse>;
export type SchedulerCardResponse = IApiResponse<ISchedulerCardResponse>;
export type SchedulerCardListParams = ISchedulerCardListParams;
export type SchedulerCardListResponse = IApiResponse<ISchedulerCardListResponse>;
export type ForecastInput = IForecastInput;
export type ForecastLaneCounts = IForecastLaneCounts;
export type ForecastDay = IForecastDay;
export type ForecastResponseDto = IForecastResponse;
export type SchedulerProgressSummaryParams = ISchedulerProgressSummaryParams;
export type SchedulerProgressSummaryDto = ISchedulerProgressSummary;
export type SchedulerProgressSummaryResponse = IApiResponse<ISchedulerProgressSummary>;
export type SchedulerCardFocusSummaryParams = ISchedulerCardFocusSummaryParams;
export type SchedulerCardFocusEntryDto = ISchedulerCardFocusEntry;
export type SchedulerCardFocusSummaryDto = ISchedulerCardFocusSummary;
export type SchedulerCardFocusSummaryResponse = IApiResponse<ISchedulerCardFocusSummary>;
export type SchedulerStudyGuidanceSummaryParams = ISchedulerStudyGuidanceSummaryParams;
export type SchedulerGuidanceRecommendationDto = ISchedulerGuidanceRecommendation;
export type SchedulerStudyGuidanceSummaryDto = ISchedulerStudyGuidanceSummary;
export type SchedulerStudyGuidanceSummaryResponse = IApiResponse<ISchedulerStudyGuidanceSummary>;
export type ReviewListParams = IReviewListParams;
export type ReviewStatsParams = IReviewStatsParams;
export type ReviewHistoryEntry = IReviewHistoryEntry;
export type ReviewHistoryListResponse = IApiResponse<IReviewHistoryListResponse>;
export type ReviewStats = IReviewStats;
export type ReviewStatsResponse = IApiResponse<IReviewStats>;

// ============================================================================
// Phase 02 — Dual-Lane Plan
// ============================================================================

export interface IDualLanePlanInput {
  userId: string;
  studyMode?: StudyMode;
  asOf?: string;
  horizonDays?: number;
}

export interface ILaneSlot {
  cardId: CardId;
  scheduledAt: string;
  lane: 'retention' | 'calibration';
  algorithm: 'fsrs' | 'hlr' | 'sm2';
}

export interface IDualLanePlanResult {
  slots: ILaneSlot[];
  totalRetention: number;
  totalCalibration: number;
  generatedAt: string;
}

// ============================================================================
// Phase 02 — Review Windows
// ============================================================================

export interface IReviewWindowInput {
  userId: string;
  studyMode?: StudyMode;
  date?: string;
  timezone?: string;
}

export interface IReviewWindowDto {
  startAt: string;
  endAt: string;
  cardsDue: number;
  lane: 'retention' | 'calibration';
  loadScore: number;
}

// ============================================================================
// Phase 02 — Session Candidates
// ============================================================================

export interface ISessionCandidatesInput {
  userId: string;
  studyMode?: StudyMode;
  lane?: 'retention' | 'calibration';
  limit?: number;
  asOf?: string;
}

export interface ISessionCandidateDto {
  cardId: CardId;
  lane: 'retention' | 'calibration';
  priority: number;
  daysOverdue: number;
  retentionProbability: number;
}

// ============================================================================
// Phase 02 — Simulation
// ============================================================================

export interface ISimulationInput {
  userId: string;
  studyMode?: StudyMode;
  sessionDurationMinutes: number;
  lane?: 'retention' | 'calibration';
  asOf?: string;
}

export interface ISimulationResult {
  simulatedCards: ISessionCandidateDto[];
  projectedRetentionGain: number;
  estimatedDurationMinutes: number;
}

// ============================================================================
// Phase 02 — Schedule Commits
// ============================================================================

export interface IScheduleCommitInput {
  algorithm: 'fsrs' | 'hlr' | 'sm2';
  grade: number;
  reviewedAt?: string;
  studyMode?: StudyMode;
}

export interface ISchedulerCardDto {
  cardId: CardId;
  userId: string;
  studyMode: StudyMode;
  lane: 'retention' | 'calibration';
  algorithm: 'fsrs' | 'hlr' | 'sm2';
  nextReviewDate: string;
  stability: number | null;
  difficulty: number | null;
  reviewCount: number;
}

export interface IBatchScheduleCommitInput {
  studyMode?: StudyMode;
  commits: ({ cardId: CardId } & IScheduleCommitInput)[];
}

export interface IBatchScheduleCommitResult {
  committed: number;
  failed: number;
  errors: { cardId: CardId; error: string }[];
}

// ============================================================================
// Backward-compat aliases (Phase 02)
// ============================================================================

export type DualLanePlanInput = IDualLanePlanInput;
export type LaneSlot = ILaneSlot;
export type DualLanePlanResult = IDualLanePlanResult;
export type ReviewWindowInput = IReviewWindowInput;
export type ReviewWindowDto = IReviewWindowDto;
export type SessionCandidatesInput = ISessionCandidatesInput;
export type SessionCandidateDto = ISessionCandidateDto;
export type SimulationInput = ISimulationInput;
export type SimulationResult = ISimulationResult;
export type ScheduleCommitInput = IScheduleCommitInput;
export type SchedulerCardDto = ISchedulerCardDto;
export type BatchScheduleCommitInput = IBatchScheduleCommitInput;
export type BatchScheduleCommitResult = IBatchScheduleCommitResult;

// ============================================================================
// Response aliases (Phase 02)
// ============================================================================

export type DualLanePlanResponse = IApiResponse<IDualLanePlanResult>;
export type ReviewWindowsResponse = IApiResponse<IReviewWindowDto[]>;
export type SessionCandidatesResponse = IApiResponse<ISessionCandidateDto[]>;
export type SimulationResponse = IApiResponse<ISimulationResult>;
export type ScheduleCommitResponse = IApiResponse<ISchedulerCardDto>;
export type BatchScheduleCommitResponse = IApiResponse<IBatchScheduleCommitResult>;
export type ForecastResponse = IApiResponse<IForecastResponse>;
