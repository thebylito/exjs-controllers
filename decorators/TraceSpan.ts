import type { Attributes } from '@opentelemetry/api'

import { runWithSpan } from '#exjs-controllers/observability/tracing'

type DecoratedMethod = (this: object, ...args: unknown[]) => unknown
type StandardTraceSpanDecorator = <TMethod extends DecoratedMethod>(
  value: TMethod,
  context: ClassMethodDecoratorContext<object, TMethod>,
) => TMethod

export interface TraceSpanOptions {
  name?: string
  attributes?: Attributes
}

export function TraceSpan(
  name?: string,
  options?: Omit<TraceSpanOptions, 'name'>,
): MethodDecorator & StandardTraceSpanDecorator {
  const resolvedOptions = normalizeTraceSpanOptions(name, options)

  const decorator = (
    valueOrTarget: DecoratedMethod | object,
    ctxOrKey: ClassMethodDecoratorContext<object, DecoratedMethod> | string | symbol,
    descriptor?: PropertyDescriptor,
  ): DecoratedMethod | void => {
    if (isStandardMethodDecoratorContext(ctxOrKey)) {
      const originalMethod = valueOrTarget as DecoratedMethod
      return createWrappedMethod(
        originalMethod,
        String(ctxOrKey.name),
        resolvedOptions,
      )
    }

    if (!descriptor?.value || typeof descriptor.value !== 'function') {
      throw new Error('[TraceSpan] @TraceSpan must decorate a method.')
    }

    descriptor.value = createWrappedMethod(
      descriptor.value as DecoratedMethod,
      String(ctxOrKey),
      resolvedOptions,
    )
  }

  return decorator as MethodDecorator & StandardTraceSpanDecorator
}

function normalizeTraceSpanOptions(
  name?: string,
  options?: Omit<TraceSpanOptions, 'name'>,
): TraceSpanOptions {
  return {
    name,
    attributes: options?.attributes,
  }
}

function createWrappedMethod(
  originalMethod: DecoratedMethod,
  methodName: string,
  options: TraceSpanOptions,
): DecoratedMethod {
  return function tracedMethod(this: object, ...args: unknown[]): unknown {
    const handlerName = resolveDefaultSpanName(this, methodName)

    return runWithSpan(
      {
        name: options.name ?? handlerName,
        attributes: {
          ...options.attributes,
          'http.handler.name': handlerName,
          'http.handler.method': methodName,
        },
      },
      () => originalMethod.apply(this, args),
    )
  }
}

function resolveDefaultSpanName(instance: object, methodName: string): string {
  const ctorName = instance.constructor?.name

  if (typeof ctorName === 'string' && ctorName.length > 0) {
    return `${ctorName}.${methodName}`
  }

  return methodName
}

function isStandardMethodDecoratorContext(
  value: ClassMethodDecoratorContext<object, DecoratedMethod> | string | symbol,
): value is ClassMethodDecoratorContext<object, DecoratedMethod> {
  return typeof value === 'object' && value !== null && 'kind' in value
}
