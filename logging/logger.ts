import { AsyncLocalStorage } from 'node:async_hooks'

import { isSpanContextValid, trace } from '@opentelemetry/api'
import type { Bindings, Level, LoggerOptions } from 'pino'
import pino, { type Logger } from 'pino'

export interface RequestLogContext {
  correlationId: string
  logger: Logger
  traceId?: string
  spanId?: string
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
 * nível desejado e, opcionalmente, o nível mínimo de log.
 *
 * Sem `level` o Pino usa seu default (`info`); passe `debug`/`trace` para
 * expor logs mais verbosos. O nível é herdado pelos child loggers criados
 * por request, então setá-lo aqui afeta todo o pipeline de logging.
 */
export function buildPinoOptions(
  levelFormat: LogLevelFormat = DEFAULT_LOG_LEVEL_FORMAT,
  level?: Level,
): LoggerOptions {
  const options: LoggerOptions = { mixin: traceContextMixin }

  if (level) {
    options.level = level
  }

  if (levelFormat === 'label') {
    options.formatters = {
      level(label: string) {
        return { level: label }
      },
    }
  }

  return options
}

/**
 * Mixin do Pino que carimba `traceId`/`spanId` do span OpenTelemetry ativo em
 * cada log emitido enquanto há um span corrente (ex.: dentro de um handler de
 * controller). Sem provider OTel registrado os spans são no-op (contexto
 * inválido) e nada é adicionado.
 */
function traceContextMixin(): Bindings {
  const span = trace.getActiveSpan()
  if (!span) {
    return {}
  }

  const spanContext = span.spanContext()
  if (!isSpanContextValid(spanContext)) {
    return {}
  }

  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
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

/**
 * Fixa o contexto de trace na request de log para que o log de acesso HTTP —
 * emitido no evento `close`, já fora do span ativo e do AsyncLocalStorage —
 * também carregue traceId/spanId. Vence o primeiro span (o mais externo,
 * normalmente o do controller): o spanId fica estável para o log de acesso,
 * enquanto logs intermediários recebem o span corrente via {@link buildPinoOptions} mixin.
 */
export function captureRequestTraceContext(
  traceId: string,
  spanId: string,
): void {
  const activeContext = requestLogContext.getStore()

  if (!activeContext || activeContext.traceId) {
    return
  }

  activeContext.traceId = traceId
  activeContext.spanId = spanId
}
