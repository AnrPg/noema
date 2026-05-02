export class GuardianError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'GuardianError';
  }
}

export class GuardianValidationError extends GuardianError {
  constructor(message: string, details?: unknown) {
    super(message, 'GUARDIAN_VALIDATION_ERROR', details);
    this.name = 'GuardianValidationError';
  }
}
