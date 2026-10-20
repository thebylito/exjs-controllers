import { randomUUID } from 'node:crypto'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import pino, { type Level, type Logger } from 'pino'

import {
  ensureHttpContext,
  type Handler,
  type HttpRequest,
  type HttpResponse,
} from '#exjs-controllers/http/httpTypes'
import {
  buildPinoOptions,
  type LogLevelFormat,
  type RequestLogContext,
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
  remoteIp: string
  serverIp: string
  referrer: string
}

export interface HttpLogPayload {
  /**
   * Injetado pelos bindings do child logger por request (ver
   * {@link createHttpLoggerMiddleware}); não deve ser repetido no payload para
   * evitar a chave `correlationId` duplicada no JSON emitido.
   */
  correlationId?: string
  traceId?: string
  spanId?: string
  httpRequest: HttpRequestLogPayload
}

export interface HttpLoggerOptions {
  logger?: Logger
  genCorrelationId?: () => string
  correlationIdHeaderName?: string
  logFormat?: HttpLogFormat
  /**
   * Como serializar o nível do log. `number` (padrão) mantém o código numérico
   * do Pino (`"level":30`); `label` emite a string (`"level":"info"`).
   * Veja {@link LogLevelFormat}.
   */
  levelFormat?: LogLevelFormat
  /**
   * Nível mínimo de log do Pino (`trace`/`debug`/`info`/`warn`/`error`/`fatal`).
   * Omitido, usa o default do Pino (`info`). Ignorado quando `logger` é
   * fornecido — nesse caso o nível vem do logger já construído pelo caller.
   */
  level?: Level
  stream?: LogStream
  filePath?: string
  /**
   * Headers (minúsculos) que um proxy de borda confiável preenche com o IP do
   * cliente (ex.: `cf-connecting-ip`); o primeiro presente vence. Qualquer
   * cliente pode forjar esses headers, então só configure se a borda os
   * sobrescreve. Padrão: `[]`.
   */
  remoteIpHeaders?: string[]
  /**
   * Incluir a query string em `requestUrl` e `referrer`. Query strings podem
   * carregar tokens e dados pessoais, então ficam fora por padrão.
   * Padrão: `false`.
   */
  logQueryString?: boolean
}

export const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/

export function createHttpLoggerMiddleware(
  options: HttpLoggerOptions = {},
): Handler {
  const logger = options.logger ?? createDefaultLogger(options)
  const genCorrelationId = options.genCorrelationId ?? randomUUID
  const correlationIdHeaderName =
    options.correlationIdHeaderName ?? DEFAULT_CORRELATION_ID_HEADER
  const remoteIpHeaders = (options.remoteIpHeaders ?? []).map((name) =>
    name.toLowerCase(),
  )
  const logQueryString = options.logQueryString ?? false

  setBaseLogger(logger)

  return (request, response, next) => {
    const ctx = ensureHttpContext(request, response)
    // Capturados na entrada: após um abort do cliente, no `close` o socket já
    // não tem endereço e `request.ip` vira `undefined`.
    const addresses: LoggedAddresses = {
      remoteIp: resolveRemoteIp(ctx.request, remoteIpHeaders),
      serverIp: ctx.response.socket?.localAddress ?? ctx.request.ip ?? '-',
    }
    const correlationId = resolveCorrelationId(
      ctx.request,
      correlationIdHeaderName,
      genCorrelationId,
    )
    const requestContext: RequestLogContext = {
      correlationId,
      logger: logger.child({ correlationId }),
    }

    ctx.response.setHeader('x-correlation-id', correlationId)

    // Roda num listener de `close`, fora do caminho de erros do Express: uma
    // exceção aqui derrubaria o processo, então nunca pode propagar.
    const writeLog = () => {
      try {
        requestContext.logger.info(
          buildHttpLogPayload(
            ctx.request,
            ctx.response,
            requestContext,
            addresses,
            logQueryString,
          ),
        )
      } catch (err) {
        // O próprio stream pode estar lançando (ENOSPC, stream customizado):
        // o aviso também não pode escapar do listener.
        try {
          requestContext.logger.warn(
            { err },
            '[httpLogger] failed to write the access log',
          )
        } catch {
          // nunca propaga
        }
      }
    }

    ctx.response.once('close', writeLog)

    void runWithRequestLoggerContext(requestContext, async () => {
      next()
    })
  }
}

function createDefaultLogger(options: HttpLoggerOptions): Logger {
  const logFormat = options.logFormat ?? DEFAULT_LOG_FORMAT
  const pinoOptions = buildPinoOptions(options.levelFormat, options.level)
  const fileStream = options.filePath
    ? createFileStream(options.filePath)
    : undefined

  if (logFormat === 'pretty') {
    return pino(
      pinoOptions,
      createCompositeStream(
        createPrettyStream(options.stream ?? process.stdout),
        fileStream,
      ),
    )
  }

  if (options.stream) {
    return pino(pinoOptions, createCompositeStream(options.stream, fileStream))
  }

  if (fileStream) {
    return pino(pinoOptions, createCompositeStream(process.stdout, fileStream))
  }

  return pino(pinoOptions)
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
    `  remoteIp: ${input.httpRequest.remoteIp}`,
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
  if (typeof level === 'string') {
    return level.toUpperCase()
  }

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

interface LoggedAddresses {
  remoteIp: string
  serverIp: string
}

function buildHttpLogPayload(
  request: HttpRequest,
  response: HttpResponse,
  context: Pick<RequestLogContext, 'traceId' | 'spanId'>,
  addresses: LoggedAddresses,
  logQueryString: boolean,
): HttpLogPayload {
  return {
    ...(context.traceId ? { traceId: context.traceId } : {}),
    ...(context.spanId ? { spanId: context.spanId } : {}),
    httpRequest: {
      requestMethod: request.method || 'GET',
      requestUrl: resolveRequestUrl(request, logQueryString),
      requestSize: resolveRequestSize(request),
      status: String(response.statusCode),
      userAgent: getRequestHeader(request, 'user-agent'),
      remoteIp: addresses.remoteIp,
      serverIp: addresses.serverIp,
      referrer: resolveReferrer(request, logQueryString),
    },
  }
}

function resolveCorrelationId(
  request: HttpRequest,
  correlationIdHeaderName: string,
  genCorrelationId: () => string,
): string {
  // Valores fora do padrão (tamanho, caracteres de controle) são tratados como
  // ausentes, evitando log injection e response splitting via header.
  for (const headerName of [
    correlationIdHeaderName,
    'x-request-id',
    'x-transaction-id',
  ]) {
    const value = getHeaderValue(request.get(headerName))
    if (value !== undefined && CORRELATION_ID_PATTERN.test(value)) {
      return value
    }
  }

  return genCorrelationId()
}

function resolveRemoteIp(
  request: HttpRequest,
  remoteIpHeaders: string[],
): string {
  // Só headers que o integrador declarou como preenchidos por um proxy de
  // borda confiável: qualquer outro pode ser forjado pelo cliente.
  const edgeClientIp =
    remoteIpHeaders.length > 0
      ? getRequestHeader(request, ...remoteIpHeaders)
      : '-'
  if (edgeClientIp !== '-') {
    return edgeClientIp
  }

  // Sem fallback para o X-Forwarded-For cru: `request.ip` já o respeita quando
  // `trust proxy` está configurado; fora disso ele é forjável pelo cliente.
  return request.ip || request.socket?.remoteAddress || '-'
}

function resolveRequestSize(request: HttpRequest): string {
  // Só o Content-Length declarado; sem ele o tamanho é desconhecido ('-').
  // Nunca serializa `request.body`: com multipart ele pode ser enorme/esparso.
  return getHeaderValue(request.get('content-length')) || '-'
}

function stripQueryString(value: string): string {
  const cut = value.search(/[?#]/)
  return cut === -1 ? value : value.slice(0, cut)
}

function resolveRequestUrl(
  request: HttpRequest,
  logQueryString: boolean,
): string {
  const url = request.originalUrl || request.url || request.path
  return logQueryString ? url : stripQueryString(url)
}

function resolveReferrer(
  request: HttpRequest,
  logQueryString: boolean,
): string {
  const referrer = getRequestHeader(request, 'referer', 'referrer')
  return logQueryString ? referrer : stripQueryString(referrer)
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
