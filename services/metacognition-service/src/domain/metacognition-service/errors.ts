export class MetacognitionError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  public constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'MetacognitionError';
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends MetacognitionError {
  public constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, details);
    this.name = 'ValidationError';
  }
}

export class EvaluationConflictError extends MetacognitionError {
  public constructor(stepId: string) {
    super('EVALUATION_ALREADY_EXISTS', `Evaluation already exists for step ${stepId}`);
    this.name = 'EvaluationConflictError';
  }
}
