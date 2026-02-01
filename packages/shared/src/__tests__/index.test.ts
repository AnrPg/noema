// =============================================================================
// SHARED PACKAGE TESTS
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  createScheduler,
  toRating,
  type Rating,
  type SchedulerType,
} from "../index";

describe("Scheduler", () => {
  describe("createScheduler", () => {
    it("should create an FSRS scheduler by default", () => {
      const scheduler = createScheduler("fsrs");
      expect(scheduler).toBeDefined();
      expect(scheduler.schedule).toBeDefined();
      expect(scheduler.scheduleRating).toBeDefined();
    });

    it("should create an HLR scheduler", () => {
      const scheduler = createScheduler("hlr");
      expect(scheduler).toBeDefined();
    });
  });

  describe("scheduleRating", () => {
    it("should return scheduling result for a new card", () => {
      const scheduler = createScheduler("fsrs");
      const result = scheduler.scheduleRating(
        {
          state: "new",
          stability: 0,
          difficulty: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          lastReviewDate: null,
        },
        "good",
      );

      expect(result).toBeDefined();
      expect(result.interval).toBeGreaterThan(0);
      expect(result.stability).toBeGreaterThan(0);
      expect(result.difficulty).toBeGreaterThanOrEqual(0);
      expect(result.dueDate).toBeInstanceOf(Date);
    });
  });
});

describe("Rating Utilities", () => {
  describe("toRating", () => {
    it('should convert numeric rating 1 to "again"', () => {
      expect(toRating(1)).toBe("again");
    });

    it('should convert numeric rating 2 to "hard"', () => {
      expect(toRating(2)).toBe("hard");
    });

    it('should convert numeric rating 3 to "good"', () => {
      expect(toRating(3)).toBe("good");
    });

    it('should convert numeric rating 4 to "easy"', () => {
      expect(toRating(4)).toBe("easy");
    });
  });
});
