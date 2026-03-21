/**
 * @noema/api-client - Scheduler Service Types
 *
 * TypeScript types for Scheduler Service API endpoints.
 */

import type { IApiResponse } from '@noema/contracts';
import type { CardId } from '@noema/types';

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
}

export interface IReviewQueueCard {
  cardId: string;
  userId: string;
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

// ============================================================================
// Scheduler Card
// ============================================================================

export interface ISchedulerCardResponse {
  card: IReviewQueueCard;
}

export interface ISchedulerCardListParams {
  userId: string;
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

// ============================================================================
// Phase 02 — Dual-Lane Plan
// ============================================================================

export interface IDualLanePlanInput {
  userId: string;
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
}

export interface ISchedulerCardDto {
  cardId: CardId;
  userId: string;
  lane: 'retention' | 'calibration';
  algorithm: 'fsrs' | 'hlr' | 'sm2';
  nextReviewDate: string;
  stability: number | null;
  difficulty: number | null;
  reviewCount: number;
}

export interface IBatchScheduleCommitInput {
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
