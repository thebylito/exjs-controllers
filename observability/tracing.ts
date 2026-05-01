import {
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
} from '@opentelemetry/api'

const DEFAULT_TRACER_NAME = 'exjs-controllers'

export interface RunWithSpanOptions {
  name: string
  attributes?: Attributes
}

export interface RunWithControllerSpanOptions {
  controllerName: string
  handlerName: string
  httpMethod: string
  routePath: string
}

export function runWithSpan<T>(
  options: RunWithSpanOptions,
  callback: () => Promise<T> | T,
): Promise<T> | T {
  const tracer = trace.getTracer(DEFAULT_TRACER_NAME)

  return tracer.startActiveSpan(
    options.name,
    { attributes: options.attributes },
    (span) => runSpanCallback(span, callback),
  )
}

export function runWithControllerSpan<T>(
  options: RunWithControllerSpanOptions,
  callback: () => Promise<T> | T,
): Promise<T> | T {
  const handlerName = `${options.controllerName}.${options.handlerName}`

  return runWithSpan(
    {
      name: handlerName,
      attributes: {
        'http.controller.name': options.controllerName,
        'http.controller.handler': options.handlerName,
        'http.handler.name': handlerName,
        'http.handler.method': options.handlerName,
        'http.method': options.httpMethod.toUpperCase(),
        'http.route': options.routePath,
      },
    },
    callback,
  )
}

function runSpanCallback<T>(
  span: Span,
  callback: () => Promise<T> | T,
): Promise<T> | T {
  try {
    const result = callback()

    if (isPromiseLike(result)) {
      return result
        .catch((error) => {
          markSpanAsError(span, error)
          throw error
        })
        .finally(() => {
          span.end()
        })
    }

    span.end()
    return result
  } catch (error) {
    markSpanAsError(span, error)

    span.end()
    throw error
  }
}

function markSpanAsError(span: Span, error: unknown): void {
  if (error instanceof Error) {
    span.recordException(error)
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    })
    return
  }

  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: 'unhandled non-error exception',
  })
}

function isPromiseLike<T>(value: Promise<T> | T): value is Promise<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  )
}
