import type { IAgentHints } from '@noema/contracts';

import type {
  CardId,
  CorrelationId,
  IDualLanePlan,
  IDualLanePlanInput,
  IExecutionContext,
  ISchedulerLaneMix,
  SchedulerLane,
  UserId,
} from '../../types/scheduler.types.js';
import { randomUUID } from 'node:crypto';
import type { IEventPublisher } from '../shared/event-publisher.js';
import type {
  ICalibrationDataRepository,
  IReviewRepository,
  ISchedulerCardRepository,
} from './scheduler.repository.js';
import { DualLanePlanInputSchema } from './scheduler.schemas.js';

export interface IServiceResult<T> {
  data: T;
  agentHints: IAgentHints;
}

export interface ISchedulerServiceRepositories {
  schedulerCardRepository: ISchedulerCardRepository;
  reviewRepository: IReviewRepository;
  calibrationDataRepository: ICalibrationDataRepository;
}

export class SchedulerService {
  constructor(
    private readonly eventPublisher: IEventPublisher,
    private readonly repositories?: ISchedulerServiceRepositories
  ) {}

  async planDualLaneQueue(
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<IDualLanePlan>> {
    const parsed = DualLanePlanInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error('Invalid dual-lane plan input');
    }

    const data = parsed.data as IDualLanePlanInput;
    if (data.userId !== ctx.userId) {
      throw new Error('userId in payload must match authenticated user');
    }
    const laneMix = this.normalizeLaneMix(data.targetMix);
    const selected = this.selectByLaneMix(
      data.retentionCardIds,
      data.calibrationCardIds,
      laneMix,
      data.maxCards
    );

    const result: IDualLanePlan = {
      planVersion: 'v1',
      laneMix,
      selectedCardIds: selected,
      retentionSelected: selected.filter((id) => data.retentionCardIds.includes(id)).length,
      calibrationSelected: selected.filter((id) => data.calibrationCardIds.includes(id)).length,
      rationale: 'Dual-lane plan generated from retention/calibration pools and target lane mix',
    };

    if (this.repositories !== undefined) {
      await this.persistPlannedCards(
        data.userId,
        data.retentionCardIds,
        data.calibrationCardIds,
        selected
      );
    }

    await this.eventPublisher.publish({
      eventType: 'schedule.dual_lane.planned',
      aggregateType: 'Schedule',
      aggregateId: data.userId,
      payload: {
        laneMix,
        selectedCount: selected.length,
      },
      metadata: {
        correlationId: ctx.correlationId,
        userId: ctx.userId,
      },
    });

    return {
      data: result,
      agentHints: this.defaultHints(
        'dual_lane_plan_ready',
        `Generated plan with ${String(selected.length)} cards`
      ),
    };
  }

  private normalizeLaneMix(mix?: ISchedulerLaneMix): ISchedulerLaneMix {
    if (!mix) {
      return { retention: 0.8, calibration: 0.2 };
    }

    const sum = mix.retention + mix.calibration;
    if (sum <= 0) {
      return { retention: 0.8, calibration: 0.2 };
    }

    return {
      retention: mix.retention / sum,
      calibration: mix.calibration / sum,
    };
  }

  private selectByLaneMix(
    retention: CardId[],
    calibration: CardId[],
    mix: ISchedulerLaneMix,
    maxCards: number
  ): CardId[] {
    const retentionTarget = Math.round(maxCards * mix.retention);
    const calibrationTarget = Math.max(0, maxCards - retentionTarget);

    const retained = retention.slice(0, retentionTarget);
    const calibrated = calibration.slice(0, calibrationTarget);

    const merged = [...retained, ...calibrated];
    if (merged.length >= maxCards) {
      return merged.slice(0, maxCards);
    }

    const fallback = [...retention.slice(retained.length), ...calibration.slice(calibrated.length)];
    return [...merged, ...fallback].slice(0, maxCards);
  }

  private defaultHints(action: string, reasoning: string): IAgentHints {
    return {
      suggestedNextActions: [
        {
          action,
          description: reasoning,
          priority: 'high',
        },
      ],
      relatedResources: [],
      confidence: 1,
      sourceQuality: 'high',
      validityPeriod: 'short',
      contextNeeded: [],
      assumptions: [],
      riskFactors: [],
      dependencies: [],
      estimatedImpact: { benefit: 0.6, effort: 0.2, roi: 3 },
      preferenceAlignment: [],
      reasoning,
    };
  }

  private async persistPlannedCards(
    userId: UserId,
    retentionCardIds: CardId[],
    calibrationCardIds: CardId[],
    selectedCardIds: CardId[]
  ): Promise<void> {
    if (this.repositories === undefined) {
      return;
    }

    const repositories = this.repositories;

    const retentionSet = new Set<CardId>(retentionCardIds);
    const calibrationSet = new Set<CardId>(calibrationCardIds);
    const now = new Date();

    await Promise.all(
      selectedCardIds.map(async (cardId) => {
        const lane: SchedulerLane = retentionSet.has(cardId)
          ? 'retention'
          : calibrationSet.has(cardId)
            ? 'calibration'
            : 'retention';

        const existing = await repositories.schedulerCardRepository.findByCard(userId, cardId);

        if (existing === null) {
          await repositories.schedulerCardRepository.create({
            id: `sc_${randomUUID()}`,
            cardId,
            userId,
            lane,
            stability: null,
            difficultyParameter: null,
            halfLife: null,
            interval: 0,
            nextReviewDate: now.toISOString(),
            lastReviewedAt: null,
            reviewCount: 0,
            lapseCount: 0,
            consecutiveCorrect: 0,
            schedulingAlgorithm: lane === 'retention' ? 'fsrs' : 'hlr',
            cardType: null,
            difficulty: null,
            knowledgeNodeIds: [],
            state: 'new',
            suspendedUntil: null,
            suspendedReason: null,
            version: 1,
          });
          return;
        }

        await repositories.schedulerCardRepository.update(
          userId,
          cardId,
          {
            lane,
            nextReviewDate: now.toISOString(),
            schedulingAlgorithm: lane === 'retention' ? 'fsrs' : 'hlr',
          },
          existing.version
        );
      })
    );
  }
}

export function buildExecutionContext(
  userId: UserId,
  correlationId: CorrelationId
): IExecutionContext {
  return { userId, correlationId };
}
