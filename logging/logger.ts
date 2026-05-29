import { AsyncLocalStorage } from 'node:async_hooks'

import type { Bindings, LoggerOptions } from 'pino'
import pino, { type Logger } from 'pino'

interface RequestLogContext {
  correlationId: string
  logger: Logger
}

/**
 * Como o nível é serializado no log:
 * - `number`: código numérico do Pino, ex. `"level":30` (padrão, comportamento
 *   nativo do Pino).
 * - `label`: string legível, ex. `"level":"info"`.
 *
 * Use `label` quando o consumidor dos logs detecta severidade pelo texto
 * (Dokploy, etc.) e cairia no badge padrão com o código numérico cru.
 */
export type LogLevelFormat = 'label' | 'number'

export const DEFAULT_LOG_LEVEL_FORMAT: LogLevelFormat = 'number'

/**
 * Monta as opções do Pino compartilhadas pela lib, aplicando o formato de
 * nível desejado.
 */
export function buildPinoOptions(
  levelFormat: LogLevelFormat = DEFAULT_LOG_LEVEL_FORMAT,
): LoggerOptions {
  if (levelFormat === 'number') {
    return {}
  }

  return {
    formatters: {
      level(label: string) {
        return { level: label }
      },
    },
  }
}

const requestLogContext = new AsyncLocalStorage<RequestLogContext>()

let baseLogger: Logger = pino(buildPinoOptions())

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
