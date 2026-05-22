export class UnauthorizedError extends Error {
  readonly status = 401

  constructor(message: string = 'Unauthorized', options?: { cause?: unknown }) {
    super(message, options as ErrorOptions | undefined)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends Error {
  readonly status = 403

  constructor(message: string = 'Forbidden', options?: { cause?: unknown }) {
    super(message, options as ErrorOptions | undefined)
    this.name = 'ForbiddenError'
  }
}
