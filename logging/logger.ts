import { AsyncLocalStorage } from 'node:async_hooks'

import type { Bindings } from 'pino'
import pino, { type Logger } from 'pino'

interface RequestLogContext {
  correlationId: string
  logger: Logger
}

const requestLogContext = new AsyncLocalStorage<RequestLogContext>()

let baseLogger: Logger = pino()

export const logger = new Proxy({} as Logger, {
  get(_target, prop, receiver) {
    const activeLogger = requestLogContext.getStore()?.logger ?? baseLogger
    return Reflect.get(activeLogger, prop, receiver)
  },
})

export function setBaseLogger(nextLogger: Logger): void {
  baseLogger = nextLogger
}

export function runWithRequestLoggerContext<T>(
  context: RequestLogContext,
  callback: () => T,
): T {
  return requestLogContext.run(context, callback)
}

export function appendRequestLoggerBindings(bindings: Bindings): void {
  const activeContext = requestLogContext.getStore()

  if (!activeContext) {
    return
  }

  activeContext.logger = activeContext.logger.child(bindings)
}

export function getCorrelationId(): string | undefined {
  return requestLogContext.getStore()?.correlationId
}
