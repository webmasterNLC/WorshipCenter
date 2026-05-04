// Typed auth errors thrown by Server Actions and route handlers.
// Caught at the boundary and converted to UI-safe responses.
export class UnauthorizedError extends Error {
  readonly code = 'UNAUTHORIZED';
  constructor(message = 'Authentication required.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN';
  constructor(message = 'You do not have permission to perform this action.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND';
  constructor(resource = 'Resource') {
    super(`${resource} not found.`);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  readonly code = 'VALIDATION';
  readonly issues: unknown;
  constructor(issues: unknown, message = 'Invalid input.') {
    super(message);
    this.name = 'ValidationError';
    this.issues = issues;
  }
}
