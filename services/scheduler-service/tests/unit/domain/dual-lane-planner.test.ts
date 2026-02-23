/**
 * Dual-Lane Planner v2 — Unit Tests
 *
 * Tests the improved selectByLaneMix algorithm with:
 * - Priority-based card selection (highest scores first)
 * - Urgency-aware spillover from highest priority remainders
 * - Ratio-based interleaving (R R R R C pattern for 80/20)
 * - Block ordering when interleave=false
 * - Rich per-card metadata in plan output
 * - Backward compatibility (no scores → original insertion order)
 * - Edge cases (empty pools, single lane, maxCards=1, all spillover)
 */

import { describe, expect, it, vi } from 'vitest';

import { SchedulerService } from '../../../src/domain/scheduler-service/scheduler.service.js';
import type { IEventPublisher } from '../../../src/domain/shared/event-publisher.js';
import type {
  CardId,
  CorrelationId,
  ISchedulerLaneMix,
  UserId,
} from '../../../src/types/scheduler.types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockPublisher(): IEventPublisher {
  return { publish: vi.fn().mockResolvedValue(undefined) };
}

function svc(): SchedulerService {
  return new SchedulerService(mockPublisher());
}

/**
 * Shorthand card IDs — selectByLaneMix operates on raw CardId strings with no
 * Zod validation, so concise IDs are fine for unit tests.
 */
function cids(prefix: string, count: number): CardId[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1)}` as CardId);
}

/** Generate a valid branded user ID (user_ + 21 alphanum). */
function uid(tag: string): UserId {
  return `user_${tag.padEnd(21, 'x').slice(0, 21)}` as UserId;
}

/** Generate a valid branded correlation ID. */
function cid(tag: string): CorrelationId {
  return `correlation_${tag.padEnd(21, 'x').slice(0, 21)}` as CorrelationId;
}

/** Generate valid branded card IDs (card_ + 21 alphanum). */
function validCardIds(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const idx = String(i + 1).padStart(3, '0');
    return `card_${prefix}${idx}${'a'.repeat(Math.max(0, 21 - prefix.length - idx.length))}`;
  });
}

const MIX_80_20: ISchedulerLaneMix = { retention: 0.8, calibration: 0.2 };
const MIX_50_50: ISchedulerLaneMix = { retention: 0.5, calibration: 0.5 };
const MIX_100_0: ISchedulerLaneMix = { retention: 1.0, calibration: 0.0 };
const MIX_0_100: ISchedulerLaneMix = { retention: 0.0, calibration: 1.0 };

// ---------------------------------------------------------------------------
// Priority-Based Selection
// ---------------------------------------------------------------------------

describe('selectByLaneMix — priority-based selection', () => {
  it('selects highest-scored retention cards first', () => {
    const s = svc();
    const r = cids('r', 5);
    const c = cids('c', 5);
    const scores: Record<string, number> = {
      r1: 0.1,
      r2: 0.9,
      r3: 0.5,
      r4: 0.3,
      r5: 0.7,
    };

    const res = s.selectByLaneMix(r, c, MIX_80_20, 5, scores, false);

    // 80% of 5 = 4 retention. Highest: r2(0.9), r5(0.7), r3(0.5), r4(0.3)
    const retCards = res.cardDetails.filter((d) => d.lane === 'retention' && !d.isSpillover);
    expect(retCards.map((d) => d.cardId)).toEqual(['r2', 'r5', 'r3', 'r4']);
  });

  it('selects highest-scored calibration cards first', () => {
    const s = svc();
    const r = cids('r', 5);
    const c = cids('c', 5);
    const scores: Record<string, number> = {
      c1: 0.2,
      c2: 0.8,
      c3: 0.1,
      c4: 0.6,
      c5: 0.4,
    };

    const res = s.selectByLaneMix(r, c, MIX_50_50, 4, scores, false);

    // 50% of 4 = 2 calibration. Highest: c2(0.8), c4(0.6)
    const calCards = res.cardDetails.filter((d) => d.lane === 'calibration' && !d.isSpillover);
    expect(calCards.map((d) => d.cardId)).toEqual(['c2', 'c4']);
  });

  it('preserves insertion order when no scores (backward compat)', () => {
    const s = svc();
    const r = cids('r', 5);
    const c = cids('c', 3);

    const res = s.selectByLaneMix(r, c, MIX_80_20, 5, {}, false);

    const retCards = res.cardDetails.filter((d) => d.lane === 'retention' && !d.isSpillover);
    expect(retCards.map((d) => d.cardId)).toEqual(['r1', 'r2', 'r3', 'r4']);
  });

  it('includes correct score in cardDetails', () => {
    const s = svc();
    const scores: Record<string, number> = { r1: 0.42, c1: 0.99 };

    const res = s.selectByLaneMix(['r1' as CardId], ['c1' as CardId], MIX_50_50, 2, scores, false);

    expect(res.cardDetails.find((d) => d.cardId === 'r1')?.score).toBe(0.42);
    expect(res.cardDetails.find((d) => d.cardId === 'c1')?.score).toBe(0.99);
  });

  it('defaults score to 0 for cards without scores', () => {
    const s = svc();
    const res = s.selectByLaneMix(['r1' as CardId], ['c1' as CardId], MIX_50_50, 2, {}, false);

    expect(res.cardDetails.every((d) => d.score === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Spillover
// ---------------------------------------------------------------------------

describe('selectByLaneMix — urgency-aware spillover', () => {
  it('fills remaining slots from other lane when primary pool is exhausted', () => {
    const s = svc();
    const r = cids('r', 2); // Only 2, but 80% of 10 = 8 needed
    const c = cids('c', 10);

    const res = s.selectByLaneMix(r, c, MIX_80_20, 10, {}, false);

    expect(res.selectedCardIds.length).toBe(10);
    expect(res.cardDetails.filter((d) => d.isSpillover).length).toBe(6);
  });

  it('spillover selects by priority from the remaining pool', () => {
    const s = svc();
    const r = cids('r', 1);
    const c = cids('c', 10);
    const scores: Record<string, number> = {
      c1: 0.1,
      c2: 0.9,
      c3: 0.5,
      c4: 0.3,
      c5: 0.7,
      c6: 0.2,
      c7: 0.8,
      c8: 0.4,
      c9: 0.6,
      c10: 0.05,
    };

    const res = s.selectByLaneMix(r, c, MIX_80_20, 10, scores, false);

    // Primary: 1 retention, 2 calibration (highest: c2(0.9), c7(0.8))
    // Spillover needs 7 from remaining calibration by priority
    const spillover = res.cardDetails.filter((d) => d.isSpillover);
    expect(spillover.length).toBe(7);
    expect(spillover.map((d) => d.cardId)).toEqual(['c5', 'c9', 'c3', 'c8', 'c4', 'c6', 'c1']);
  });

  it('reports retentionSpillover when retention fills calibration slots', () => {
    const s = svc();
    const r = cids('r', 10);

    const res = s.selectByLaneMix(r, [], MIX_80_20, 10, {}, false);

    expect(res.retentionSpillover).toBe(2);
    expect(res.calibrationSpillover).toBe(0);
  });

  it('reports calibrationSpillover when calibration fills retention slots', () => {
    const s = svc();
    const c = cids('c', 10);

    const res = s.selectByLaneMix([], c, MIX_80_20, 10, {}, false);

    expect(res.calibrationSpillover).toBe(8);
    expect(res.retentionSpillover).toBe(0);
  });

  it('no spillover when both pools are sufficient', () => {
    const s = svc();
    const res = s.selectByLaneMix(cids('r', 10), cids('c', 10), MIX_80_20, 10, {}, false);

    expect(res.retentionSpillover).toBe(0);
    expect(res.calibrationSpillover).toBe(0);
    expect(res.cardDetails.filter((d) => d.isSpillover).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Interleaving
// ---------------------------------------------------------------------------

describe('selectByLaneMix — interleaving', () => {
  it('produces R R R R C R R R R C for 80/20 mix', () => {
    const s = svc();
    const res = s.selectByLaneMix(cids('r', 8), cids('c', 2), MIX_80_20, 10, {}, true);

    const lanes = res.cardDetails.map((d) => d.lane);
    expect(lanes).toEqual([
      'retention',
      'retention',
      'retention',
      'retention',
      'calibration',
      'retention',
      'retention',
      'retention',
      'retention',
      'calibration',
    ]);
  });

  it('produces R C R C R C for 50/50 mix', () => {
    const s = svc();
    const res = s.selectByLaneMix(cids('r', 3), cids('c', 3), MIX_50_50, 6, {}, true);

    const lanes = res.cardDetails.map((d) => d.lane);
    // ratio = 1:1 → alternating R C R C R C
    expect(lanes).toEqual([
      'retention',
      'calibration',
      'retention',
      'calibration',
      'retention',
      'calibration',
    ]);
  });

  it('block-orders when interleave=false', () => {
    const s = svc();
    const res = s.selectByLaneMix(cids('r', 4), cids('c', 1), MIX_80_20, 5, {}, false);

    const lanes = res.cardDetails.map((d) => d.lane);
    expect(lanes).toEqual(['retention', 'retention', 'retention', 'retention', 'calibration']);
  });

  it('handles 100% retention with interleaving', () => {
    const s = svc();
    const res = s.selectByLaneMix(cids('r', 5), cids('c', 5), MIX_100_0, 5, {}, true);

    expect(res.cardDetails.every((d) => d.lane === 'retention')).toBe(true);
  });

  it('handles 100% calibration with interleaving', () => {
    const s = svc();
    const res = s.selectByLaneMix(cids('r', 5), cids('c', 5), MIX_0_100, 5, {}, true);

    expect(res.cardDetails.every((d) => d.lane === 'calibration')).toBe(true);
  });

  it('spillover appended after interleaved primary cards', () => {
    const s = svc();
    const res = s.selectByLaneMix(cids('r', 2), cids('c', 5), MIX_80_20, 5, {}, true);

    const spilloverStart = res.cardDetails.findIndex((d) => d.isSpillover);
    if (spilloverStart >= 0) {
      expect(res.cardDetails.slice(0, spilloverStart).every((d) => !d.isSpillover)).toBe(true);
      expect(res.cardDetails.slice(spilloverStart).every((d) => d.isSpillover)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Card Details Metadata
// ---------------------------------------------------------------------------

describe('selectByLaneMix — card details metadata', () => {
  it('assigns sequential positions starting at 0', () => {
    const s = svc();
    const res = s.selectByLaneMix(cids('r', 3), cids('c', 2), MIX_50_50, 4, {}, false);

    expect(res.cardDetails.map((d) => d.position)).toEqual([0, 1, 2, 3]);
  });

  it('marks spillover cards correctly', () => {
    const s = svc();
    const res = s.selectByLaneMix(cids('r', 1), cids('c', 5), MIX_80_20, 5, {}, false);

    const primary = res.cardDetails.filter((d) => !d.isSpillover);
    const spill = res.cardDetails.filter((d) => d.isSpillover);

    expect(primary.length).toBe(2); // 1 retention + 1 calibration
    expect(spill.length).toBe(3);
    expect(spill.every((d) => d.lane === 'calibration')).toBe(true);
  });

  it('correctly reports lane for each card', () => {
    const s = svc();
    const res = s.selectByLaneMix(
      ['ra' as CardId, 'rb' as CardId],
      ['ca' as CardId, 'cb' as CardId],
      MIX_50_50,
      4,
      {},
      false
    );

    for (const d of res.cardDetails) {
      if (d.cardId.startsWith('r')) expect(d.lane).toBe('retention');
      else expect(d.lane).toBe('calibration');
    }
  });
});

// ---------------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------------

describe('selectByLaneMix — edge cases', () => {
  it('empty retention → all from calibration', () => {
    const s = svc();
    const res = s.selectByLaneMix([], cids('c', 5), MIX_80_20, 5, {}, false);

    expect(res.selectedCardIds.length).toBe(5);
    expect(res.cardDetails.every((d) => d.lane === 'calibration')).toBe(true);
  });

  it('empty calibration → all from retention', () => {
    const s = svc();
    const res = s.selectByLaneMix(cids('r', 5), [], MIX_80_20, 5, {}, false);

    expect(res.selectedCardIds.length).toBe(5);
    expect(res.cardDetails.every((d) => d.lane === 'retention')).toBe(true);
  });

  it('both pools empty → empty plan', () => {
    const s = svc();
    const res = s.selectByLaneMix([], [], MIX_80_20, 10, {}, false);

    expect(res.selectedCardIds).toEqual([]);
    expect(res.cardDetails).toEqual([]);
    expect(res.retentionSpillover).toBe(0);
    expect(res.calibrationSpillover).toBe(0);
  });

  it('maxCards=1 selects one card', () => {
    const s = svc();
    const res = s.selectByLaneMix(['r1' as CardId], ['c1' as CardId], MIX_80_20, 1, {}, false);

    expect(res.selectedCardIds.length).toBe(1);
    expect(res.selectedCardIds[0]).toBe('r1'); // 80% of 1 rounds to 1 retention
  });

  it('maxCards exceeds total available → returns all', () => {
    const s = svc();
    const res = s.selectByLaneMix(cids('r', 2), cids('c', 1), MIX_80_20, 100, {}, false);

    expect(res.selectedCardIds.length).toBe(3);
  });

  it('all spillover when pool is on wrong side', () => {
    const s = svc();
    const res = s.selectByLaneMix([], cids('c', 5), MIX_100_0, 5, {}, false);

    expect(res.selectedCardIds.length).toBe(5);
    expect(res.cardDetails.filter((d) => d.isSpillover).length).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// planDualLaneQueue — integration (Zod validation → event publishing)
// ---------------------------------------------------------------------------

describe('planDualLaneQueue — full method', () => {
  const testUserId = uid('plantest1');
  const testCorrId = cid('corr1');

  it('returns v2 plan with all metadata', async () => {
    const pub = mockPublisher();
    const s = new SchedulerService(pub);
    const rCards = validCardIds('r', 8);
    const cCards = validCardIds('c', 2);

    const res = await s.planDualLaneQueue(
      {
        userId: testUserId,
        retentionCardIds: rCards,
        calibrationCardIds: cCards,
        maxCards: 10,
        interleave: true,
      },
      { userId: testUserId, correlationId: testCorrId }
    );

    expect(res.data.planVersion).toBe('v2');
    expect(res.data.selectedCardIds.length).toBe(10);
    expect(res.data.cardDetails.length).toBe(10);
    expect(res.data.retentionSelected).toBe(8);
    expect(res.data.calibrationSelected).toBe(2);
    expect(res.data.retentionSpillover).toBe(0);
    expect(res.data.calibrationSpillover).toBe(0);
    expect(res.data.rationale).toContain('interleave=true');
  });

  it('publishes event with spillover metadata', async () => {
    const pub = mockPublisher();
    const s = new SchedulerService(pub);

    await s.planDualLaneQueue(
      {
        userId: testUserId,
        retentionCardIds: validCardIds('r', 2),
        calibrationCardIds: validCardIds('c', 10),
        maxCards: 10,
        interleave: false,
      },
      { userId: testUserId, correlationId: testCorrId }
    );

    expect(pub.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'schedule.dual_lane.planned',
        payload: expect.objectContaining({
          interleaved: false,
          retentionSpillover: expect.any(Number),
          calibrationSpillover: expect.any(Number),
        }),
      })
    );
  });

  it('uses cardPriorityScores when provided', async () => {
    const pub = mockPublisher();
    const s = new SchedulerService(pub);
    const rCards = validCardIds('r', 3);
    const scores: Record<string, number> = {
      [rCards[0]!]: 0.1,
      [rCards[1]!]: 0.9,
      [rCards[2]!]: 0.5,
    };

    const res = await s.planDualLaneQueue(
      {
        userId: testUserId,
        retentionCardIds: rCards,
        calibrationCardIds: [],
        maxCards: 2,
        cardPriorityScores: scores,
      },
      { userId: testUserId, correlationId: testCorrId }
    );

    // Top 2 by score: rCards[1](0.9), rCards[2](0.5)
    expect(res.data.selectedCardIds).toContain(rCards[1]);
    expect(res.data.selectedCardIds).toContain(rCards[2]);
    expect(res.data.selectedCardIds).not.toContain(rCards[0]);
  });

  it('defaults interleave to true', async () => {
    const pub = mockPublisher();
    const s = new SchedulerService(pub);

    const res = await s.planDualLaneQueue(
      {
        userId: testUserId,
        retentionCardIds: validCardIds('r', 4),
        calibrationCardIds: validCardIds('c', 1),
        maxCards: 5,
      },
      { userId: testUserId, correlationId: testCorrId }
    );

    expect(res.data.rationale).toContain('interleave=true');
  });
});

// ---------------------------------------------------------------------------
// normalizeLaneMix — via planDualLaneQueue
// ---------------------------------------------------------------------------

describe('normalizeLaneMix — via plan results', () => {
  const testUserId = uid('normtest1');
  const testCorrId = cid('corrnorm1');

  it('normalizes 60/40 mix to sum 1.0', async () => {
    const s = new SchedulerService(mockPublisher());

    const res = await s.planDualLaneQueue(
      {
        userId: testUserId,
        retentionCardIds: validCardIds('r', 10),
        calibrationCardIds: validCardIds('c', 10),
        targetMix: { retention: 0.6, calibration: 0.4 },
        maxCards: 10,
      },
      { userId: testUserId, correlationId: testCorrId }
    );

    expect(res.data.laneMix.retention + res.data.laneMix.calibration).toBeCloseTo(1.0);
    expect(res.data.retentionSelected).toBe(6);
    expect(res.data.calibrationSelected).toBe(4);
  });

  it('defaults to 80/20 when no mix provided', async () => {
    const s = new SchedulerService(mockPublisher());

    const res = await s.planDualLaneQueue(
      {
        userId: testUserId,
        retentionCardIds: validCardIds('r', 10),
        calibrationCardIds: validCardIds('c', 10),
        maxCards: 10,
      },
      { userId: testUserId, correlationId: testCorrId }
    );

    expect(res.data.laneMix).toEqual({ retention: 0.8, calibration: 0.2 });
    expect(res.data.retentionSelected).toBe(8);
    expect(res.data.calibrationSelected).toBe(2);
  });
});
