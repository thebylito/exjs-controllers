import { validateUseCaseInput } from '#exjs-controllers/core/UseCase'
import { runWithSpan } from '#exjs-controllers/observability/tracing'

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

function wrapUseCaseExecute(
  target: UseCaseDecoratorTarget,
  useCaseName: string,
): void {
  if (!target.execute || typeof target.execute !== 'function') {
    throw new Error(
      `[UseCaseController] @DefineUseCase requires an execute(input, ...) method in ${useCaseName}.`,
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
        const [input] = args
        validateUseCaseInput(input, useCaseName)
        return originalExecute.apply(this, args)
      },
    )
  }
}
