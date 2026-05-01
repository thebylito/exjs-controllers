import { ZodError } from 'zod'
import { BaseSchema } from '#exjs-controllers/schemas/BaseSchema'

export interface UseCaseContract<TInput, TOutput> {
  execute(input: TInput, ...args: unknown[]): TOutput | Promise<TOutput>
}

export type UseCase<TInput extends BaseSchema, TOutput> = UseCaseContract<
  TInput,
  TOutput
>

export class UseCaseInputValidationError extends Error {
  readonly statusCode = 422
  readonly issues: ZodError['issues']

  constructor(useCaseName: string, cause: ZodError) {
    super(
      `[UseCase] Invalid input for ${useCaseName}.execute. Ensure all required fields are present after any merge() operations.`,
    )
    this.name = 'UseCaseInputValidationError'
    this.issues = cause.issues
  }
}

export function validateUseCaseInput(input: unknown, useCaseName: string): void {
  if (!(input instanceof BaseSchema)) {
    throw new Error(
      `[UseCase] First argument for ${useCaseName}.execute is required and must extend BaseSchema.`,
    )
  }

  try {
    input.validate()
  } catch (error) {
    if (error instanceof ZodError) {
      throw new UseCaseInputValidationError(useCaseName, error)
    }

    throw error
  }
}
