export class GamificationError extends Error {
  constructor(
    message: string,
    public readonly code = 'GAMIFICATION_ERROR',
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'GamificationError';
  }
}

export class ProjectionNotFoundError extends GamificationError {
  constructor(userId: string, studyMode: string) {
    super('Gamification projection not found', 'PROJECTION_NOT_FOUND', { userId, studyMode });
  }
}
