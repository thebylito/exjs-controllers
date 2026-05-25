import { randomUUID } from 'node:crypto'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import pino, { type Logger } from 'pino'

import {
  ensureHttpContext,
  type Handler,
  type HttpRequest,
  type HttpResponse,
} from '#exjs-controllers/http/httpTypes'
import {
  runWithRequestLoggerContext,
  setBaseLogger,
} from '#exjs-controllers/logging/logger'

const DEFAULT_CORRELATION_ID_HEADER = 'x-correlation-id'
const DEFAULT_LOG_FORMAT = 'json'

export type HttpLogFormat = 'json' | 'pretty'

export interface LogStream {
  write: (chunk: string) => boolean | void
}

export interface HttpRequestLogPayload {
  requestMethod: string
  requestUrl: string
  requestSize: string
  status: string
  userAgent: string
  serverIp: string
  referrer: string
}

export interface HttpLogPayload {
  correlationId: string
  traceId?: string
  spanId?: string
  httpRequest: HttpRequestLogPayload
}

export interface HttpLoggerOptions {
  logger?: Logger
  genCorrelationId?: () => string
  correlationIdHeaderName?: string
  logFormat?: HttpLogFormat
  stream?: LogStream
  filePath?: string
}

export function createHttpLoggerMiddleware(
  options: HttpLoggerOptions = {},
): Handler {
  const logger = options.logger ?? createDefaultLogger(options)
  const genCorrelationId = options.genCorrelationId ?? randomUUID
  const correlationIdHeaderName =
    options.correlationIdHeaderName ?? DEFAULT_CORRELATION_ID_HEADER

  setBaseLogger(logger)

  return (request, response, next) => {
    const ctx = ensureHttpContext(request, response)
    const correlationId = resolveCorrelationId(
      ctx.request,
      correlationIdHeaderName,
      genCorrelationId,
    )
    const requestContext = {
      correlationId,
      logger: logger.child({ correlationId }),
    }

    ctx.response.setHeader('x-correlation-id', correlationId)

    const writeLog = () => {
      requestContext.logger.info(
        buildHttpLogPayload(ctx.request, ctx.response, correlationId),
      )
    }

    ctx.response.once('close', writeLog)

    void runWithRequestLoggerContext(requestContext, async () => {
      next()
    })
  }
}

function createDefaultLogger(options: HttpLoggerOptions): Logger {
  const logFormat = options.logFormat ?? DEFAULT_LOG_FORMAT
  const fileStream = options.filePath
    ? createFileStream(options.filePath)
    : undefined

  if (logFormat === 'pretty') {
    return pino(
      {},
      createCompositeStream(
        createPrettyStream(options.stream ?? process.stdout),
        fileStream,
      ),
    )
  }

  if (options.stream) {
    return pino({}, createCompositeStream(options.stream, fileStream))
  }

  if (fileStream) {
    return pino({}, createCompositeStream(process.stdout, fileStream))
  }

  return pino()
}

function createFileStream(filePath: string): LogStream {
  mkdirSync(dirname(filePath), { recursive: true })

  return {
    write(chunk: string) {
      appendFileSync(filePath, chunk)
      return true
    },
  }
}

function createCompositeStream(
  ...destinations: Array<LogStream | undefined>
): LogStream {
  const activeDestinations = destinations.filter(
    (destination): destination is LogStream => Boolean(destination),
  )

  return {
    write(chunk: string) {
      let atLeastOneWriteSucceeded = false

      for (const destination of activeDestinations) {
        const result = destination.write(chunk)
        atLeastOneWriteSucceeded = result !== false || atLeastOneWriteSucceeded
      }

      return atLeastOneWriteSucceeded
    },
  }
}

function createPrettyStream(destination: LogStream): LogStream {
  return {
    write(chunk: string) {
      const line = formatPrettyLog(chunk)
      return destination.write(line)
    },
  }
}

function formatPrettyLog(chunk: string): string {
  const trimmedChunk = chunk.trim()
  if (!trimmedChunk) {
    return chunk
  }

  try {
    const payload = JSON.parse(trimmedChunk) as Record<string, unknown>
    return `${buildPrettyLine(payload)}\n`
  } catch {
    return chunk
  }
}

function buildPrettyLine(payload: Record<string, unknown>): string {
  const time =
    typeof payload.time === 'number'
      ? new Date(payload.time).toISOString()
      : undefined
  const level = getLevelLabel(payload.level)
  const correlationId =
    typeof payload.correlationId === 'string' ? payload.correlationId : undefined
  const traceId = typeof payload.traceId === 'string' ? payload.traceId : undefined
  const spanId = typeof payload.spanId === 'string' ? payload.spanId : undefined
  const httpRequest = isHttpRequestPayload(payload.httpRequest)
    ? payload.httpRequest
    : undefined
  const msg = typeof payload.msg === 'string' ? payload.msg : undefined

  const extraEntries = Object.entries(payload).filter(
    ([key]) =>
      key !== 'level' &&
      key !== 'time' &&
      key !== 'pid' &&
      key !== 'hostname' &&
      key !== 'correlationId' &&
      key !== 'traceId' &&
      key !== 'spanId' &&
      key !== 'httpRequest' &&
      key !== 'msg',
  )

  if (httpRequest) {
    return buildPrettyHttpRequestBlock({
      time,
      level,
      correlationId,
      traceId,
      spanId,
      httpRequest,
      extraEntries,
    })
  }

  return buildPrettyGenericBlock({
    time,
    level,
    correlationId,
    traceId,
    spanId,
    msg,
    extraEntries,
  })
}

function buildPrettyHttpRequestBlock(input: {
  time?: string
  level: string
  correlationId?: string
  traceId?: string
  spanId?: string
  httpRequest: HttpRequestLogPayload
  extraEntries: [string, unknown][]
}): string {
  const lines = [
    buildPrettyHeader(input.time, input.level, 'HTTP Request'),
    `  correlationId: ${input.correlationId ?? '-'}`,
    `  traceId: ${input.traceId ?? '-'}`,
    `  spanId: ${input.spanId ?? '-'}`,
    `  request: ${input.httpRequest.requestMethod} ${input.httpRequest.requestUrl}`,
    `  status: ${input.httpRequest.status}`,
    `  size: ${formatPrettySize(input.httpRequest.requestSize)}`,
    `  userAgent: ${input.httpRequest.userAgent}`,
    `  serverIp: ${input.httpRequest.serverIp}`,
    `  referrer: ${input.httpRequest.referrer}`,
  ]

  if (input.extraEntries.length > 0) {
    lines.push(`  extra: ${JSON.stringify(Object.fromEntries(input.extraEntries))}`)
  }

  return lines.join('\n')
}

function buildPrettyGenericBlock(input: {
  time?: string
  level: string
  correlationId?: string
  traceId?: string
  spanId?: string
  msg?: string
  extraEntries: [string, unknown][]
}): string {
  const lines = [buildPrettyHeader(input.time, input.level, 'Log')]

  if (input.correlationId) {
    lines.push(`  correlationId: ${input.correlationId}`)
  }

  if (input.traceId) {
    lines.push(`  traceId: ${input.traceId}`)
  }

  if (input.spanId) {
    lines.push(`  spanId: ${input.spanId}`)
  }

  if (input.msg) {
    lines.push(`  message: ${input.msg}`)
  }

  if (input.extraEntries.length > 0) {
    lines.push(`  extra: ${JSON.stringify(Object.fromEntries(input.extraEntries))}`)
  }

  return lines.join('\n')
}

function buildPrettyHeader(
  time: string | undefined,
  level: string,
  title: string,
): string {
  return `${time ?? '-'} [${level}] ${title}`
}

function formatPrettySize(size: string): string {
  const parsed = Number.parseInt(size, 10)
  if (!Number.isFinite(parsed)) {
    return size
  }

  if (parsed < 1024) {
    return `${parsed} B`
  }

  if (parsed < 1024 * 1024) {
    return `${(parsed / 1024).toFixed(1)} KB`
  }

  return `${(parsed / (1024 * 1024)).toFixed(1)} MB`
}

function getLevelLabel(level: unknown): string {
  switch (level) {
    case 10:
      return 'TRACE'
    case 20:
      return 'DEBUG'
    case 30:
      return 'INFO'
    case 40:
      return 'WARN'
    case 50:
      return 'ERROR'
    case 60:
      return 'FATAL'
    default:
      return 'INFO'
  }
}

function isHttpRequestPayload(value: unknown): value is HttpRequestLogPayload {
  return typeof value === 'object' && value !== null
}

function buildHttpLogPayload(
  request: HttpRequest,
  response: HttpResponse,
  correlationId: string,
): HttpLogPayload {
  return {
    correlationId,
    httpRequest: {
      requestMethod: request.method || 'GET',
      requestUrl: request.url || request.path,
      requestSize: resolveRequestSize(request),
      status: String(response.statusCode),
      userAgent: getRequestHeader(request, 'user-agent'),
      serverIp: response.socket?.localAddress ?? request.ip ?? '-',
      referrer: getRequestHeader(request, 'referer', 'referrer'),
    },
  }
}

function resolveCorrelationId(
  request: HttpRequest,
  correlationIdHeaderName: string,
  genCorrelationId: () => string,
): string {
  return (
    getHeaderValue(request.get(correlationIdHeaderName)) ??
    getHeaderValue(request.get('x-request-id')) ??
    getHeaderValue(request.get('x-transaction-id')) ??
    genCorrelationId()
  )
}

function resolveRequestSize(request: HttpRequest): string {
  const contentLength = getHeaderValue(request.get('content-length'))
  if (contentLength) {
    return contentLength
  }

  if (typeof request.body === 'string') {
    return Buffer.byteLength(request.body).toString()
  }

  if (request.body && typeof request.body === 'object') {
    return Buffer.byteLength(JSON.stringify(request.body)).toString()
  }

  return '0'
}

function getRequestHeader(request: HttpRequest, ...names: string[]): string {
  for (const name of names) {
    const value = getHeaderValue(request.get(name))
    if (value) {
      return value
    }
  }

  return '-'
}

function getHeaderValue(
  value: string | string[] | number | undefined,
): string | undefined {
  if (value === undefined) {
    return undefined
  }

  return Array.isArray(value) ? value.join(', ') : String(value)
}
