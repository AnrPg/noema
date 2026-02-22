import type { IAgentHints } from '@noema/contracts';
import { jwtVerify, SignJWT } from 'jose';

import type {
  AdaptiveCheckpointSignal,
  CardId,
  CorrelationId,
  IDualLanePlan,
  IDualLanePlanInput,
  IExecutionContext,
  IOfflineIntentToken,
  IOfflineIntentTokenClaims,
  IOfflineIntentTokenInput,
  ISchedulerLaneMix,
  IVerifyOfflineIntentTokenResult,
  UserId,
} from '../../types/scheduler.types.js';
import type { IEventPublisher } from '../shared/event-publisher.js';
import {
  DualLanePlanInputSchema,
  OfflineIntentTokenInputSchema,
  VerifyOfflineIntentTokenInputSchema,
} from './scheduler.schemas.js';

export interface IServiceResult<T> {
  data: T;
  agentHints: IAgentHints;
}

export interface ISchedulerServiceConfig {
  serviceVersion: string;
  offlineIntentTokenSecret: string;
  offlineIntentTokenIssuer: string;
  offlineIntentTokenAudience: string;
}

export class SchedulerService {
  private readonly jwtSecret: Uint8Array;

  constructor(
    private readonly eventPublisher: IEventPublisher,
    private readonly config: ISchedulerServiceConfig
  ) {
    this.jwtSecret = new TextEncoder().encode(config.offlineIntentTokenSecret);
  }

  async planDualLaneQueue(
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<IDualLanePlan>> {
    const parsed = DualLanePlanInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error('Invalid dual-lane plan input');
    }

    const data = parsed.data as IDualLanePlanInput;
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

  async issueOfflineIntentToken(
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<IOfflineIntentToken>> {
    const parsed = OfflineIntentTokenInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error('Invalid offline intent token input');
    }

    const data = parsed.data as IOfflineIntentTokenInput;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + data.expiresInSeconds * 1000);

    const claims: IOfflineIntentTokenClaims = {
      tokenVersion: 'v1',
      userId: data.userId,
      sessionBlueprint: data.sessionBlueprint as IOfflineIntentTokenClaims['sessionBlueprint'],
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      nonce: crypto.randomUUID(),
    };

    const token = await new SignJWT(claims as unknown as Record<string, unknown>)
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt(Math.floor(now.getTime() / 1000))
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .setIssuer(this.config.offlineIntentTokenIssuer)
      .setAudience(this.config.offlineIntentTokenAudience)
      .setJti(claims.nonce)
      .sign(this.jwtSecret);

    await this.eventPublisher.publish({
      eventType: 'schedule.intent_token.issued',
      aggregateType: 'Schedule',
      aggregateId: data.userId,
      payload: {
        expiresAt: claims.expiresAt,
        nonce: claims.nonce,
      },
      metadata: {
        correlationId: ctx.correlationId,
        userId: ctx.userId,
      },
    });

    return {
      data: {
        token,
        expiresAt: claims.expiresAt,
      },
      agentHints: this.defaultHints(
        'persist_intent_token',
        'Store token offline for later session replay'
      ),
    };
  }

  async verifyOfflineIntentToken(
    input: unknown,
    _ctx: IExecutionContext
  ): Promise<IServiceResult<IVerifyOfflineIntentTokenResult>> {
    const parsed = VerifyOfflineIntentTokenInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error('Invalid verify intent token input');
    }

    try {
      const { payload } = await jwtVerify(parsed.data.token, this.jwtSecret, {
        issuer: this.config.offlineIntentTokenIssuer,
        audience: this.config.offlineIntentTokenAudience,
      });

      const claims = payload as unknown as IOfflineIntentTokenClaims;
      const checkpointSignals =
        (claims.sessionBlueprint as { checkpointSignals?: AdaptiveCheckpointSignal[] })
          .checkpointSignals ?? [];

      return {
        data: {
          valid: true,
          userId: claims.userId,
          expiresAt: claims.expiresAt,
          checkpointSignals,
        },
        agentHints: this.defaultHints('resume_offline_session', 'Intent token is valid'),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Token verification failed';
      return {
        data: {
          valid: false,
          reason: message,
        },
        agentHints: this.defaultHints('request_new_intent_token', `Token invalid: ${message}`),
      };
    }
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
}

export function buildExecutionContext(
  userId: UserId,
  correlationId: CorrelationId
): IExecutionContext {
  return { userId, correlationId };
}
