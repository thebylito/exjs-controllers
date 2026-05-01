import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express'

export interface HttpLocals extends Record<string, unknown> {}

export type HttpRequest = Request & {
  locals: HttpLocals
  cookies: Record<string, string>
}

export type HttpResponse = Response
export type Handler = RequestHandler
export type ErrorMiddleware = ErrorRequestHandler

export function ensureHttpContext(
  request: Request,
  response: Response,
): { request: HttpRequest; response: HttpResponse } {
  const httpRequest = request as HttpRequest
  const httpResponse = response as HttpResponse & { locals?: HttpLocals }

  httpResponse.locals ??= {}
  httpRequest.locals = httpResponse.locals as HttpLocals
  httpRequest.cookies ??= {}

  return {
    request: httpRequest,
    response: httpResponse,
  }
}
