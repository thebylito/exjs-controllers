import { STATUS_CODES } from 'node:http'

import type { ErrorMiddleware } from '#exjs-controllers/http/httpTypes'

export interface ErrorResponseBody {
  error: string
  message: string
  issues?: unknown
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asHttpStatus(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 400 && value <= 599
    ? value
    : undefined
}

/**
 * Resolve o status HTTP de um erro: MulterError (413 para LIMIT_FILE_SIZE, 400
 * para os demais), depois `status`/`statusCode` inteiros em 400..599; senão 500.
 */
export function resolveErrorStatus(error: unknown): number {
  if (!isObject(error)) return 500
  if (error.name === 'MulterError') {
    return error.code === 'LIMIT_FILE_SIZE' ? 413 : 400
  }
  return asHttpStatus(error.status) ?? asHttpStatus(error.statusCode) ?? 500
}

/**
 * Error handler padrão: corpo JSON com mensagem fixa para 5xx (sem stack,
 * causa, nome da classe ou `issues`) e a mensagem do erro (e `issues`) para 4xx.
 */
export function createDefaultErrorHandler(): ErrorMiddleware {
  return function defaultErrorHandler(error, _request, response, next) {
    if (response.headersSent) {
      next(error)
      return
    }

    const status = resolveErrorStatus(error)
    const source = isObject(error) ? error : {}
    const rawMessage = typeof source.message === 'string' ? source.message : ''
    const message =
      status >= 500 ? 'Internal Server Error' : rawMessage || STATUS_CODES[status] || 'Error'

    const body: ErrorResponseBody = {
      error: STATUS_CODES[status] ?? 'Error',
      message,
      // `issues` só em 4xx: num 5xx (ex.: ZodError cru) revelaria campos internos.
      ...(status < 500 && Array.isArray(source.issues) ? { issues: source.issues } : {}),
    }
    response.status(status).json(body)
  }
}
