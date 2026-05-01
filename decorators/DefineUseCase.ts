import { BaseSchema } from '#exjs-controllers/schemas/BaseSchema'
import { validateUseCaseInput } from '#exjs-controllers/core/UseCase'
import { runWithSpan } from '#exjs-controllers/observability/tracing'

type ControllerMethod = (this: object, ...args: unknown[]) => unknown

interface UseCaseLike {
  execute(input: BaseSchema): unknown
}

interface UseCaseDecoratorTarget {
  execute(...args: unknown[]): unknown
}

export function DefineUseCase() {
  return function (
    target: new (...args: any[]) => UseCaseDecoratorTarget,
    _ctxOrUndefined?: ClassDecoratorContext,
  ): void {
    wrapUseCaseExecute(target.prototype, target.name)
  }
}

export function ExecuteUseCase(useCaseProperty: string | symbol) {
  return function (
    valueOrTarget: ControllerMethod | object,
    ctxOrKey: ClassMethodDecoratorContext | string,
    descriptor?: PropertyDescriptor,
  ): void | ControllerMethod {
    if (typeof ctxOrKey === 'object' && ctxOrKey !== null && 'kind' in ctxOrKey) {
      const originalMethod = valueOrTarget as ControllerMethod
      return createWrappedMethod(originalMethod, useCaseProperty)
    }

    if (!descriptor?.value || typeof descriptor.value !== 'function') {
      throw new Error('[UseCaseController] @ExecuteUseCase must decorate a method.')
    }

    descriptor.value = createWrappedMethod(
      descriptor.value as ControllerMethod,
      useCaseProperty,
    )
  }
}

function wrapUseCaseExecute(
  target: UseCaseDecoratorTarget,
  useCaseName: string,
): void {
  if (!target.execute || typeof target.execute !== 'function') {
    throw new Error(
      `[UseCaseController] @UseCaseController requires an execute(input, ...) method in ${useCaseName}.`,
    )
  }

  const originalExecute = target.execute

  target.execute = function wrappedUseCaseExecute(
    this: object,
    ...args: unknown[]
  ): unknown {
    const handlerName = `${useCaseName}.execute`

    return runWithSpan(
      {
        name: handlerName,
        attributes: {
          'exjs.handler.name': handlerName,
          'exjs.handler.method': 'execute',
          'exjs.use_case.name': useCaseName,
          'exjs.use_case.method': 'execute',
        },
      },
      () => {
        validateUseCaseExecution(args, useCaseName)
        return originalExecute.apply(this, args)
      },
    )
  }
}

function validateUseCaseExecution(args: unknown[], useCaseName: string): void {
  const [input] = args
  validateUseCaseInput(input, useCaseName)
}

function createWrappedMethod(
  originalMethod: ControllerMethod,
  useCaseProperty: string | symbol,
): ControllerMethod {
  return function wrappedControllerMethod(
    this: object,
    ...args: unknown[]
  ): unknown {
    const result = originalMethod.apply(this, args)

    if (isPromiseLike(result)) {
      return result.then((resolvedResult) =>
        dispatchToUseCase(this, useCaseProperty, args, resolvedResult),
      )
    }

    return dispatchToUseCase(this, useCaseProperty, args, result)
  }
}

function dispatchToUseCase(
  controllerInstance: object,
  useCaseProperty: string | symbol,
  args: unknown[],
  result: unknown,
): unknown {
  const useCase = (controllerInstance as Record<string | symbol, unknown>)[
    useCaseProperty
  ] as UseCaseLike | undefined

  if (!useCase || typeof useCase.execute !== 'function') {
    throw new Error(
      `[UseCaseController] Property "${String(useCaseProperty)}" must expose execute(input).`,
    )
  }

  const input = resolveUseCaseInput(args, result)

  return useCase.execute(input)
}

function resolveUseCaseInput(args: unknown[], result: unknown): BaseSchema {
  if (result instanceof BaseSchema) {
    return result
  }

  const firstSchemaArg = args.find((arg) => arg instanceof BaseSchema)
  if (firstSchemaArg instanceof BaseSchema) {
    return firstSchemaArg
  }

  throw new Error(
    '[UseCaseController] Method must return a BaseSchema or receive at least one BaseSchema argument.',
  )
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof (value as Promise<unknown>).then === 'function'
  )
}
